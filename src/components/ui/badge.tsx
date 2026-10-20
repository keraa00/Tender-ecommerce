import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  DISCOUNT_STATE_LABELS,
  type DiscountState,
} from "@/lib/discounts/format";
// Types only: the values re-export the Prisma client, and this module is also
// rendered inside Client Components (the discount form's status preview).
import type { OrderStatus, ProductStatus, StoreStatus } from "@/lib/db/types";

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

const storeStatusLabel: Record<StoreStatus, string> = {
  PENDING: "Setup incomplete",
  ACTIVE: "Live",
  SUSPENDED: "Suspended",
};

export function StoreStatusBadge({ status }: { status: StoreStatus }) {
  return <Badge tone={storeStatusTone[status]}>{storeStatusLabel[status]}</Badge>;
}

const productStatusTone: Record<ProductStatus, Tone> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  ARCHIVED: "warning",
};

const productStatusLabel: Record<ProductStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Published",
  ARCHIVED: "Archived",
};

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return (
    <Badge tone={productStatusTone[status]}>{productStatusLabel[status]}</Badge>
  );
}

const orderStatusTone: Record<OrderStatus, Tone> = {
  PENDING: "warning",
  PAID: "success",
  FULFILLED: "success",
  CANCELLED: "danger",
};

const orderStatusLabel: Record<OrderStatus, string> = {
  PENDING: "Awaiting payment",
  PAID: "Paid",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={orderStatusTone[status]}>{orderStatusLabel[status]}</Badge>;
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
  return (
    <Badge tone={discountStateTone[state]}>
      {DISCOUNT_STATE_LABELS[state]}
    </Badge>
  );
}
