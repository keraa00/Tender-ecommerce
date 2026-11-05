import { cn } from "@/lib/cn";

type Size = "sm" | "lg";

const sizes: Record<Size, string> = {
  /** Beside the "Tender" wordmark in the site header, footer and auth pages. */
  sm: "h-6 w-6 rounded-md text-[11px]",
  /** The theme card on the online store page. */
  lg: "h-14 w-14 rounded-xl text-2xl",
};

/**
 * Tender's logo: a "T" on the platform primary. There is no image file behind
 * it — this is the whole logo, so it follows `--primary` with the page's theme.
 * Decorative: "Tender" is always printed beside it.
 */
export function TenderMark({ size = "sm" }: { size?: Size }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center bg-primary font-bold text-primary-foreground",
        sizes[size],
      )}
    >
      T
    </span>
  );
}
