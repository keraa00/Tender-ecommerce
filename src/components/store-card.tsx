import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import type { Store } from "@/lib/db/types";

type StoreCardStore = Pick<
  Store,
  "slug" | "name" | "description" | "logoUrl" | "bannerUrl" | "accentColor"
>;

export function StoreCard({
  store,
  productCount,
}: {
  store: StoreCardStore;
  productCount?: number;
}) {
  const accent = store.accentColor ?? "var(--primary)";

  return (
    <Link
      href={`/s/${store.slug}`}
      style={{ "--store-accent": accent } as CSSProperties}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-[var(--store-accent)]"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-surface-subtle">
        {store.bannerUrl ? (
          <Image
            src={store.bannerUrl}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            aria-hidden
            className="h-full w-full"
            style={{
              background:
                "linear-gradient(135deg, var(--store-accent) 0%, transparent 140%)",
            }}
          />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: "var(--store-accent)" }}
          />
          <h3 className="font-medium tracking-tight">{store.name}</h3>
        </div>

        {store.description && (
          <p className="line-clamp-2 text-sm text-muted">{store.description}</p>
        )}

        <p className="mt-auto pt-2 text-xs text-muted tabular">
          /s/{store.slug}
          {typeof productCount === "number" && (
            <> · {productCount} {productCount === 1 ? "product" : "products"}</>
          )}
        </p>
      </div>
    </Link>
  );
}
