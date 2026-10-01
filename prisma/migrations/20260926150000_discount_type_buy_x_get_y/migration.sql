-- Adds the buy-X-get-Y discount type, on its own.
--
-- Postgres refuses to use an enum value inside the transaction that added it
-- ("unsafe use of new value"), and the CHECK constraints in the next migration,
-- `20260926160000_discount_rules`, name BUY_X_GET_Y. Prisma applies each
-- migration file separately, so committing the value here first is what lets
-- the next file reference it.

-- AlterEnum
ALTER TYPE "discount_type" ADD VALUE 'BUY_X_GET_Y';
