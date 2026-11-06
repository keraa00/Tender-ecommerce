import { StoreCard } from "@/components/store-card";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { listPublicStores } from "@/lib/stores/queries";

type PublicStore = Awaited<ReturnType<typeof listPublicStores>>[number];

/** The landing pages' store cards — the home page's first few, and /stores. */
export function StoreGrid({
  stores,
  className,
}: {
  stores: PublicStore[];
  className?: string;
}) {
  if (stores.length === 0) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-dashed border-border-strong bg-surface/60 px-6 py-14 text-center backdrop-blur",
          className,
        )}
      >
        <p className="font-medium">No stores yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted text-pretty">
          Run <code className="font-mono text-xs">npm run db:seed</code> to load
          the demo stores, or open the first one yourself.
        </p>
        <ButtonLink href="/signup" className="mt-5" size="sm">
          Open a store
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-5 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {stores.map((store) => (
        <StoreCard
          key={store.id}
          store={store}
          productCount={store._count.products}
        />
      ))}
    </div>
  );
}
