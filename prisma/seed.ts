/**
 * Seeds two demo stores with real catalogues.
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

import { readFile } from "node:fs/promises";

import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  PLATFORM_ADMIN,
  SEED_PASSWORD,
  SEED_STORES,
  type SeedDiscount,
  type SeedStore,
} from "./seed-catalog";

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
  const targetId = discount.targetCollection
    ? (collectionIds.get(discount.targetCollection) ?? null)
    : null;

  const data = {
    code: discount.code,
    title: discount.title,
    type: discount.type,
    value: discount.value,
    minSubtotalCents: discount.minSubtotalCents ?? null,
    appliesTo: discount.appliesTo ?? ("ALL" as const),
    targetId,
    usageLimit: discount.usageLimit ?? null,
    perCustomerLimit: discount.perCustomerLimit ?? null,
    active: discount.active ?? true,
  };

  const existing = await db.discount.findFirst({
    where: { storeId, title: discount.title },
    select: { id: true },
  });

  if (existing) {
    await db.discount.update({ where: { id: existing.id }, data });
  } else {
    await db.discount.create({ data: { storeId, ...data } });
  }
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
