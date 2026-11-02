"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { CodOrderActionResult } from "@/lib/orders/actions";

/**
 * The two ways out of "payment on delivery": the cash came in, or the parcel
 * did not go. Cancelling asks first — it puts the stock back and gives the
 * discount uses back, and there is no undoing it from here.
 */
export function CodOrderActions({
  total,
  markPaid,
  cancel,
}: {
  /** Formatted: what the courier collects. */
  total: string;
  markPaid: () => Promise<CodOrderActionResult>;
  cancel: () => Promise<CodOrderActionResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<CodOrderActionResult>) =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) setError(result.error);
    });

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(markPaid)}>
          Mark as paid
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            if (
              window.confirm(
                "Cancel this order? Its items go back into stock and any discount uses are given back. This can't be undone.",
              )
            ) {
              run(cancel);
            }
          }}
        >
          Cancel and restock
        </Button>
      </div>
      <p className="text-xs text-muted">Mark it paid once the courier has handed over {total}.</p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
