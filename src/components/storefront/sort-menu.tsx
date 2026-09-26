"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { CatalogSort } from "@/lib/products/sort";

/** Rewrites `?sort=` in place; the page re-renders on the server. */
export function SortMenu({
  value,
  options,
  label,
}: {
  value: CatalogSort;
  options: { value: CatalogSort; label: string }[];
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => {
          const params = new URLSearchParams(searchParams);
          params.set("sort", event.target.value);
          router.replace(`${pathname}?${params}`, { scroll: false });
        }}
        className="h-9 cursor-pointer rounded-lg border border-border-strong bg-surface px-2.5 text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
