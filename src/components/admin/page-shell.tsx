import Link from "next/link";
import type { ReactNode } from "react";

import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Shared furniture for the admin sections. The store layout renders only
 * the drawer, so the content column's width, heading and empty states are
 * defined once here rather than copied into each page.
 */

export function AdminPage({
  title,
  description,
  action,
  back,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Breadcrumb up to the section a nested page belongs to. */
  back?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {back ? (
        <Link
          href={back.href}
          className="mb-4 inline-block text-sm text-muted underline-offset-4 hover:underline"
        >
          ← {back.label}
        </Link>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-muted text-pretty">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      <div className="mt-6">{children}</div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong px-6 py-16 text-center">
      <h2 className="font-medium">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted text-pretty">
        {children}
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</dl>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tracking-tight tabular">
        {value}
      </dd>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** The bordered, divided list every table-ish view in the admin uses. */
export function Rows({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "divide-y divide-border overflow-hidden rounded-xl border border-border",
        className,
      )}
    >
      {children}
    </ul>
  );
}

export function Row({
  children,
  interactive = false,
}: {
  children: ReactNode;
  interactive?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-4 bg-surface px-4 py-3",
        interactive && "transition-colors hover:bg-surface-hover",
      )}
    >
      {children}
    </li>
  );
}

/**
 * "51–100 of 173" with Previous and Next, under a list split into pages. The
 * caller builds the links, so each list keeps its own filters in them.
 */
export function Pager({
  from,
  to,
  total,
  prevHref,
  nextHref,
}: {
  from: number;
  to: number;
  total: number;
  /** Null on the first page. */
  prevHref: string | null;
  /** Null on the last page. */
  nextHref: string | null;
}) {
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-4 text-sm">
      <p className="text-muted tabular">
        {from}–{to} of {total}
      </p>
      <div className="flex gap-2">
        <PageLink href={prevHref} rel="prev">
          ← Previous
        </PageLink>
        <PageLink href={nextHref} rel="next">
          Next →
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({
  href,
  rel,
  children,
}: {
  href: string | null;
  rel: "prev" | "next";
  children: ReactNode;
}) {
  return href ? (
    <ButtonLink href={href} rel={rel} variant="secondary" size="sm">
      {children}
    </ButtonLink>
  ) : (
    <span
      aria-disabled
      className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-sm font-medium text-muted opacity-60"
    >
      {children}
    </span>
  );
}
