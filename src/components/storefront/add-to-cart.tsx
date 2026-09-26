"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import type { AddToCartState } from "@/lib/cart/actions";
import { cn } from "@/lib/cn";
import { format, type Messages } from "@/lib/i18n/messages";
import { usePanel } from "./storefront-ui";

export type PurchasableVariant = {
  id: string;
  title: string;
  /** Formatted on the server — see `types.ts`. */
  price: string;
  compareAt: string | null;
  inventoryQty: number;
};

/**
 * Option picker, price, quantity and the add button. The price shown follows
 * the selected option; the server re-reads the variant on add, so nothing
 * displayed here is trusted for the write.
 */
export function AddToCart({
  variants,
  showOptions,
  maxQuantity,
  action,
  t,
  stepperLabels,
  errors,
}: {
  variants: PurchasableVariant[];
  /** False for a product whose only option is the implicit "Default". */
  showOptions: boolean;
  maxQuantity: number;
  action: (state: AddToCartState, formData: FormData) => Promise<AddToCartState>;
  t: Messages["product"];
  stepperLabels: { increase: string; decrease: string };
  errors: Record<NonNullable<AddToCartState["error"]>, string>;
}) {
  const { setPanel } = usePanel();

  const [variantId, setVariantId] = useState(
    () => (variants.find((variant) => variant.inventoryQty > 0) ?? variants[0])?.id,
  );
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const selected = variants.find((variant) => variant.id === variantId) ?? variants[0];
  if (!selected) return null;

  const soldOut = selected.inventoryQty <= 0;
  const ceiling = Math.max(1, Math.min(selected.inventoryQty, maxQuantity));
  const lowStock = !soldOut && selected.inventoryQty <= 5;

  return (
    <form
      action={async (formData) => {
        const result = await action({}, formData);
        if (result.error) {
          setError(errors[result.error]);
        } else {
          setError(null);
          setQuantity(1);
          setPanel("cart");
        }
      }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-2xl font-semibold tracking-tight tabular">
          {selected.price}
        </p>
        {selected.compareAt ? (
          <>
            <s className="text-lg text-muted tabular">{selected.compareAt}</s>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: "var(--store-accent)" }}
            >
              {t.sale}
            </span>
          </>
        ) : null}
      </div>

      <input type="hidden" name="variantId" value={selected.id} />
      <input type="hidden" name="quantity" value={quantity} />

      {showOptions ? (
        <fieldset>
          <legend className="text-sm font-medium">{t.option}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {variants.map((variant) => {
              const active = variant.id === selected.id;
              const out = variant.inventoryQty <= 0;
              return (
                <button
                  key={variant.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setVariantId(variant.id);
                    setQuantity(1);
                    setError(null);
                  }}
                  className={cn(
                    "min-w-12 cursor-pointer rounded-lg border px-3.5 py-2 text-sm transition-colors",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border-strong hover:border-foreground",
                    out && !active && "text-muted line-through decoration-muted/60",
                  )}
                >
                  {variant.title}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p id="quantity-label" className="text-sm font-medium">
            {t.quantity}
          </p>
          <div
            role="group"
            aria-labelledby="quantity-label"
            className="mt-2 flex h-12 items-center rounded-lg border border-border-strong"
          >
            <button
              type="button"
              aria-label={stepperLabels.decrease}
              disabled={soldOut || quantity <= 1}
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              className="grid h-full w-11 cursor-pointer place-items-center text-lg text-muted hover:text-foreground disabled:cursor-default disabled:opacity-40"
            >
              −
            </button>
            <span className="w-8 text-center tabular" aria-live="polite">
              {quantity}
            </span>
            <button
              type="button"
              aria-label={stepperLabels.increase}
              disabled={soldOut || quantity >= ceiling}
              onClick={() => setQuantity((value) => Math.min(ceiling, value + 1))}
              className="grid h-full w-11 cursor-pointer place-items-center text-lg text-muted hover:text-foreground disabled:cursor-default disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>

        <SubmitButton
          soldOut={soldOut}
          label={soldOut ? t.soldOut : t.addToCart}
          pendingLabel={t.adding}
        />
      </div>

      <p className={cn("text-sm", soldOut ? "text-muted" : lowStock ? "text-warning" : "text-success")}>
        {soldOut
          ? t.soldOut
          : lowStock
            ? format(t.lowStock, { count: selected.inventoryQty })
            : t.inStock}
      </p>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function SubmitButton({
  soldOut,
  label,
  pendingLabel,
}: {
  soldOut: boolean;
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={soldOut || pending}
      className="h-12 min-w-48 flex-1 cursor-pointer rounded-lg px-6 text-base font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      style={{ backgroundColor: "var(--store-accent)" }}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
