"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { format } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";
import type { OrderActionResult } from "@/lib/orders/actions";

/**
 * The two ways out of "payment on delivery": the cash came in, or the parcel
 * did not go. Cancelling asks first — it puts the stock back and gives the
 * discount uses back, and there is no undoing it from here.
 */
export function CodOrderActions({
  total,
  markPaid,
  cancel,
  t,
}: {
  /** Formatted: what the courier collects. */
  total: string;
  markPaid: () => Promise<OrderActionResult>;
  cancel: () => Promise<OrderActionResult>;
  t: AdminMessages["orders"]["actions"];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<OrderActionResult>) =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) setError(result.error);
    });

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(markPaid)}>
          {t.markPaid}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            if (window.confirm(t.cancelConfirm)) {
              run(cancel);
            }
          }}
        >
          {t.cancelRestock}
        </Button>
      </div>
      <p className="text-xs text-muted">{format(t.markPaidHint, { total })}</p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
