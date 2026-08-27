import { ButtonLink } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { StoreCard } from "@/components/store-card";
import { getCurrentUser } from "@/lib/auth/session";
import { listPublicStores } from "@/lib/stores/queries";

const STEPS = [
  {
    title: "Open a store",
    body: "Pick a name and an address. Your storefront goes live at /s/your-slug straight away.",
  },
  {
    title: "Connect Stripe",
    body: "One OAuth redirect. Stripe handles identity checks and payouts; we never touch your bank details.",
  },
  {
    title: "Get paid",
    body: "Buyers pay you directly. The platform commission is split off automatically at the moment of the charge.",
  },
];

export default async function HomePage() {
  const [stores, user] = await Promise.all([
    listPublicStores(6),
    getCurrentUser(),
  ]);

  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 pt-16 pb-14 sm:px-6 sm:pt-24">
          <p className="text-sm font-medium text-muted">
            Multi-tenant commerce
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Open a store. Take real payments. Keep 95%.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted text-pretty">
            Kiosk gives every seller an isolated storefront, their own catalogue
            and their own Stripe account. The platform takes a 5% commission at
            the moment of the charge — nothing else.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href={user ? "/dashboard" : "/signup"} size="lg">
              {user ? "Go to dashboard" : "Start selling"}
            </ButtonLink>
            {stores.length > 0 && (
              <ButtonLink
                href={`/s/${stores[0].slug}`}
                size="lg"
                variant="secondary"
              >
                Browse a demo store
              </ButtonLink>
            )}
          </div>
        </section>

        <section className="border-y border-border bg-surface-subtle">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6">
            {STEPS.map((step, index) => (
              <div key={step.title}>
                <span className="text-sm font-semibold text-muted tabular">
                  0{index + 1}
                </span>
                <h2 className="mt-2 font-medium tracking-tight">{step.title}</h2>
                <p className="mt-1.5 text-sm text-muted text-pretty">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Stores on Kiosk
              </h2>
              <p className="mt-1 text-sm text-muted">
                Every store below is a separate tenant. None can see
                another&apos;s products, orders or revenue.
              </p>
            </div>
          </div>

          {stores.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-border-strong px-6 py-14 text-center">
              <p className="font-medium">No stores yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted text-pretty">
                Run <code className="font-mono text-xs">npm run db:seed</code>{" "}
                to load the demo stores, or open the first one yourself.
              </p>
              <ButtonLink href="/signup" className="mt-5" size="sm">
                Open a store
              </ButtonLink>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {stores.map((store) => (
                <StoreCard
                  key={store.id}
                  store={store}
                  productCount={store._count.products}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 text-sm text-muted sm:px-6">
          Kiosk — a multi-tenant marketplace built on Next.js, Postgres and
          Stripe Connect.
        </div>
      </footer>
    </>
  );
}
