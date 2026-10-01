"use client";

import Image from "next/image";
import Link from "next/link";
import { useFormStatus } from "react-dom";

import { cn } from "@/lib/cn";
import type { CartLineDisplay, CartMessages } from "./types";

/**
 * Cart lines with quantity steppers. Each button is its own tiny form posting
 * `lineId` and the quantity it wants, so the server decides the result (and
 * clamps it to stock) instead of trusting a number the browser computed.
 */
export function CartLineList({
  lines,
  t,
  updateLine,
  onNavigate,
  size = "compact",
}: {
  lines: CartLineDisplay[];
  t: CartMessages;
  updateLine: (formData: FormData) => Promise<void>;
  /** Lets the drawer close itself when a product link is followed. */
  onNavigate?: () => void;
  size?: "compact" | "roomy";
}) {
  const roomy = size === "roomy";

  return (
    <ul className="divide-y divide-border">
      {lines.map((line) => (
        <li key={line.id} className={cn("flex gap-4", roomy ? "py-6" : "py-4")}>
          <Link
            href={line.href}
            onClick={onNavigate}
            className={cn(
              "relative shrink-0 overflow-hidden rounded-lg bg-surface-subtle",
              roomy ? "h-28 w-28" : "h-20 w-20",
              !line.available && "opacity-50",
            )}
          >
            {line.imageUrl ? (
              <Image
                src={line.imageUrl}
                alt={line.imageAlt}
                fill
                sizes={roomy ? "112px" : "80px"}
                className="object-cover"
              />
            ) : null}
          </Link>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={line.href}
                  onClick={onNavigate}
                  className="line-clamp-2 text-sm font-medium underline-offset-4 hover:underline"
                >
                  {line.productTitle}
                </Link>
                {line.showVariantTitle ? (
                  <p className="mt-0.5 text-sm text-muted">{line.variantTitle}</p>
                ) : null}
                <p className="mt-0.5 text-sm text-muted tabular">{line.unitPrice}</p>
              </div>
              {line.available && line.discountedTotal ? (
                <p className="shrink-0 text-end text-sm tabular">
                  <del className="block text-xs text-muted">{line.lineTotal}</del>
                  <ins className="block font-medium text-success no-underline">
                    {line.discountedTotal}
                  </ins>
                </p>
              ) : (
                <p className="shrink-0 text-sm font-medium tabular">
                  {line.available ? line.lineTotal : null}
                </p>
              )}
            </div>

            <div className="mt-auto flex items-center justify-between gap-3 pt-3">
              {line.available ? (
                <div className="flex items-center rounded-lg border border-border-strong">
                  <QuantityButton
                    action={updateLine}
                    lineId={line.id}
                    quantity={line.quantity - 1}
                    label={t.decrease}
                  >
                    −
                  </QuantityButton>
                  <span className="w-8 text-center text-sm tabular" aria-live="polite">
                    {line.quantity}
                  </span>
                  <QuantityButton
                    action={updateLine}
                    lineId={line.id}
                    quantity={line.quantity + 1}
                    label={t.increase}
                    disabled={line.quantity >= line.maxQuantity}
                  >
                    +
                  </QuantityButton>
                </div>
              ) : (
                <p className="text-sm text-warning">{t.unavailable}</p>
              )}

              <form action={updateLine}>
                <input type="hidden" name="lineId" value={line.id} />
                <input type="hidden" name="quantity" value="0" />
                <RemoveButton label={t.remove} />
              </form>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function QuantityButton({
  action,
  lineId,
  quantity,
  label,
  disabled,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  lineId: string;
  quantity: number;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="lineId" value={lineId} />
      <input type="hidden" name="quantity" value={Math.max(quantity, 0)} />
      <StepperSubmit label={label} disabled={disabled}>
        {children}
      </StepperSubmit>
    </form>
  );
}

function StepperSubmit({
  label,
  disabled,
  children,
}: {
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={label}
      disabled={disabled || pending}
      className="grid h-8 w-8 cursor-pointer place-items-center text-base text-muted transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function RemoveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="cursor-pointer text-sm text-muted underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
    >
      {label}
    </button>
  );
}
