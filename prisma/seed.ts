/**
 * Seeds two demo stores with real catalogues, and a year of orders from the
 * customers in `seed-orders.ts`.
 *
 * Idempotent: every write is an upsert keyed on a natural composite key, so
 * running it repeatedly converges rather than duplicating. It never drops
 * tables — use `prisma migrate reset` if you want a clean slate.
 *
 *   npm run db:seed
 *
 * If SUPABASE_SERVICE_ROLE_KEY is set, the two seller accounts and the platform
 * admin are created in Supabase Auth as well, so you can actually log in as
 * them. Without it the rows still exist in `public.users` (so the storefronts
 * work), they just have no credentials behind them.
 */

import "dotenv/config";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";

import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { calculatePlatformFee } from "../src/lib/money";
import {
  PLATFORM_ADMIN,
  SEED_PASSWORD,
  SEED_STORES,
  type SeedDiscount,
  type SeedStore,
} from "./seed-catalog";
import { SEED_ORDERS } from "./seed-orders";

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

/**
 * Returns the id to use for a demo account, creating it in Supabase Auth when
 * a service-role key is available. Already-registered accounts are looked up
 * rather than treated as an error, which is what makes reseeding safe.
 */
async function resolveUserId(email: string, name: string): Promise<string> {
  const admin = supabaseAdmin();
  const fallback = FALLBACK_USER_IDS[email];

  if (!admin) return fallback;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { name },
  });

  if (!error && data.user) return data.user.id;

  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((user) => user.email === email);

  if (existing) return existing.id;

  console.warn(`! could not provision ${email} in Supabase Auth: ${error?.message}`);
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

async function seedStore(store: SeedStore, images: Record<string, SeedImage[]>) {
  const owner = await upsertUser(store.owner.email, store.owner.name);

  const banner = images[`store:${store.slug}:banner`]?.[0];
  const logo = images[`store:${store.slug}:logo`]?.[0];

  const record = await db.store.upsert({
    where: { slug: store.slug },
    create: {
      slug: store.slug,
      name: store.name,
      description: store.description,
      accentColor: store.accentColor,
      bannerUrl: banner?.url ?? null,
      logoUrl: logo?.url ?? null,
      commissionBps: store.commissionBps,
      ownerId: owner.id,
      // Fixture values, replaced once onboarding lands with a real test-mode
      // connected account from the Connect OAuth flow. The `acct_seed_` prefix
      // is deliberately not a valid Stripe id, so any accidental API call
      // against a demo store fails loudly instead of doing something subtle.
      status: "ACTIVE",
      stripeAccountId: `acct_seed_${store.slug.replace(/-/g, "_")}`,
      stripeOnboardingComplete: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
    },
    update: {
      name: store.name,
      description: store.description,
      accentColor: store.accentColor,
      bannerUrl: banner?.url ?? null,
      logoUrl: logo?.url ?? null,
      commissionBps: store.commissionBps,
      ownerId: owner.id,
    },
  });

  await db.storeMember.upsert({
    where: { storeId_userId: { storeId: record.id, userId: owner.id } },
    create: { storeId: record.id, userId: owner.id, role: "OWNER" },
    update: { role: "OWNER" },
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
      },
      update: {
        title: product.title,
        description: product.description,
        status: "ACTIVE",
      },
    });

    // Images are positional and small in number; replacing them wholesale is
    // simpler and cheaper than diffing.
    const productImages = images[`product:${store.slug}:${product.slug}`] ?? [];
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
          position: index,
        },
        update: {
          productId: saved.id,
          title: variant.title,
          priceCents: variant.priceCents,
          compareAtPriceCents: variant.compareAtPriceCents ?? null,
          inventoryQty: variant.inventoryQty,
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

  const productCount = store.products.length;
  const variantCount = store.products.reduce(
    (total, product) => total + product.variants.length,
    0,
  );
  console.log(
    `  ${store.name.padEnd(22)} ${productCount} products, ${variantCount} variants, ` +
      `${store.discounts.length} discounts`,
  );
}

/**
 * Discounts are matched on (storeId, title) rather than (storeId, code) because
 * an automatic discount has no code, and a NULL never matches in a unique
 * lookup.
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
    where: { storeId, title: discount.title },
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
 */
async function seedOrders(store: SeedStore) {
  const orders = SEED_ORDERS[store.slug] ?? [];
  if (orders.length === 0) return;

  const record = await db.store.findUniqueOrThrow({
    where: { slug: store.slug },
    select: { id: true, commissionBps: true, stripeAccountId: true },
  });

  const variants = new Map(
    (
      await db.variant.findMany({
        where: { storeId: record.id, sku: { in: orders.flatMap((order) => order.items.map((item) => item.sku)) } },
        select: {
          id: true,
          sku: true,
          title: true,
          priceCents: true,
          product: {
            select: {
              title: true,
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
    const totalCents = subtotalCents - discountCents;
    const platformFeeCents = calculatePlatformFee(totalCents, record.commissionBps);

    const email = order.email.toLowerCase();
    const account = order.signedIn
      ? await db.user.findUnique({ where: { email }, select: { id: true } })
      : null;
    if (order.signedIn && !account) {
      throw new Error(`Seed order "${order.key}" is signed in as ${email}, which is not a seeded account.`);
    }

    const placedAt = new Date(now - order.daysAgo * DAY_MS);
    const later = (ms: number) => new Date(Math.min(placedAt.getTime() + ms, now));
    const settled = order.status === "PAID" || order.status === "FULFILLED";

    const data = {
      userId: account?.id ?? null,
      email: order.email,
      status: order.status,
      subtotalCents,
      discountCents,
      shippingCents: 0,
      totalCents,
      platformFeeCents,
      sellerNetCents: totalCents - platformFeeCents,
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
      stripeAccountId: record.stripeAccountId,
      shippingAddress: {
        name: order.name,
        line1: order.address.line1,
        line2: order.address.line2 ?? null,
        city: order.address.city,
        region: order.address.region ?? null,
        postalCode: order.address.postalCode,
        country: order.address.country,
      },
      paidAt: settled ? later(2 * 60 * 1000) : null,
      fulfilledAt: order.status === "FULFILLED" ? later(2 * DAY_MS) : null,
      cancelledAt: order.status === "CANCELLED" ? later(60 * 60 * 1000) : null,
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
    if (discount && order.status !== "CANCELLED") {
      await db.discountRedemption.create({
        data: { discountId: discount.id, orderId: id, userId: account?.id ?? null, email, createdAt: placedAt },
      });
    }
  }

  // Checkout keeps `usageCount` equal to the redemptions, so recount rather
  // than add: a reseed must not count the same orders twice.
  for (const discount of discounts.values()) {
    const usageCount = await db.discountRedemption.count({ where: { discountId: discount.id } });
    await db.discount.update({ where: { id: discount.id }, data: { usageCount } });
  }

  const customers = new Set(
    orders
      .filter((order) => order.status === "PAID" || order.status === "FULFILLED")
      .map((order) => order.email.toLowerCase()),
  );
  console.log(`  ${store.name.padEnd(22)} ${orders.length} orders, ${customers.size} customers`);
}

// ---------------------------------------------------------------------------

async function main() {
  const images = await loadImages();
  const withAuth = supabaseAdmin() !== null;

  console.log(
    `Seeding ${SEED_STORES.length} stores` +
      (withAuth
        ? " (provisioning Supabase Auth accounts)"
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
  if (withAuth) console.log(`  password: ${SEED_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
