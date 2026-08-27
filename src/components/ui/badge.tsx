import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { StoreStatus } from "@/lib/db/types";

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
  [StoreStatus.PENDING]: "warning",
  [StoreStatus.ACTIVE]: "success",
  [StoreStatus.SUSPENDED]: "danger",
};

const storeStatusLabel: Record<StoreStatus, string> = {
  [StoreStatus.PENDING]: "Setup incomplete",
  [StoreStatus.ACTIVE]: "Live",
  [StoreStatus.SUSPENDED]: "Suspended",
};

export function StoreStatusBadge({ status }: { status: StoreStatus }) {
  return <Badge tone={storeStatusTone[status]}>{storeStatusLabel[status]}</Badge>;
}
