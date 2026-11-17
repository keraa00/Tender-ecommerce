/**
 * Seeds the demo stores in `seed-catalog.ts` with real catalogues, and a year
 * of orders from the customers in `seed-orders.ts`.
 *
 * Idempotent: every write is an upsert keyed on a natural composite key, so
 * running it repeatedly converges rather than duplicating. It never drops
 * tables — use `prisma migrate reset` if you want a clean slate.
 *
 *   npm run db:seed
 *
 * If SUPABASE_SERVICE_ROLE_KEY and SEED_PASSWORD are set, the seller accounts
 * and the platform admin are created in Supabase Auth as well, so you can
 * actually log in as them — and accounts that already exist are moved onto
 * SEED_PASSWORD, so changing it and reseeding rotates every demo login. Without
 * them the rows still exist in `public.users` (so the storefronts work), they
 * just have no credentials behind them.
 *
 * The password is read from the environment, never from this repo: a password
 * committed here is a password published to anyone who can read the repo.
 *
 * With the key, photos from Wikimedia are also copied into each store's
 * storage prefix on first seed (a few minutes: Wikimedia paces downloads) and
 * served from there — see `mirrorStoreImages`.
 */

import "dotenv/config";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";

import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { regionName } from "../src/lib/address/regions";
import type { PostalAddress } from "../src/lib/address/types";
import { calculatePlatformFee } from "../src/lib/money";
import { codAvailability, codSettingsOf } from "../src/lib/payments/cod";
import { PRODUCT_IMAGE_BUCKET } from "../src/lib/products/constants";
import { chooseRate, eligibleRates, zoneFor, type ZoneRule } from "../src/lib/shipping/rates";
import {
  PLATFORM_ADMIN,
  SEED_STORES,
  type SeedCod,
  type SeedDiscount,
  type SeedStore,
  type SeedZone,
} from "./seed-catalog";
import { SEED_ORDERS, defaultOrderStatus, type SeedOrder } from "./seed-orders";

type SeedImage = {
  url: string;
  altText: string;
  creator: string | null;
  license: string;
  sourceUrl: string | null;
};

/**
 * Fixed ids so reseeding is stable when Supabase Auth is not configured. When
 * it is, the real auth user id wins — these are only the offline fallback.
 */
const FALLBACK_USER_IDS: Record<string, string> = {
  "admin@example.com": "00000000-0000-4000-8000-000000000001",
  "nordhavn@example.com": "00000000-0000-4000-8000-000000000002",
  "rosewater@example.com": "00000000-0000-4000-8000-000000000003",
  "wildmoor@example.com": "00000000-0000-4000-8000-000000000004",
  "halden@example.com": "00000000-0000-4000-8000-000000000005",
  "marlowe@example.com": "00000000-0000-4000-8000-000000000006",
  "bakar@example.com": "00000000-0000-4000-8000-000000000007",
  "kehre@example.com": "00000000-0000-4000-8000-000000000008",
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set.");

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

async function loadImages(): Promise<Record<string, SeedImage[]>> {
  try {
    const raw = await readFile(
      new URL("./seed-images.json", import.meta.url),
      "utf8",
    );
    return (JSON.parse(raw) as { images: Record<string, SeedImage[]> }).images;
  } catch {
    console.warn(
      "! prisma/seed-images.json not found — seeding without photography.\n" +
        "  Run `npm run seed:images` to fetch it.",
    );
    return {};
  }
}

/**
 * Hosts whose pictures are copied into the store's own storage rather than
 * linked. Wikimedia throttles scripted fetches — next/image's among them — and
 * a throttled fetch is a broken picture on the storefront. Copied, they are
 * served from the bucket sellers upload to, under the store's own prefix.
 */
const MIRRORED_HOSTS = new Set(["upload.wikimedia.org"]);
/** Seller uploads are named by UUID, so this prefix marks the seed's copies. */
const MIRROR_PREFIX = "seed-";
const MIRROR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};
const DOWNLOAD_SPACING_MS = 1_500;
const DOWNLOAD_ATTEMPTS = 5;
/** The bucket's own limit (scripts/setup-storage.ts). */
const MAX_COPY_BYTES = 5 * 1024 * 1024;
/**
 * Wikimedia's robot policy asks scripted clients for a name and a way to reach
 * whoever runs them, and throttles the ones that give neither.
 */
const USER_AGENT = "TenderSeed/1.0 (https://github.com/keraa00/Tender-ecommerce; demo seed data)";

let lastDownloadAt = 0;

/** One file from a throttled host, paced and retried as it asks. */
async function download(url: string): Promise<{ body: ArrayBuffer; type: string } | null> {
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    await sleep(Math.max(0, lastDownloadAt + DOWNLOAD_SPACING_MS - Date.now()));
    lastDownloadAt = Date.now();

    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);

    if (response?.ok) {
      const type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
      return { body: await response.arrayBuffer(), type };
    }
    if (response && response.status !== 429 && response.status < 500) return null;

    const retryAfter = Number(response?.headers.get("retry-after")) || 15 * attempt;
    await sleep(Math.min(retryAfter, 120) * 1000);
  }
  return null;
}

/**
 * Some manifest entries are a Commons original, which can run to 20MB. Its
 * 1280px rendition — a size Wikimedia keeps cached — is tried first; an
 * original narrower than that has none, and is fetched as it is.
 */
async function downloadForCopy(url: string): Promise<{ body: ArrayBuffer; type: string } | null> {
  const original = /^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/([0-9a-f]\/[0-9a-f]{2})\/([^/]+)$/.exec(url);
  const file =
    (original && (await download(`${original[1]}/thumb/${original[2]}/${original[3]}/1280px-${original[3]}`))) ||
    (await download(url));
  return file && file.body.byteLength <= MAX_COPY_BYTES ? file : null;
}

/**
 * Copies a store's pictures from `MIRRORED_HOSTS` into its storage prefix and
 * returns where each is served from: its copy, or null for one that could not
 * be copied — linked, it would be a broken picture, so it is left off until a
 * later seed copies it. A copy is named after its source, so a reseed finds it
 * and downloads nothing; copies the catalogue no longer uses are removed.
 * Without a service-role key nothing can be copied, and pictures stay linked.
 */
async function mirrorStoreImages(
  storeId: string,
  urls: string[],
): Promise<(url: string) => string | null> {
  const mirrored = new Map<string, string>();
  const admin = supabaseAdmin();
  const wanted = [...new Set(urls)].filter((url) => MIRRORED_HOSTS.has(new URL(url).hostname));
  const served = (url: string) =>
    mirrored.get(url) ?? (admin && MIRRORED_HOSTS.has(new URL(url).hostname) ? null : url);
  if (!admin) return served;

  const bucket = admin.storage.from(PRODUCT_IMAGE_BUCKET);
  const { data: listed, error } = await bucket.list(storeId, { limit: 1000, search: MIRROR_PREFIX });
  if (error) {
    console.warn(`! could not list ${storeId}/ in storage: ${error.message} — leaving those photos off`);
    return served;
  }
  // By name without its extension, which only the download reveals.
  const existing = new Map(
    (listed ?? [])
      .filter((file) => file.name.startsWith(MIRROR_PREFIX))
      .map((file) => [file.name.replace(/\.[a-z0-9]+$/, ""), file.name]),
  );

  const kept = new Set<string>();
  let copied = 0;
  for (const url of wanted) {
    const base = `${MIRROR_PREFIX}${createHash("sha256").update(url).digest("hex").slice(0, 24)}`;
    let name = existing.get(base);

    if (!name) {
      const file = await downloadForCopy(url);
      const extension = file ? MIRROR_TYPES[file.type] : undefined;
      if (!file || !extension) {
        console.warn(`! could not copy ${url} — left off for now; reseed to retry`);
        continue;
      }
      name = `${base}.${extension}`;
      const { error: uploadError } = await bucket.upload(`${storeId}/${name}`, file.body, {
        contentType: file.type,
        // Named after its source, so it never changes under that name.
        cacheControl: "31536000",
        upsert: true,
      });
      if (uploadError) {
        console.warn(`! could not upload ${url}: ${uploadError.message} — left off for now`);
        continue;
      }
      copied += 1;
    }

    kept.add(name);
    mirrored.set(url, bucket.getPublicUrl(`${storeId}/${name}`).data.publicUrl);
  }

  const stale = [...existing.values()].filter((name) => !kept.has(name));
  if (stale.length > 0) {
    await bucket.remove(stale.map((name) => `${storeId}/${name}`));
  }
  const missing = wanted.length - mirrored.size;
  if (copied > 0 || stale.length > 0 || missing > 0) {
    console.log(
      `    photos: ${copied} copied into storage, ${stale.length} removed` +
        (missing > 0 ? `, ${missing} left off (reseed to retry)` : ""),
    );
  }
  return served;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** The demo accounts' password, from `.env`. Null leaves Auth credentials alone. */
function seedPassword(): string | null {
  return process.env.SEED_PASSWORD?.trim() || null;
}

/**
 * Returns the id to use for a demo account, creating it in Supabase Auth when
 * a service-role key and SEED_PASSWORD are available. Already-registered
 * accounts are looked up rather than treated as an error, which is what makes
 * reseeding safe — and are moved onto SEED_PASSWORD, so a reseed rotates them.
 */
async function resolveUserId(email: string, name: string): Promise<string> {
  const admin = supabaseAdmin();
  const fallback = FALLBACK_USER_IDS[email];
  const password = seedPassword();

  if (!admin) return fallback;

  if (password) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (!error && data.user) return data.user.id;
  }

  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((user) => user.email === email);

  if (existing) {
    if (password) {
      const { error } = await admin.auth.admin.updateUserById(existing.id, { password });
      if (error) console.warn(`! could not set the password of ${email}: ${error.message}`);
    }
    return existing.id;
  }

  if (password) console.warn(`! could not provision ${email} in Supabase Auth`);
  return fallback;
}

async function upsertUser(
  email: string,
  name: string,
  platformRole: "USER" | "PLATFORM_ADMIN" = "USER",
) {
  const id = await resolveUserId(email, name);

  return db.user.upsert({
    where: { email },
    create: { id, email, name, platformRole },
    update: { name, platformRole },
  });
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

/** A catalogue's cash-on-delivery settings, as the store's columns. */
function codColumns(cod: SeedCod) {
  return {
    codEnabled: true,
    codLabel: cod.label ?? null,
    codInstructions: cod.instructions ?? null,
    codFeeType: cod.fee.type,
    codFeeValue: cod.fee.value,
    codMinTotalCents: cod.minTotalCents ?? null,
    codMaxTotalCents: cod.maxTotalCents ?? null,
    codCountryCodes: cod.countries ?? [],
    codRequirePhone: cod.requirePhone ?? true,
  };
}

async function seedStore(store: SeedStore, images: Record<string, SeedImage[]>) {
  const owner = await upsertUser(store.owner.email, store.owner.name);

  const banner = images[`store:${store.slug}:banner`]?.[0];
  const logo = images[`store:${store.slug}:logo`]?.[0];

  const settings = {
    currency: store.currency,
    contactEmail: store.contactEmail,
    checkoutPhone: store.checkout.phone,
    checkoutCompany: store.checkout.company,
    checkoutFirstName: store.checkout.firstName,
    checkoutAddress2: store.checkout.address2,
    checkoutMarketingOptIn: store.checkout.marketingOptIn,
    checkoutOrderNote: store.checkout.orderNote,
    // Only where the catalogue says: a seller who set up cash on delivery
    // by hand keeps it.
    ...(store.cod ? codColumns(store.cod) : {}),
    // The demo stores are what the landing page shows.
    featured: true,
  } satisfies Prisma.StoreUncheckedUpdateInput;

  const record = await db.store.upsert({
    where: { slug: store.slug },
    create: {
      slug: store.slug,
      name: store.name,
      description: store.description,
      ...settings,
      accentColor: store.accentColor,
      bannerUrl: banner?.url ?? null,
      logoUrl: logo?.url ?? null,
      commissionBps: store.commissionBps,
      ownerId: owner.id,
      // No connected account: demo stores browse fine but cannot check out
      // until their owner connects a test-mode Stripe account from
      // Settings → Payments, exactly like a real seller.
      status: "ACTIVE",
    },
    update: {
      name: store.name,
      description: store.description,
      ...settings,
      accentColor: store.accentColor,
      bannerUrl: banner?.url ?? null,
      logoUrl: logo?.url ?? null,
      commissionBps: store.commissionBps,
      ownerId: owner.id,
    },
  });

  // Earlier seeds wrote placeholder `acct_seed_*` ids with every Stripe flag
  // set, which made demo stores look payable to a checkout that now really
  // charges. Clear them; a real connected account is left alone.
  await db.store.updateMany({
    where: { id: record.id, stripeAccountId: { startsWith: "acct_seed_" } },
    data: {
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
    },
  });

  await db.storeMember.upsert({
    where: { storeId_userId: { storeId: record.id, userId: owner.id } },
    create: { storeId: record.id, userId: owner.id, role: "OWNER" },
    update: { role: "OWNER" },
  });

  // Copied under the store's id, which only exists once the row does.
  const imagesOf = (product: SeedStore["products"][number]) =>
    images[product.imageFrom ?? `product:${store.slug}:${product.slug}`] ?? [];
  const served = await mirrorStoreImages(record.id, [
    ...[banner, logo].flatMap((image) => (image ? [image.url] : [])),
    ...store.products.flatMap((product) => imagesOf(product).map((image) => image.url)),
  ]);
  await db.store.update({
    where: { id: record.id },
    data: {
      bannerUrl: banner ? served(banner.url) : null,
      logoUrl: logo ? served(logo.url) : null,
    },
  });

  const collectionIds = new Map<string, string>();
  for (const collection of store.collections) {
    const saved = await db.collection.upsert({
      where: { storeId_slug: { storeId: record.id, slug: collection.slug } },
      create: {
        storeId: record.id,
        slug: collection.slug,
        title: collection.title,
        description: collection.description,
      },
      update: { title: collection.title, description: collection.description },
    });
    collectionIds.set(collection.slug, saved.id);
  }

  for (const product of store.products) {
    const saved = await db.product.upsert({
      where: { storeId_slug: { storeId: record.id, slug: product.slug } },
      create: {
        storeId: record.id,
        slug: product.slug,
        title: product.title,
        description: product.description,
        status: "ACTIVE",
        requiresShipping: product.requiresShipping ?? true,
      },
      update: {
        title: product.title,
        description: product.description,
        status: "ACTIVE",
        requiresShipping: product.requiresShipping ?? true,
      },
    });

    // Images are positional and small in number; replacing them wholesale is
    // simpler and cheaper than diffing.
    const productImages = imagesOf(product).flatMap((image) => {
      const url = served(image.url);
      return url ? [{ ...image, url }] : [];
    });
    await db.productImage.deleteMany({ where: { productId: saved.id } });
    if (productImages.length > 0) {
      await db.productImage.createMany({
        data: productImages.map((image, index) => ({
          productId: saved.id,
          url: image.url,
          altText: image.altText,
          position: index,
        })),
      });
    }

    for (const [index, variant] of product.variants.entries()) {
      await db.variant.upsert({
        where: { storeId_sku: { storeId: record.id, sku: variant.sku } },
        create: {
          storeId: record.id,
          productId: saved.id,
          title: variant.title,
          sku: variant.sku,
          priceCents: variant.priceCents,
          compareAtPriceCents: variant.compareAtPriceCents ?? null,
          inventoryQty: variant.inventoryQty,
          weightGrams: variant.weightGrams ?? product.weightGrams,
          position: index,
        },
        update: {
          productId: saved.id,
          title: variant.title,
          priceCents: variant.priceCents,
          compareAtPriceCents: variant.compareAtPriceCents ?? null,
          inventoryQty: variant.inventoryQty,
          weightGrams: variant.weightGrams ?? product.weightGrams,
          position: index,
        },
      });
    }

    for (const [index, slug] of product.collections.entries()) {
      const collectionId = collectionIds.get(slug);
      if (!collectionId) continue;

      await db.productOnCollection.upsert({
        where: {
          productId_collectionId: { productId: saved.id, collectionId },
        },
        create: { productId: saved.id, collectionId, position: index },
        update: { position: index },
      });
    }
  }

  for (const discount of store.discounts) {
    await seedDiscount(record.id, discount, collectionIds);
  }

  for (const [index, zone] of store.zones.entries()) {
    await seedZone(record.id, zone, index);
  }

  const productCount = store.products.length;
  const variantCount = store.products.reduce(
    (total, product) => total + product.variants.length,
    0,
  );
  const rateCount = store.zones.reduce((total, zone) => total + zone.rates.length, 0);
  console.log(
    `  ${store.name.padEnd(22)} ${productCount} products, ${variantCount} variants, ` +
      `${store.discounts.length} discounts, ${store.zones.length} shipping zones, ${rateCount} rates`,
  );
}

/**
 * A zone is matched on (storeId, name), its rates on (zone, position), so a
 * reseed updates them in place and their ids — which carts and orders link
 * to — stay put. Its countries are replaced: first taken from wherever they
 * sit in this store, since a country belongs to one zone and a seller may
 * have moved one since the last seed.
 */
async function seedZone(storeId: string, zone: SeedZone, position: number) {
  const restOfWorld = zone.restOfWorld ? true : null;
  const existing = restOfWorld
    ? await db.shippingZone.findUnique({
        where: { storeId_restOfWorld: { storeId, restOfWorld: true } },
        select: { id: true },
      })
    : await db.shippingZone.findFirst({
        where: { storeId, name: zone.name, restOfWorld: null },
        select: { id: true },
      });

  const saved = existing
    ? await db.shippingZone.update({
        where: { id: existing.id },
        data: { name: zone.name, position },
        select: { id: true },
      })
    : await db.shippingZone.create({
        data: { storeId, name: zone.name, restOfWorld, position },
        select: { id: true },
      });

  const countries = zone.countries.map((entry) =>
    typeof entry === "string"
      ? { countryCode: entry, regionCodes: [] as string[] }
      : { countryCode: entry.code, regionCodes: [...entry.regions] },
  );
  await db.shippingZoneCountry.deleteMany({
    where: {
      storeId,
      OR: [{ zoneId: saved.id }, { countryCode: { in: countries.map((c) => c.countryCode) } }],
    },
  });
  if (countries.length > 0) {
    await db.shippingZoneCountry.createMany({
      data: countries.map((country) => ({ ...country, storeId, zoneId: saved.id })),
    });
  }

  const rates = await db.shippingRate.findMany({
    where: { storeId, zoneId: saved.id },
    orderBy: { position: "asc" },
    select: { id: true, position: true },
  });

  for (const [index, rate] of zone.rates.entries()) {
    const data = {
      name: rate.name,
      priceCents: rate.priceCents,
      minDeliveryDays: rate.days?.[0] ?? null,
      maxDeliveryDays: rate.days?.[1] ?? null,
      minSubtotalCents: rate.subtotalCents?.[0] ?? null,
      maxSubtotalCents: rate.subtotalCents?.[1] ?? null,
      minWeightGrams: rate.weightGrams?.[0] ?? null,
      maxWeightGrams: rate.weightGrams?.[1] ?? null,
      position: index,
    } satisfies Prisma.ShippingRateUncheckedUpdateInput;

    const current = rates.find((entry) => entry.position === index);
    if (current) {
      await db.shippingRate.update({ where: { id: current.id }, data });
    } else {
      await db.shippingRate.create({ data: { storeId, zoneId: saved.id, ...data } });
    }
  }

  await db.shippingRate.deleteMany({
    where: { storeId, zoneId: saved.id, position: { gte: zone.rates.length } },
  });
}

/**
 * Discounts with a code are matched on (storeId, code), their real key, so a
 * retitled one is updated rather than duplicated. Automatic discounts have no
 * code — and a NULL never matches in a unique lookup — so they are matched on
 * (storeId, title).
 */
async function seedDiscount(
  storeId: string,
  discount: SeedDiscount,
  collectionIds: Map<string, string>,
) {
  const collection = (slug: string | undefined) => {
    if (!slug) return null;
    const id = collectionIds.get(slug);
    if (!id) throw new Error(`Seed discount "${discount.title}" names unknown collection "${slug}".`);
    return id;
  };

  const target = collection(discount.targetCollection);
  const buyFrom = collection(discount.buy?.fromCollection);
  const segments = discount.segments ?? [];

  // Typed against the generated input, so a field the schema no longer has is
  // a compile error here rather than a runtime one on the next reseed.
  const data = {
    code: discount.code,
    title: discount.title,
    type: discount.type,
    value: discount.value,
    minSubtotalCents: discount.minSubtotalCents ?? null,
    minQuantity: discount.minQuantity ?? null,
    appliesTo: discount.appliesTo ?? "ALL",
    buysFrom: discount.buy ? (buyFrom ? "COLLECTION" : "ALL") : null,
    buyQuantity: discount.buy?.quantity ?? null,
    getQuantity: discount.buy?.getQuantity ?? null,
    maxUsesPerOrder: discount.buy?.maxUsesPerOrder ?? null,
    eligibility: segments.length > 0 ? "SEGMENTS" : "ALL",
    segments,
    usageLimit: discount.usageLimit ?? null,
    perCustomerLimit: discount.perCustomerLimit ?? null,
    combinable: discount.combinable ?? false,
    ...(discount.startsAt ? { startsAt: new Date(discount.startsAt) } : {}),
    endsAt: discount.endsAt ? new Date(discount.endsAt) : null,
    active: discount.active ?? true,
  } satisfies Prisma.DiscountUncheckedUpdateInput;

  const links = [
    ...(target ? [{ collectionId: target, role: "DISCOUNTED" as const }] : []),
    ...(buyFrom ? [{ collectionId: buyFrom, role: "QUALIFYING" as const }] : []),
  ];

  const existing = await db.discount.findFirst({
    where: discount.code
      ? { storeId, code: discount.code }
      : { storeId, code: null, title: discount.title },
    select: { id: true },
  });

  const saved = existing
    ? await db.discount.update({ where: { id: existing.id }, data, select: { id: true } })
    : await db.discount.create({ data: { storeId, ...data }, select: { id: true } });

  await db.discountCollection.deleteMany({ where: { discountId: saved.id } });
  if (links.length > 0) {
    await db.discountCollection.createMany({
      data: links.map((link) => ({ ...link, discountId: saved.id })),
    });
  }
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A fixed id for a seeded order, derived from its key, so a reseed updates the
 * order it wrote last time instead of adding another. Orders have no natural
 * key to upsert on: the number is handed out by the store's counter.
 */
function seedOrderId(key: string): string {
  const hex = createHash("sha256").update(`tender-seed-order:${key}`).digest("hex");
  // Version 4 and RFC 4122 variant bits, so it is a well-formed UUID.
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** What a whole-order code takes off, rounded as the discount engine rounds. */
function orderDiscountCents(
  discount: { code: string | null; type: string; value: number },
  subtotalCents: number,
): number {
  switch (discount.type) {
    case "PERCENTAGE":
      return Math.round((subtotalCents * discount.value) / 10_000);
    case "FIXED_AMOUNT":
      return Math.min(discount.value, subtotalCents);
    default:
      throw new Error(`Seed orders apply percentage and fixed-amount codes only, not ${discount.code}.`);
  }
}

/**
 * Splits an order's discount across its lines by each line's share of the
 * subtotal, the rounding remainder on the last, so the lines add up to the
 * order as they do on a real one.
 */
function splitAcrossLines(discountCents: number, lineTotals: number[]): number[] {
  const subtotal = lineTotals.reduce((sum, cents) => sum + cents, 0);
  const shares = lineTotals.map((cents) => Math.floor((discountCents * cents) / subtotal));
  shares[shares.length - 1] += discountCents - shares.reduce((sum, cents) => sum + cents, 0);
  return shares;
}

/**
 * Runs after every store is seeded, because the demo owners shop at each
 * other's stores and a signed-in order needs its account to exist.
 *
 * Prices come from the variants as seeded, and inventory is left alone: these
 * are history, not sales happening now.
 *
 * Cash on delivery is judged against the catalogue's settings, not the
 * store's columns, so a seller who switched it on by hand does not find their
 * card history rewritten as cash.
 */
async function seedOrders(store: SeedStore) {
  const orders = SEED_ORDERS[store.slug] ?? [];
  if (orders.length === 0) return;

  const record = await db.store.findUniqueOrThrow({
    where: { slug: store.slug },
    select: { id: true, commissionBps: true, stripeAccountId: true, currency: true },
  });
  const codSettings = store.cod ? codSettingsOf(codColumns(store.cod)) : null;
  const customers = new Set<string>();
  let cashOrders = 0;

  const zones: ZoneRule[] = (
    await db.shippingZone.findMany({
      where: { storeId: record.id },
      orderBy: { position: "asc" },
      include: { countries: true, rates: true },
    })
  ).map((zone) => ({ ...zone, restOfWorld: zone.restOfWorld === true }));

  const variants = new Map(
    (
      await db.variant.findMany({
        where: { storeId: record.id, sku: { in: orders.flatMap((order) => order.items.map((item) => item.sku)) } },
        select: {
          id: true,
          sku: true,
          title: true,
          priceCents: true,
          weightGrams: true,
          product: {
            select: {
              title: true,
              requiresShipping: true,
              images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
            },
          },
        },
      })
    ).map((variant) => [variant.sku, variant]),
  );

  const codes = [...new Set(orders.flatMap((order) => (order.code ? [order.code] : [])))];
  const discounts = new Map(
    (
      await db.discount.findMany({
        where: { storeId: record.id, code: { in: codes } },
        select: { id: true, code: true, title: true, type: true, value: true },
      })
    ).map((discount) => [discount.code, discount]),
  );

  const now = Date.now();

  // Oldest first, so order numbers rise with time as real ones do.
  for (const order of [...orders].sort((a, b) => b.daysAgo - a.daysAgo)) {
    const id = seedOrderId(order.key);

    const lines = order.items.map(({ sku, quantity }) => {
      const variant = variants.get(sku);
      if (!variant) throw new Error(`Seed order "${order.key}" names unknown SKU "${sku}".`);
      return { variant, quantity };
    });
    const lineTotals = lines.map(({ variant, quantity }) => variant.priceCents * quantity);
    const subtotalCents = lineTotals.reduce((sum, cents) => sum + cents, 0);

    const discount = order.code ? discounts.get(order.code) : undefined;
    if (order.code && !discount) {
      throw new Error(`Seed order "${order.key}" uses unknown code "${order.code}".`);
    }
    const discountCents = discount ? orderDiscountCents(discount, subtotalCents) : 0;
    const lineDiscounts = splitAcrossLines(discountCents, lineTotals);

    // Shipped at the cheapest rate the order qualified for, chosen the way
    // checkout chooses it, so seeded orders read like real ones.
    const address = postalAddress(order.name, order.address);
    const zone = zoneFor(zones, { countryCode: address.countryCode, regionCode: address.regionCode });
    const rate = zone
      ? chooseRate(
          eligibleRates(zone, {
            subtotalCents: subtotalCents - discountCents,
            weightGrams: lines.reduce(
              (sum, { variant, quantity }) =>
                sum + (variant.product.requiresShipping ? variant.weightGrams * quantity : 0),
              0,
            ),
          }),
          null,
        )
      : null;
    if (!zone || !rate) {
      throw new Error(`Seed order "${order.key}" ships to ${address.countryCode}, where no rate applies.`);
    }

    // Cash where checkout would have offered it, unless the order says card;
    // an order that says cash where it was not on offer is a seed mistake.
    const baseCents = subtotalCents - discountCents + rate.priceCents;
    const cod =
      codSettings && order.payment !== "card"
        ? codAvailability(codSettings, {
            baseCents,
            needsShipping: lines.some(({ variant }) => variant.product.requiresShipping),
            countryCode: address.countryCode,
          })
        : null;
    if (order.payment === "cod" && !cod?.available) {
      throw new Error(
        `Seed order "${order.key}" is cash on delivery, which ${store.name} does not offer for it` +
          (cod && !cod.available ? ` (${cod.reason}).` : "."),
      );
    }
    const cashOnDelivery = cod?.available === true;
    const paymentFeeCents = cod?.available ? cod.feeCents : 0;
    if (cashOnDelivery) cashOrders += 1;

    const totalCents = baseCents + paymentFeeCents;
    const platformFeeCents = calculatePlatformFee(totalCents, record.commissionBps);

    const email = order.email.toLowerCase();
    const account = order.signedIn
      ? await db.user.findUnique({ where: { email }, select: { id: true } })
      : null;
    if (order.signedIn && !account) {
      throw new Error(`Seed order "${order.key}" is signed in as ${email}, which is not a seeded account.`);
    }

    const status = order.status ?? defaultOrderStatus(order.daysAgo, cashOnDelivery);
    const placedAt = new Date(now - order.daysAgo * DAY_MS);
    const later = (ms: number) => new Date(Math.min(placedAt.getTime() + ms, now));
    const settled = status === "PAID" || status === "FULFILLED";
    if (settled) customers.add(email);

    // A card is charged at checkout and the parcel goes two days later. Cash
    // is the other way round: the parcel goes the next day, and the money
    // comes in with the courier at the far end of the delivery estimate.
    const shippedAfter = cashOnDelivery ? DAY_MS : 2 * DAY_MS;
    const paidAfter = cashOnDelivery
      ? shippedAfter + (rate.maxDeliveryDays ?? 3) * DAY_MS
      : 2 * 60 * 1000;

    const data = {
      userId: account?.id ?? null,
      email: order.email,
      status,
      currency: record.currency,
      subtotalCents,
      discountCents,
      shippingCents: rate.priceCents,
      paymentFeeCents,
      totalCents,
      platformFeeCents,
      sellerNetCents: totalCents - platformFeeCents,
      paymentMethod: cashOnDelivery ? "CASH_ON_DELIVERY" : "STRIPE",
      discountId: discount?.id ?? null,
      appliedDiscounts: discount
        ? [
            {
              discountId: discount.id,
              code: discount.code,
              title: discount.title,
              type: discount.type,
              amountCents: discountCents,
              shippingCents: 0,
            },
          ]
        : [],
      // No Stripe account behind cash, which a CHECK holds it to.
      stripeAccountId: cashOnDelivery ? null : record.stripeAccountId,
      shippingAddress: address,
      billingAddress: address,
      shippingRateId: rate.id,
      shippingRateName: rate.name,
      shippingZoneName: zone.name,
      shippingMinDays: rate.minDeliveryDays,
      shippingMaxDays: rate.maxDeliveryDays,
      paidAt: settled ? later(paidAfter) : null,
      fulfilledAt: status === "FULFILLED" ? later(shippedAfter) : null,
      cancelledAt: status === "CANCELLED" ? later(60 * 60 * 1000) : null,
      createdAt: placedAt,
    } satisfies Prisma.OrderUncheckedUpdateInput;

    const existing = await db.order.findUnique({ where: { id }, select: { storeId: true } });
    if (existing && existing.storeId !== record.id) {
      throw new Error(`Seed order "${order.key}" collides with an order in another store.`);
    }

    if (existing) {
      await db.order.update({ where: { id }, data });
    } else {
      // Numbered from the store's counter, as checkout numbers them, so a
      // seeded order never takes a number a real one already has.
      const { orderSequence } = await db.store.update({
        where: { id: record.id },
        data: { orderSequence: { increment: 1 } },
        select: { orderSequence: true },
      });
      await db.order.create({
        data: { id, storeId: record.id, orderNumber: orderSequence, ...data },
      });
    }

    // Lines and redemptions are replaced wholesale, like product images.
    await db.orderLine.deleteMany({ where: { orderId: id } });
    await db.orderLine.createMany({
      data: lines.map(({ variant, quantity }, index) => ({
        orderId: id,
        variantId: variant.id,
        titleSnapshot: variant.product.title,
        variantTitleSnapshot: variant.title,
        skuSnapshot: variant.sku,
        imageUrlSnapshot: variant.product.images[0]?.url ?? null,
        unitPriceCents: variant.priceCents,
        quantity,
        discountCents: lineDiscounts[index],
      })),
    });

    await db.discountRedemption.deleteMany({ where: { orderId: id } });
    // A cancelled checkout gives its use back, so it keeps no redemption.
    if (discount && status !== "CANCELLED") {
      await db.discountRedemption.create({
        data: { discountId: discount.id, orderId: id, userId: account?.id ?? null, email, createdAt: placedAt },
      });
    }
  }

  // Demo data: a store's currency is set by the seed, so every order in it —
  // including any placed by hand since the last seed — is relabelled to match,
  // rather than leaving a store whose history mixes two currencies.
  await db.order.updateMany({
    where: { storeId: record.id, currency: { not: record.currency } },
    data: { currency: record.currency },
  });

  // Checkout keeps `usageCount` equal to the redemptions, so recount rather
  // than add: a reseed must not count the same orders twice.
  for (const discount of discounts.values()) {
    const usageCount = await db.discountRedemption.count({ where: { discountId: discount.id } });
    await db.discount.update({ where: { id: discount.id }, data: { usageCount } });
  }

  console.log(
    `  ${store.name.padEnd(22)} ${orders.length} orders, ${customers.size} customers` +
      (cashOrders > 0 ? `, ${cashOrders} cash on delivery` : ""),
  );
}

/** A seed buyer's address in the shape checkout stores. */
function postalAddress(name: string, address: SeedOrder["address"]): PostalAddress {
  const space = name.lastIndexOf(" ");
  const regionCode = address.region ?? null;
  return {
    firstName: space > 0 ? name.slice(0, space) : null,
    lastName: space > 0 ? name.slice(space + 1) : name,
    company: null,
    line1: address.line1,
    line2: address.line2 ?? null,
    city: address.city,
    regionCode,
    region: regionCode ? (regionName(address.countryCode, regionCode) ?? regionCode) : null,
    postalCode: address.postalCode,
    countryCode: address.countryCode,
    phone: null,
  };
}

// ---------------------------------------------------------------------------

async function main() {
  const images = await loadImages();
  const withAuth = supabaseAdmin() !== null && seedPassword() !== null;

  console.log(
    `Seeding ${SEED_STORES.length} stores` +
      (withAuth
        ? " (provisioning Supabase Auth accounts)"
        : supabaseAdmin()
          ? " (no SEED_PASSWORD — demo logins are neither created nor changed)"
          : " (no SUPABASE_SERVICE_ROLE_KEY — database rows only)"),
  );

  await upsertUser(PLATFORM_ADMIN.email, PLATFORM_ADMIN.name, "PLATFORM_ADMIN");

  for (const store of SEED_STORES) {
    await seedStore(store, images);
  }

  for (const store of SEED_STORES) {
    await seedOrders(store);
  }

  console.log("\nDone. Demo accounts:");
  console.log(`  ${PLATFORM_ADMIN.email.padEnd(24)} platform admin`);
  for (const store of SEED_STORES) {
    console.log(`  ${store.owner.email.padEnd(24)} owns /s/${store.slug}`);
  }
  if (withAuth) console.log("  password: SEED_PASSWORD from .env");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
