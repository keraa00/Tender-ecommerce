import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { AdminPage } from "@/components/admin/page-shell";
import { ConnectStripeButton } from "@/components/settings/connect-stripe-button";
import { Badge } from "@/components/ui/badge";
import { StoreStatus } from "@/lib/db/types";
import { acceptLanguageRegions } from "@/lib/checkout/country";
import {
  retrieveAccount,
  syncStoreFromAccount,
  type ConnectedAccount,
} from "@/lib/payments/accounts";
import { startStripeOnboardingAction } from "@/lib/payments/actions";
import {
  accountReadiness,
  STRIPE_MERCHANT_COUNTRIES,
  type StoreStripeFields,
} from "@/lib/payments/rules";
import { getStoreContext } from "@/lib/stores/context";
import { canManagePayments } from "@/lib/stores/policy";
import { isStripeConfigured, isStripeTestMode } from "@/lib/stripe/server";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/settings/payments">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const { store } = await getStoreContext(storeSlug);
  return { title: `Payments · Settings · ${store.name}` };
}

type Snapshot =
  | { kind: "unconfigured" }
  | { kind: "not-connected" }
  | { kind: "unreachable"; fields: StoreStripeFields }
  | { kind: "connected"; account: ConnectedAccount; fields: StoreStripeFields };

type CountryOption = { code: string; name: string };

/**
 * The countries a seller can connect from, named in English like the rest of
 * the admin, and a guess at theirs from the browser's languages.
 */
function countryChoices(acceptLanguage: string | null): { options: CountryOption[]; guess: string } {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const options = STRIPE_MERCHANT_COUNTRIES.map((code) => ({ code, name: names.of(code) ?? code })).sort(
    (a, b) => a.name.localeCompare(b.name, "en"),
  );
  const supported = new Set<string>(STRIPE_MERCHANT_COUNTRIES);
  const guess = acceptLanguageRegions(acceptLanguage).find((region) => supported.has(region)) ?? "";
  return { options, guess };
}

/**
 * Settings → Payments. Reads the connected account from Stripe on every view
 * and writes what it finds back onto the store, so returning from onboarding
 * shows the real state even before `account.updated` arrives.
 */
export default async function PaymentsSettingsPage(
  props: PageProps<"/dashboard/[storeSlug]/settings/payments">,
) {
  const { storeSlug } = await props.params;
  const { store, membership } = await getStoreContext(storeSlug);
  const canManage = canManagePayments(membership);
  const action = startStripeOnboardingAction.bind(null, storeSlug);
  const countries = countryChoices((await headers()).get("accept-language"));

  const cached: StoreStripeFields = {
    stripeOnboardingComplete: store.stripeOnboardingComplete,
    stripeChargesEnabled: store.stripeChargesEnabled,
    stripePayoutsEnabled: store.stripePayoutsEnabled,
    status: store.status,
  };

  let snapshot: Snapshot;
  if (!isStripeConfigured()) {
    snapshot = { kind: "unconfigured" };
  } else if (!store.stripeAccountId) {
    snapshot = { kind: "not-connected" };
  } else {
    try {
      const account = await retrieveAccount(store.stripeAccountId);
      const fields = account ? await syncStoreFromAccount(account) : null;
      snapshot =
        account && fields ? { kind: "connected", account, fields } : { kind: "not-connected" };
    } catch (error) {
      console.error("PaymentsSettingsPage: could not read the Stripe account", error);
      snapshot = { kind: "unreachable", fields: cached };
    }
  }

  return (
    <AdminPage
      title="Payments"
      description="Buyers pay by card and wallet through Stripe, straight into your own Stripe account."
    >
      <div className="space-y-6">
        <Panel snapshot={snapshot} canManage={canManage} action={action} countries={countries} />

        {snapshot.kind === "connected" || snapshot.kind === "unreachable" ? (
          snapshot.fields.status === StoreStatus.SUSPENDED ? (
            <p
              role="status"
              className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
            >
              This store is suspended by Tender, so checkout stays closed whatever
              Stripe says. Contact support.
            </p>
          ) : null
        ) : null}

        <div className="rounded-xl border border-border bg-surface-subtle p-5">
          <h3 className="text-sm font-medium">How payouts work</h3>
          <p className="mt-1 text-sm text-muted text-pretty">
            Each order is charged on your Stripe account. Tender&apos;s commission of{" "}
            <span className="tabular font-medium text-foreground">
              {(store.commissionBps / 100).toFixed(2)}%
            </span>{" "}
            is taken as an application fee, Stripe deducts its processing fee, and Stripe
            pays out the rest on your account&apos;s payout schedule. Refunds and disputes
            are handled in your Stripe Dashboard.
          </p>
        </div>
      </div>
    </AdminPage>
  );
}

function Panel({
  snapshot,
  canManage,
  action,
  countries,
}: {
  snapshot: Snapshot;
  canManage: boolean;
  action: Parameters<typeof ConnectStripeButton>[0]["action"];
  countries: { options: CountryOption[]; guess: string };
}) {
  const ownerOnly = (
    <p className="text-sm text-muted">Only the store owner can connect or change the Stripe account.</p>
  );

  switch (snapshot.kind) {
    case "unconfigured":
      return (
        <Card title="Stripe isn't configured" badge={<Badge tone="warning">Unavailable</Badge>}>
          <p>
            This server has no Stripe keys. Set <code>STRIPE_SECRET_KEY</code> and{" "}
            <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> — see the README&apos;s Payments
            section.
          </p>
        </Card>
      );

    case "not-connected":
      return (
        <Card title="Connect Stripe" badge={<Badge tone="warning">Not connected</Badge>}>
          <p>
            Buyers can browse your store, but checkout stays closed until you connect a
            Stripe account. Choose where your business is based — it can&apos;t be changed
            later — and Stripe will ask for your business details and a bank account for
            payouts. It takes a few minutes.
          </p>
          <div className="mt-4">
            {canManage ? (
              <ConnectStripeButton
                action={action}
                label="Connect with Stripe"
                countries={countries.options}
                defaultCountry={countries.guess}
              />
            ) : (
              ownerOnly
            )}
          </div>
          <p className="mt-3 text-xs">
            Not listed? Stripe isn&apos;t available to businesses there yet —{" "}
            <a
              href="https://stripe.com/global"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              see where it is
            </a>
            .
          </p>
        </Card>
      );

    case "unreachable":
      return (
        <Card title="Stripe account" badge={<StateBadge fields={snapshot.fields} />}>
          <p>
            Stripe couldn&apos;t be reached just now, so this shows the last known state.
            Reload to try again.
          </p>
        </Card>
      );

    case "connected": {
      const { account, fields } = snapshot;
      const due = accountReadiness(account).dueCount;
      const live = fields.stripeChargesEnabled;

      return (
        <Card title="Stripe account" badge={<StateBadge fields={fields} />}>
          {live ? (
            <p>Payments are live. Buyers can check out, and orders are charged on your account.</p>
          ) : fields.stripeOnboardingComplete ? (
            <p>
              Stripe has your details and is reviewing them. Checkout opens as soon as Stripe
              enables charges, usually within minutes.
              {due > 0 ? ` Stripe still needs ${due} more ${due === 1 ? "detail" : "details"}.` : ""}
            </p>
          ) : (
            <p>
              Setup isn&apos;t finished. Checkout opens once you&apos;ve given Stripe your
              business and payout details.
            </p>
          )}

          <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted">Account</dt>
            <dd className="font-mono text-xs leading-5">{account.id}</dd>
            {account.identity?.country ? (
              <>
                <dt className="text-muted">Country</dt>
                <dd>
                  {new Intl.DisplayNames(["en"], { type: "region" }).of(account.identity.country.toUpperCase()) ??
                    account.identity.country.toUpperCase()}
                </dd>
              </>
            ) : null}
            <dt className="text-muted">Charges</dt>
            <dd>{fields.stripeChargesEnabled ? "Enabled" : "Not yet enabled"}</dd>
            <dt className="text-muted">Payouts</dt>
            <dd>{fields.stripePayoutsEnabled ? "Enabled" : "Not yet enabled"}</dd>
            {isStripeTestMode() ? (
              <>
                <dt className="text-muted">Mode</dt>
                <dd>Test — no real money moves</dd>
              </>
            ) : null}
          </dl>

          <div className="mt-5 flex flex-wrap items-start gap-3">
            {canManage && (due > 0 || !fields.stripeOnboardingComplete) ? (
              <ConnectStripeButton action={action} label="Continue setup" />
            ) : null}
            <a
              href="https://dashboard.stripe.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center rounded-lg border border-border-strong bg-surface px-4 text-sm font-medium hover:bg-surface-hover"
            >
              Open Stripe Dashboard
            </a>
          </div>
          {!canManage ? <div className="mt-3">{ownerOnly}</div> : null}
        </Card>
      );
    }
  }
}

function StateBadge({ fields }: { fields: StoreStripeFields }) {
  if (fields.stripeChargesEnabled) return <Badge tone="success">Live</Badge>;
  if (fields.stripeOnboardingComplete) return <Badge tone="warning">Under review</Badge>;
  return <Badge tone="warning">Setup incomplete</Badge>;
}

function Card({ title, badge, children }: { title: string; badge: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">{title}</h2>
        {badge}
      </div>
      <div className="mt-2 text-sm text-muted text-pretty">{children}</div>
    </section>
  );
}
