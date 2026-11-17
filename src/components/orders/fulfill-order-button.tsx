"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { AdminMessages } from "@/lib/i18n/admin";
import type { OrderActionResult } from "@/lib/orders/actions";

/**
 * "It's on its way": a paid order moves to Fulfilled. No confirm step — it
 * changes no stock and no money, only where the order stands.
 */
export function FulfillOrderButton({
  fulfill,
  t,
}: {
  fulfill: () => Promise<OrderActionResult>;
  t: AdminMessages["orders"]["actions"];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await fulfill();
            if (!result.ok) setError(result.error);
          })
        }
      >
        {pending ? t.marking : t.markFulfilled}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
