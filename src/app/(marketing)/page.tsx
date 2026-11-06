import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { StoreGrid } from "@/components/store-grid";
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
    <>
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

        {/* The footer's "How it works" lands here; `scroll-mt-14` keeps the
            cards clear of the sticky header. */}
        <section
          id="how-it-works"
          className="scroll-mt-14 border-y border-border bg-linear-to-br from-home-mist via-home-veil to-home-sky"
        >
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
            {stores.length > 0 && (
              <Link
                href="/stores"
                className="shrink-0 text-sm font-medium text-accent underline-offset-4 hover:underline"
              >
                View all stores →
              </Link>
            )}
          </div>

          <StoreGrid stores={stores} className="mt-6" />
        </section>
      </main>
    </>
  );
}
