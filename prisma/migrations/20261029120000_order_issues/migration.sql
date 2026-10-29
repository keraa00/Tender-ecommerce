-- Orders that need the seller's attention: an oversell found when the payment
-- landed, or a payment that succeeded for an order already cancelled. Both
-- used to reach only the server log. See `OrderIssue` in schema.prisma and
-- `settleOrder()` / `markOrderPaid()` in src/lib/payments/settle.ts.
--
-- Additive only: a new enum and a column every existing order gets empty. The
-- table already has RLS on and its Data API grants revoked
-- (20260827080543_revoke_data_api_access), and a new column inherits both.

-- CreateEnum
CREATE TYPE "order_issue" AS ENUM ('OVERSOLD', 'PAID_AFTER_CANCEL');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "issues" "order_issue"[] DEFAULT ARRAY[]::"order_issue"[];

-- Prisma declares the list column nullable; the IS NOT NULL is the NOT NULL it
-- cannot.
ALTER TABLE "orders"
ADD CONSTRAINT "orders_issues_check" CHECK ("issues" IS NOT NULL);
