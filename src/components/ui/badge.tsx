"use client";

import type { ReactNode } from "react";

import { useAdminI18n } from "@/components/admin/admin-i18n";
import { cn } from "@/lib/cn";
import type { DiscountState } from "@/lib/discounts/format";
// Types only: the values re-export the Prisma client, and this module is also
// rendered inside Client Components (the discount form's status preview).
import type { OrderStatus, PaymentMethod, ProductStatus, StoreStatus } from "@/lib/db/types";

/*
 * The status badges are Client Components so the discount form's live preview
 * can draw one too; their labels come from the admin's language context, which
 * the dashboard layout provides to server-rendered pages and forms alike.
 */

type Tone = "neutral" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "border-border-strong text-muted",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5",
        "text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

const storeStatusTone: Record<StoreStatus, Tone> = {
  PENDING: "warning",
  ACTIVE: "success",
  SUSPENDED: "danger",
};

export function StoreStatusBadge({ status }: { status: StoreStatus }) {
  const { badges } = useAdminI18n();
  return <Badge tone={storeStatusTone[status]}>{badges.store[status]}</Badge>;
}

const productStatusTone: Record<ProductStatus, Tone> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  ARCHIVED: "warning",
};

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const { badges } = useAdminI18n();
  return <Badge tone={productStatusTone[status]}>{badges.product[status]}</Badge>;
}

const orderStatusTone: Record<OrderStatus, Tone> = {
  PENDING: "warning",
  PAID: "success",
  FULFILLED: "success",
  CANCELLED: "danger",
};

/**
 * An unpaid cash-on-delivery order is not waiting on a payment that may never
 * come: it is placed, and to be sent. It says so.
 */
export function OrderStatusBadge({
  status,
  paymentMethod,
}: {
  status: OrderStatus;
  paymentMethod?: PaymentMethod;
}) {
  const { badges } = useAdminI18n();
  if (status === "PENDING" && paymentMethod === "CASH_ON_DELIVERY") {
    return <Badge tone="warning">{badges.paymentOnDelivery}</Badge>;
  }
  return <Badge tone={orderStatusTone[status]}>{badges.order[status]}</Badge>;
}

/**
 * Discount state is derived rather than stored — see `discountState()`. Only
 * "Active" is good news; "Limit reached" is the one a seller may want to act
 * on, so it is the only other one that carries colour.
 */
const discountStateTone: Record<DiscountState, Tone> = {
  active: "success",
  scheduled: "neutral",
  expired: "neutral",
  exhausted: "warning",
  disabled: "neutral",
};

export function DiscountStateBadge({ state }: { state: DiscountState }) {
  const { badges } = useAdminI18n();
  return <Badge tone={discountStateTone[state]}>{badges.discount[state]}</Badge>;
}
