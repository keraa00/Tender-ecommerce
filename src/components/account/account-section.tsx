import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * One card of account settings — the same panel the store settings forms are
 * built from, with a heading and a line saying what it is for. `danger` is
 * for the things that cannot be undone.
 */
export function AccountSection({
  title,
  description,
  tone = "default",
  children,
}: {
  title: string;
  description?: ReactNode;
  tone?: "default" | "danger";
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "space-y-4 rounded-xl border p-5",
        tone === "danger" ? "border-danger/30 bg-danger/5" : "border-border bg-surface",
      )}
    >
      <div>
        <h2
          className={cn(
            "text-sm font-medium tracking-tight",
            tone === "danger" && "text-danger",
          )}
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-sm text-muted text-pretty">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
