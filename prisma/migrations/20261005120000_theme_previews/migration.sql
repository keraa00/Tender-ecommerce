-- The theme editor's live preview: each seller's unsaved edits, staged per
-- store so the preview iframe can render them server-side. See
-- `ThemePreview` in schema.prisma.
--
-- Additive only: a new table nothing else depends on.

-- CreateTable
CREATE TABLE "theme_previews" (
    "store_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "theme_previews_pkey" PRIMARY KEY ("store_id","user_id")
);

-- CreateIndex
CREATE INDEX "theme_previews_user_id_idx" ON "theme_previews"("user_id");

-- AddForeignKey
ALTER TABLE "theme_previews" ADD CONSTRAINT "theme_previews_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theme_previews" ADD CONSTRAINT "theme_previews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same backstops as `store_themes`: an object, of bounded size, and a session
-- id shaped like the ones the editor makes.
ALTER TABLE "theme_previews"
ADD CONSTRAINT "theme_previews_document_check"
  CHECK (jsonb_typeof("document") = 'object' AND octet_length("document"::text) <= 262144),
ADD CONSTRAINT "theme_previews_session_check"
  CHECK ("session" ~ '^[a-z0-9]{8,32}$');

-- Closed to the Supabase Data API, like every other table. See
-- `20260827080543_revoke_data_api_access`.
ALTER TABLE "theme_previews" ENABLE ROW LEVEL SECURITY;
