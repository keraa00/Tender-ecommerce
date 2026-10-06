-- Storefront designs: one JSON document per store, edited as a draft and
-- published separately. See `StoreTheme` in schema.prisma.
--
-- Additive only. No existing row is touched and nothing is backfilled: a store
-- without a row renders `defaultTheme()` from code, which reproduces the home
-- page as it was hard-coded before this table existed. That also means this
-- can be applied ahead of the deploy that reads it.

-- CreateTable
CREATE TABLE "store_themes" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Tender',
    "draft" JSONB NOT NULL,
    "published" JSONB,
    "draft_version" INTEGER NOT NULL DEFAULT 0,
    "draft_saved_at" TIMESTAMP(3),
    "published_version" INTEGER,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_themes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_themes_store_id_key" ON "store_themes"("store_id");

-- AddForeignKey
ALTER TABLE "store_themes" ADD CONSTRAINT "store_themes_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The document's shape is validated in application code
-- (`src/lib/theme/validate.ts`), which is the only writer. These are the
-- backstop for every other path: each document is an object, and none is large
-- enough to bloat a row that every storefront request reads. The size limit is
-- above the application's own (`MAX_THEME_BYTES`), so it never fires first.
ALTER TABLE "store_themes"
ADD CONSTRAINT "store_themes_draft_check"
  CHECK (jsonb_typeof("draft") = 'object' AND octet_length("draft"::text) <= 262144),
ADD CONSTRAINT "store_themes_published_check"
  CHECK (
    "published" IS NULL
    OR (jsonb_typeof("published") = 'object' AND octet_length("published"::text) <= 262144)
  ),
ADD CONSTRAINT "store_themes_versions_check"
  CHECK (
    "draft_version" >= 0
    AND ("published_version" IS NULL OR "published_version" BETWEEN 0 AND "draft_version")
  );

-- Same posture as every other table: closed to the Supabase Data API, with RLS
-- and no policies as the deny-all backstop. See
-- `20260827080543_revoke_data_api_access` for why.
ALTER TABLE "store_themes" ENABLE ROW LEVEL SECURITY;
