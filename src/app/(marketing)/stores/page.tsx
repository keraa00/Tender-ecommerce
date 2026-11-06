import type { Metadata } from "next";

import { StoreGrid } from "@/components/store-grid";
import { ButtonLink } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { listPublicStores } from "@/lib/stores/queries";

export const metadata: Metadata = {
  title: "Stores",
  description: "Browse the independent stores selling on Tender.",
};

/** A showcase, not an index: the first stores, then the pitch to open one. */
const SHOWN = 20;

export default async function StoresPage() {
  const [stores, user] = await Promise.all([
    listPublicStores(SHOWN),
    getCurrentUser(),
  ]);

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] bg-linear-to-b from-home-sky via-home-mist to-background"
      />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 pt-14 pb-12 sm:px-6 sm:pt-20">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Stores on Tender
          </h1>
          <p className="mt-2 max-w-xl text-muted text-pretty">
            Independent sellers, each with their own storefront, catalogue and
            Stripe account. None can see another&apos;s products, orders or
            revenue.
          </p>

          <StoreGrid stores={stores} className="mt-8" />
        </section>

        {stores.length > 0 && (
          <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
            <div className="rounded-2xl border border-border bg-linear-to-br from-home-mist via-home-veil to-home-sky px-6 py-12 text-center shadow-sm">
              <p className="bg-linear-to-r from-primary to-accent bg-clip-text text-4xl font-semibold tracking-tight text-transparent sm:text-5xl">
                + many more
              </p>
              <h2 className="mt-4 text-xl font-semibold tracking-tight">
                Your store could be next
              </h2>
              <p className="mx-auto mt-2 max-w-md text-muted text-pretty">
                Pick a name, add a product and connect Stripe — you&apos;re open
                for business in under 2 minutes.
              </p>
              <ButtonLink
                href={user ? "/dashboard/new" : "/signup"}
                size="lg"
                className="mt-6"
              >
                {user ? "Open a store" : "Start selling"}
              </ButtonLink>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
