import Image from "next/image";

import { cn } from "@/lib/cn";
import { markTextColor, storeInitials } from "@/lib/stores/logo";

type Size = "xs" | "sm" | "md" | "lg";

const sizes: Record<Size, { box: string; pixels: number }> = {
  xs: { box: "h-6 w-6 rounded-md text-[10px]", pixels: 24 },
  sm: { box: "h-8 w-8 rounded-lg text-xs", pixels: 32 },
  md: { box: "h-9 w-9 rounded-lg text-sm", pixels: 36 },
  lg: { box: "h-16 w-16 rounded-xl text-xl", pixels: 64 },
};

/**
 * A store's logo, or its initials on its accent colour when it has none — how
 * the seller tells their stores apart in the store list and the admin, and
 * what heads checkout, whose pared-down header has room for nothing else.
 *
 * Without an accent it takes the platform primary, which is also what the
 * storefront falls back to for `--store-accent`. Decorative: the store's name
 * is always printed beside it.
 */
export function StoreMark({
  name,
  logoUrl,
  accentColor,
  size = "sm",
  className,
}: {
  name: string;
  logoUrl: string | null;
  accentColor: string | null;
  size?: Size;
  className?: string;
}) {
  const { box, pixels } = sizes[size];

  if (logoUrl) {
    return (
      <span
        aria-hidden
        className={cn("relative shrink-0 overflow-hidden bg-surface-subtle", box, className)}
      >
        {/* `blob:` previews from the create form skip the optimizer on their own. */}
        <Image src={logoUrl} alt="" fill sizes={`${pixels}px`} className="object-cover" />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center font-semibold leading-none select-none",
        accentColor === null && "bg-primary text-primary-foreground",
        box,
        className,
      )}
      style={
        accentColor === null
          ? undefined
          : { backgroundColor: accentColor, color: markTextColor(accentColor) }
      }
    >
      {storeInitials(name)}
    </span>
  );
}
