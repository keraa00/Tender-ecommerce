"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAdminI18n } from "@/components/admin/admin-i18n";
import { Field, FormError, Input } from "@/components/ui/field";
import { format, plural } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";
import type { DeleteStoreState } from "@/lib/stores/actions";

/**
 * The danger zone at the foot of Settings → General. Closed by default, like
 * every delete in the admin, and with the slug to type out and the current
 * password to give — this one takes the store's order history with it.
 */
export function DeleteStoreForm({
  action,
  storeName,
  storeSlug,
  blockers,
  ordersHref,
  openCheckouts,
  needsAttention,
  t,
}: {
  t: AdminMessages["settings"]["general"]["delete"];
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
  const { locale } = useAdminI18n();
  const [typed, setTyped] = useState("");
  const blocked = blockers.length > 0;

  return (
    <details className="mt-10 rounded-xl border border-danger/30 bg-danger/5 p-4">
      <summary className="cursor-pointer text-sm font-medium text-danger">
        {t.title}
      </summary>

      <div className="mt-3 space-y-3 text-sm text-muted text-pretty">
        <p>{format(t.body, { store: storeName })}</p>
        <p>{t.stripe}</p>
        {openCheckouts > 0 ? <p>{plural(locale, openCheckouts, t.openCheckouts)}</p> : null}
        {needsAttention > 0 ? (
          <p className="text-warning">{plural(locale, needsAttention, t.needsAttention)}</p>
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
            {t.goToOrders}
          </Link>
        </div>
      ) : (
        <form action={formAction} className="mt-4 space-y-3" noValidate>
          <FormError>{state.formError}</FormError>
          <Field
            label={format(t.confirm, { slug: storeSlug })}
            htmlFor="delete-store-confirm"
            error={state.fieldErrors?.confirmSlug}
          >
            <Input
              id="delete-store-confirm"
              name="confirmSlug"
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              aria-invalid={Boolean(state.fieldErrors?.confirmSlug)}
              className="sm:max-w-xs"
            />
          </Field>
          <Field
            label={t.password}
            htmlFor="delete-store-password"
            error={state.fieldErrors?.currentPassword}
          >
            <Input
              id="delete-store-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(state.fieldErrors?.currentPassword)}
              className="sm:max-w-xs"
            />
          </Field>
          <Button
            type="submit"
            variant="danger"
            size="sm"
            disabled={pending || typed.trim().toLowerCase() !== storeSlug}
          >
            {pending ? t.deleting : t.submit}
          </Button>
        </form>
      )}
    </details>
  );
}
