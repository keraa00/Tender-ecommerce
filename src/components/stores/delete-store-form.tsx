"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import type { DeleteStoreState } from "@/lib/stores/actions";

/**
 * The danger zone at the foot of Settings → General. Closed by default, like
 * every delete in the admin, and with the slug to type out — this one takes
 * the store's order history with it.
 */
export function DeleteStoreForm({
  action,
  storeName,
  storeSlug,
  blockers,
  ordersHref,
  openCheckouts,
  needsAttention,
}: {
  action: (state: DeleteStoreState, formData: FormData) => Promise<DeleteStoreState>;
  storeName: string;
  storeSlug: string;
  /** Reasons it cannot be deleted yet, already in words. */
  blockers: string[];
  ordersHref: string;
  /** Unpaid Stripe checkouts whose payments will be cancelled. */
  openCheckouts: number;
  /** Orders with an issue that may still need a refund in Stripe. */
  needsAttention: number;
}) {
  const [state, formAction, pending] = useActionState<DeleteStoreState, FormData>(action, {});
  const [typed, setTyped] = useState("");
  const blocked = blockers.length > 0;

  return (
    <details className="mt-10 rounded-xl border border-danger/30 bg-danger/5 p-4">
      <summary className="cursor-pointer text-sm font-medium text-danger">
        Delete this store
      </summary>

      <div className="mt-3 space-y-3 text-sm text-muted text-pretty">
        <p>
          Deletes {storeName} for good: its storefront, products, collections, discounts,
          shipping settings, images and every order. Buyers&rsquo; order links stop working.
          This can&rsquo;t be undone.
        </p>
        <p>
          Your Stripe account is yours and stays as it is — payouts, past payments and refunds
          carry on in your Stripe Dashboard.
        </p>
        {openCheckouts > 0 ? (
          <p>
            {openCheckouts === 1
              ? "1 unpaid checkout will be cancelled."
              : `${openCheckouts} unpaid checkouts will be cancelled.`}
          </p>
        ) : null}
        {needsAttention > 0 ? (
          <p className="text-warning">
            {needsAttention === 1 ? "1 order is" : `${needsAttention} orders are`} flagged for
            a refund. Make sure it&rsquo;s been handled in Stripe before you go.
          </p>
        ) : null}
      </div>

      {blocked ? (
        <div className="mt-4 space-y-2">
          <FormError>
            <ul className="list-disc space-y-1 ps-4">
              {blockers.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </FormError>
          <Link href={ordersHref} className="inline-block text-sm underline underline-offset-4">
            Go to orders
          </Link>
        </div>
      ) : (
        <form action={formAction} className="mt-4 space-y-3" noValidate>
          <FormError>{state.formError}</FormError>
          <Field
            label={`Type ${storeSlug} to confirm`}
            htmlFor="delete-store-confirm"
            error={state.fieldErrors?.confirmSlug}
          >
            <Input
              id="delete-store-confirm"
              name="confirmSlug"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              aria-invalid={Boolean(state.fieldErrors?.confirmSlug)}
              className="sm:max-w-xs"
            />
          </Field>
          <Button
            type="submit"
            variant="danger"
            size="sm"
            disabled={pending || typed.trim().toLowerCase() !== storeSlug}
          >
            {pending ? "Deleting…" : "Delete store permanently"}
          </Button>
        </form>
      )}
    </details>
  );
}
