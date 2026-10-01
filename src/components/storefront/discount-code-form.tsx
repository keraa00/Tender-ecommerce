"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";

import type { DiscountCodeError, DiscountCodeState } from "@/lib/cart/actions";
import type { CartCodeDisplay, DiscountCodeMessages } from "./types";

/**
 * The code box, and the codes already on the cart with what each is doing.
 * Plain forms underneath — they post and the server re-renders the cart — so
 * applying a code works before hydration too.
 */
export function DiscountCodeForm({
  codes,
  t,
  errors,
  apply,
  remove,
}: {
  codes: CartCodeDisplay[];
  t: DiscountCodeMessages;
  /** Already worded for the buyer's language, plurals included. */
  errors: Record<DiscountCodeError, string>;
  apply: (state: DiscountCodeState, formData: FormData) => Promise<DiscountCodeState>;
  remove: (formData: FormData) => Promise<void>;
}) {
  const [state, formAction] = useActionState(apply, {});
  const inputId = useId();
  const errorId = useId();

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-1.5">
        <label htmlFor={inputId} className="block text-sm font-medium">
          {t.label}
        </label>
        <div className="flex gap-2">
          <input
            // Remounts after a successful apply, which clears what was typed.
            key={state.appliedAt ?? 0}
            id={inputId}
            name="code"
            placeholder={t.placeholder}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={Boolean(state.error)}
            aria-describedby={state.error ? errorId : undefined}
            className="h-10 min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-3 text-sm uppercase placeholder:normal-case placeholder:text-muted aria-[invalid=true]:border-danger"
          />
          <ApplyButton label={t.apply} />
        </div>
        {state.error ? (
          <p id={errorId} role="alert" className="text-sm text-danger">
            {errors[state.error]}
          </p>
        ) : null}
      </form>

      {codes.length > 0 ? (
        <ul className="space-y-2">
          {codes.map((entry) => (
            <li key={entry.code} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs font-medium ring-1 ring-border ring-inset">
                  {entry.code}
                </span>
                <p className={entry.applied ? "mt-1 text-success" : "mt-1 text-muted"}>
                  {entry.applied ? t.applied : entry.message}
                </p>
              </div>
              <form action={remove}>
                <input type="hidden" name="code" value={entry.code} />
                <RemoveButton label={t.remove.replace("{code}", entry.code)} />
              </form>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ApplyButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-10 shrink-0 cursor-pointer rounded-lg border border-border-strong px-4 text-sm font-medium transition-colors hover:bg-surface-hover disabled:cursor-default disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function RemoveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      title={label}
      className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-40"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="h-4 w-4"
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}
