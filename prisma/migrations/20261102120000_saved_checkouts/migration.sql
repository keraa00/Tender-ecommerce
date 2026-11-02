-- "Save my information for next time": a buyer's checkout details, kept for
-- one store and one browser (a random token in an httpOnly cookie), so their
-- next checkout there starts filled in. See `SavedCheckout` in schema.prisma
-- and src/lib/checkout/saved.ts.
--
-- Additive: a new table, empty until a buyer ticks the box.

-- CreateTable
CREATE TABLE "saved_checkouts" (
    "store_id" UUID NOT NULL,
    "token" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_checkouts_pkey" PRIMARY KEY ("store_id","token")
);

-- AddForeignKey
ALTER TABLE "saved_checkouts" ADD CONSTRAINT "saved_checkouts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Shape rules
-- ---------------------------------------------------------------------------

-- Emails lower-case like every other email checkout keeps; the draft is the
-- buyer's typing, an object and small, like `carts_checkout_draft_check`.
ALTER TABLE "saved_checkouts"
ADD CONSTRAINT "saved_checkouts_email_check"
  CHECK ("email" <> '' AND "email" = lower(btrim("email")) AND char_length("email") <= 254),
ADD CONSTRAINT "saved_checkouts_draft_check"
  CHECK (jsonb_typeof("draft") = 'object' AND octet_length("draft"::text) <= 16384);

-- ---------------------------------------------------------------------------
-- Data API
-- ---------------------------------------------------------------------------

-- Same posture as `20260827080543_revoke_data_api_access`: closed to the
-- Supabase Data API, with RLS and no policies as the deny-all backstop. It
-- holds buyers' addresses, so this matters more here than anywhere.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
  THEN
    EXECUTE 'REVOKE ALL ON "saved_checkouts" FROM anon, authenticated';
  END IF;
END
$$;

ALTER TABLE "saved_checkouts" ENABLE ROW LEVEL SECURITY;
