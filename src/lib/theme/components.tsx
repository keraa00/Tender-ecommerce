import Link from "next/link";

import { cn } from "@/lib/cn";
import { field } from "./fields";

/**
 * Pieces more than one section draws. Section files stay one per type; what
 * they share lives here.
 */

/** The settings of a button block, wherever a section offers one. */
export const buttonFields = {
  label: field.text({ label: "Label", maxLength: 40 }),
  link: field.link({ label: "Link" }),
  style: field.select({
    label: "Style",
    options: [
      { value: "primary", label: "Solid" },
      { value: "secondary", label: "Outline" },
    ],
    default: "primary",
  }),
};

export function ThemeButton({
  href,
  label,
  style,
  onImage = false,
  className,
}: {
  href: string;
  label: string;
  style: "primary" | "secondary";
  /** Over a photo, where the outline style has to be light to show. */
  onImage?: boolean;
  className?: string;
}) {
  const external = /^https?:\/\//.test(href);

  return (
    <Link
      href={href}
      {...(external ? { rel: "noopener noreferrer" } : {})}
      className={cn(
        className,
        "inline-flex h-12 items-center rounded-lg px-6 text-base font-medium",
        style === "primary"
          ? "text-white bg-store-accent transition-colors hover:bg-store-accent-hover"
          : onImage
            ? "border border-white/70 text-white transition-colors hover:bg-white/10"
            : "border border-border-strong transition-colors hover:bg-surface-hover",
      )}
    >
      {label}
    </Link>
  );
}
