import { ButtonLink } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
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
    body: "A few minutes of Stripe-hosted onboarding. Stripe handles identity checks and payouts; we never touch your bank details.",
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
    // `theme-home` re-points the colour tokens at the blue palette for this
    // page only — see globals.css. The dashboard keeps the neutral chrome.
    // `overflow-x-clip` trims the glows that hang past the edges without a
    // sideways scroll; unlike `overflow-hidden` it keeps the header sticky.
    <div className="theme-home relative isolate flex flex-1 flex-col overflow-x-clip bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[42rem] bg-linear-to-b from-home-sky via-home-mist to-background"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-32 -z-10 h-[32rem] w-[32rem] rounded-full bg-[radial-gradient(circle,var(--home-glow),transparent_70%)] opacity-40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-40 -z-10 h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,var(--home-glow),transparent_70%)] opacity-25 blur-3xl"
      />

      <SiteHeader fullBleed />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 pt-16 pb-14 sm:px-6 sm:pt-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-sm font-medium text-muted shadow-sm backdrop-blur">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            Multi-tenant commerce
          </p>

          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Open a store. Take real payments.{" "}
            <span className="bg-linear-to-r from-primary to-accent bg-clip-text text-transparent">
              Keep 95%.
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-lg text-muted text-pretty">
            Tender gives every seller an isolated storefront, their own catalogue
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

        <section className="border-y border-border bg-linear-to-br from-home-mist via-home-veil to-home-sky">
          <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-14 sm:grid-cols-3 sm:px-6">
            {STEPS.map((step, index) => (
              <div
                key={step.title}
                className="rounded-2xl border border-border bg-surface/70 p-5 shadow-sm backdrop-blur transition-colors hover:border-border-strong hover:bg-surface"
              >
                <span
                  aria-hidden
                  className="grid h-8 w-8 place-items-center rounded-lg bg-linear-to-br from-primary to-accent text-xs font-semibold text-primary-foreground tabular"
                >
                  0{index + 1}
                </span>
                <h2 className="mt-3 font-medium tracking-tight">{step.title}</h2>
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
                Stores on Tender
              </h2>
              <p className="mt-1 text-sm text-muted">
                Every store below is a separate tenant. None can see
                another&apos;s products, orders or revenue.
              </p>
            </div>
          </div>

          {stores.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-border-strong bg-surface/60 px-6 py-14 text-center backdrop-blur">
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

      <SiteFooter />
    </div>
  );
}
