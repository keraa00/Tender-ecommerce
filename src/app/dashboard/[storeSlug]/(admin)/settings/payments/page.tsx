import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { AdminPage } from "@/components/admin/page-shell";
import { CodSettingsForm } from "@/components/settings/cod-settings-form";
import { ConnectStripeButton } from "@/components/settings/connect-stripe-button";
import { Badge } from "@/components/ui/badge";
import { countryOptions, DELIVERABLE_COUNTRY_CODES } from "@/lib/address/countries";
import { StoreStatus } from "@/lib/db/types";
import { acceptLanguageRegions } from "@/lib/checkout/country";
import { plural } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";
import type { Locale } from "@/lib/i18n/locales";
import { formatRich } from "@/lib/i18n/rich";
import { getAdminI18n } from "@/lib/i18n/server";
import { currencySymbol } from "@/lib/money";
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
import { loadZoneRules } from "@/lib/shipping/queries";
import { shipsTo } from "@/lib/shipping/rates";
import { updateCodSettingsAction } from "@/lib/stores/actions";
import { getStoreContext } from "@/lib/stores/context";
import { canManagePayments, stripeReady } from "@/lib/stores/policy";
import { codSettingsFormValues } from "@/lib/stores/settings-form";
import { isStripeConfigured, isStripeTestMode } from "@/lib/stripe/server";

export async function generateMetadata(
  props: PageProps<"/dashboard/[storeSlug]/settings/payments">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);
  return { title: `${t.settings.payments.title} · ${t.nav.settings} · ${store.name}` };
}

type Snapshot =
  | { kind: "unconfigured" }
  | { kind: "not-connected" }
  | { kind: "unreachable"; fields: StoreStripeFields }
  | { kind: "connected"; account: ConnectedAccount; fields: StoreStripeFields };

type CountryOption = { code: string; name: string };

type PaymentsCopy = AdminMessages["settings"]["payments"];

/**
 * The countries a seller can connect from, named in the admin's language like
 * the rest of it, and a guess at theirs from the browser's languages.
 */
function countryChoices(
  acceptLanguage: string | null,
  intl: string,
): { options: CountryOption[]; guess: string } {
  const names = new Intl.DisplayNames([intl], { type: "region" });
  const options = STRIPE_MERCHANT_COUNTRIES.map((code) => ({ code, name: names.of(code) ?? code })).sort(
    (a, b) => a.name.localeCompare(b.name, intl),
  );
  const supported = new Set<string>(STRIPE_MERCHANT_COUNTRIES);
  const guess = acceptLanguageRegions(acceptLanguage).find((region) => supported.has(region)) ?? "";
  return { options, guess };
}

/**
 * Settings → Payments: Stripe, and cash on delivery. Reads the connected
 * account from Stripe on every view and writes what it finds back onto the
 * store, so returning from onboarding shows the real state even before
 * `account.updated` arrives.
 *
 * Connecting Stripe is the owner's alone; cash on delivery is checkout
 * configuration like shipping, open to every member.
 */
export default async function PaymentsSettingsPage(
  props: PageProps<"/dashboard/[storeSlug]/settings/payments">,
) {
  const { storeSlug } = await props.params;
  const [{ store, membership }, { t: messages, locale, intl }] = await Promise.all([
    getStoreContext(storeSlug),
    getAdminI18n(),
  ]);
  const t = messages.settings.payments;
  const canManage = canManagePayments(membership);
  const action = startStripeOnboardingAction.bind(null, storeSlug);
  const [requestHeaders, zones] = await Promise.all([headers(), loadZoneRules(store.id)]);
  const countries = countryChoices(requestHeaders.get("accept-language"), intl);

  // Cash on delivery is offered where the store ships. Countries chosen before
  // a zone was removed stay listed, so saving does not quietly drop them.
  const coverage = shipsTo(zones);
  const shippable = coverage.everywhere ? DELIVERABLE_COUNTRY_CODES : coverage.countryCodes;
  const codCountries = countryOptions(
    [...new Set([...shippable, ...store.codCountryCodes])],
    intl,
  );

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
      title={t.title}
      description={t.description}
    >
      <div className="space-y-6">
        <Panel
          snapshot={snapshot}
          canManage={canManage}
          action={action}
          countries={countries}
          t={t}
          locale={locale}
          intl={intl}
          connectCopy={messages.settings.connect}
        />

        <section className="rounded-xl border border-border bg-surface p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-medium">{t.cod}</h2>
            {store.codEnabled ? <Badge tone="success">{t.on}</Badge> : <Badge>{t.off}</Badge>}
          </div>
          <CodSettingsForm
            action={updateCodSettingsAction.bind(null, storeSlug)}
            values={codSettingsFormValues(store)}
            currencySymbol={currencySymbol(store.currency, intl)}
            countries={codCountries}
            stripeLive={stripeReady(store)}
            t={messages.settings.cod}
            saveLabel={messages.common.saveChanges}
          />
        </section>

        {snapshot.kind === "connected" || snapshot.kind === "unreachable" ? (
          snapshot.fields.status === StoreStatus.SUSPENDED ? (
            <p
              role="status"
              className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
            >
              {t.suspended}
            </p>
          ) : null
        ) : null}

        <div className="rounded-xl border border-border bg-surface-subtle p-5">
          <h3 className="text-sm font-medium">{t.payoutsTitle}</h3>
          <p className="mt-1 text-sm text-muted text-pretty">
            {formatRich(t.payoutsBody, {
              rate: (
                <span className="tabular font-medium text-foreground">
                  {new Intl.NumberFormat(intl, {
                    style: "percent",
                    minimumFractionDigits: 2,
                  }).format(store.commissionBps / 10000)}
                </span>
              ),
            })}
          </p>
          <p className="mt-2 text-sm text-muted text-pretty">{t.payoutsCod}</p>
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
  t,
  locale,
  intl,
  connectCopy,
}: {
  snapshot: Snapshot;
  canManage: boolean;
  action: Parameters<typeof ConnectStripeButton>[0]["action"];
  countries: { options: CountryOption[]; guess: string };
  t: PaymentsCopy;
  locale: Locale;
  intl: string;
  connectCopy: AdminMessages["settings"]["connect"];
}) {
  const ownerOnly = <p className="text-sm text-muted">{t.ownerOnly}</p>;

  switch (snapshot.kind) {
    case "unconfigured":
      return (
        <Card title={t.unconfiguredTitle} badge={<Badge tone="warning">{t.unavailable}</Badge>}>
          <p>
            {formatRich(t.unconfiguredBody, {
              secret: <code>STRIPE_SECRET_KEY</code>,
              publishable: <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>,
            })}
          </p>
        </Card>
      );

    case "not-connected":
      return (
        <Card title={t.connectTitle} badge={<Badge tone="warning">{t.notConnected}</Badge>}>
          <p>{t.connectBody}</p>
          <div className="mt-4">
            {canManage ? (
              <ConnectStripeButton
                action={action}
                label={t.connectButton}
                countries={countries.options}
                defaultCountry={countries.guess}
                t={connectCopy}
              />
            ) : (
              ownerOnly
            )}
          </div>
          <p className="mt-3 text-xs">
            {formatRich(t.notListed, {
              link: (
                <a
                  href="https://stripe.com/global"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  {t.seeWhere}
                </a>
              ),
            })}
          </p>
        </Card>
      );

    case "unreachable":
      return (
        <Card title={t.accountTitle} badge={<StateBadge fields={snapshot.fields} t={t} />}>
          <p>{t.unreachable}</p>
        </Card>
      );

    case "connected": {
      const { account, fields } = snapshot;
      const due = accountReadiness(account).dueCount;
      const live = fields.stripeChargesEnabled;

      return (
        <Card title={t.accountTitle} badge={<StateBadge fields={fields} t={t} />}>
          {live ? (
            <p>{t.live}</p>
          ) : fields.stripeOnboardingComplete ? (
            <p>
              {t.reviewing}
              {due > 0 ? ` ${plural(locale, due, t.detailsDue)}` : ""}
            </p>
          ) : (
            <p>{t.unfinished}</p>
          )}

          <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted">{t.account}</dt>
            <dd className="font-mono text-xs leading-5">{account.id}</dd>
            {account.identity?.country ? (
              <>
                <dt className="text-muted">{t.country}</dt>
                <dd>
                  {new Intl.DisplayNames([intl], { type: "region" }).of(account.identity.country.toUpperCase()) ??
                    account.identity.country.toUpperCase()}
                </dd>
              </>
            ) : null}
            <dt className="text-muted">{t.charges}</dt>
            <dd>{fields.stripeChargesEnabled ? t.enabled : t.notEnabled}</dd>
            <dt className="text-muted">{t.payouts}</dt>
            <dd>{fields.stripePayoutsEnabled ? t.enabled : t.notEnabled}</dd>
            {isStripeTestMode() ? (
              <>
                <dt className="text-muted">{t.mode}</dt>
                <dd>{t.testMode}</dd>
              </>
            ) : null}
          </dl>

          <div className="mt-5 flex flex-wrap items-start gap-3">
            {canManage && (due > 0 || !fields.stripeOnboardingComplete) ? (
              <ConnectStripeButton action={action} label={t.continueSetup} t={connectCopy} />
            ) : null}
            <a
              href="https://dashboard.stripe.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center rounded-lg border border-border-strong bg-surface px-4 text-sm font-medium hover:bg-surface-hover"
            >
              {t.openDashboard}
            </a>
          </div>
          {!canManage ? <div className="mt-3">{ownerOnly}</div> : null}
        </Card>
      );
    }
  }
}

function StateBadge({ fields, t }: { fields: StoreStripeFields; t: PaymentsCopy }) {
  if (fields.stripeChargesEnabled) return <Badge tone="success">{t.badgeLive}</Badge>;
  if (fields.stripeOnboardingComplete) return <Badge tone="warning">{t.badgeReview}</Badge>;
  return <Badge tone="warning">{t.badgeIncomplete}</Badge>;
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
