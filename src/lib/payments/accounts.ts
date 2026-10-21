import "server-only";

import { headers } from "next/headers";
import type Stripe from "stripe";

import { requestHost } from "@/lib/admin/host";
import { storeAdminUrl, storefrontUrl } from "@/lib/admin/links";
import { rootDb } from "@/lib/db/root";
import type { Store } from "@/lib/db/types";
import { getStripe } from "@/lib/stripe/server";
import {
  ACCOUNT_INCLUDE,
  connectedAccountParams,
  isAccountUnreachable,
  storeFieldsFromAccount,
  type StoreStripeFields,
} from "./rules";

/**
 * Connected accounts, through Stripe's Accounts v2 API: creating one for a
 * store, sending its owner through Stripe-hosted onboarding, and copying what
 * Stripe says about it onto the store row that gates checkout.
 *
 * Stripe is the source of truth for whether a seller can be paid. The store
 * columns are a cache of it, refreshed from `account.updated` and
 * `capability.updated`, and whenever the owner opens Settings → Payments — so
 * a missed webhook costs a page view, not a store stuck closed.
 *
 * Accounts created earlier through Accounts v1 are read and onboarded the same
 * way: Accounts v2 manages them too.
 */

export type ConnectedAccount = Stripe.V2.Core.Account;

/** Thrown when an account has to be created and no country was chosen. */
export class CountryRequiredError extends Error {
  constructor() {
    super("A country is required to create a connected account.");
    this.name = "CountryRequiredError";
  }
}

/**
 * The account with its merchant configuration and requirements, or null when
 * the stored id is unusable — see `isAccountUnreachable` — or the account was
 * closed.
 */
export async function retrieveAccount(accountId: string): Promise<ConnectedAccount | null> {
  try {
    const account = await getStripe().v2.core.accounts.retrieve(accountId, { include: ACCOUNT_INCLUDE });
    return account.closed ? null : account;
  } catch (error) {
    if (isAccountUnreachable(error)) return null;
    throw error;
  }
}

/**
 * The store's connected account id, creating the account when there is none
 * or the stored one is unusable — a leftover placeholder, a closed account, or
 * a test id under a live key. Creating one needs the country the business is
 * based in, which Accounts v2 asks for up front and never lets change.
 *
 * Two clicks racing here create one account: the idempotency key is the store,
 * the id being replaced, the country and the current minute, so both get the
 * same account back, and the compare-and-set below lets only one of them write
 * it. The minute is there because Stripe replays a key's first response —
 * errors included — for a day: a request refused before the owner fixed their
 * Stripe settings must not keep being refused after.
 */
export async function ensureConnectedAccount(
  store: Store,
  ownerEmail: string,
  country: string | null,
): Promise<string> {
  if (store.stripeAccountId) {
    const existing = await retrieveAccount(store.stripeAccountId);
    if (existing) return existing.id;
  }
  if (!country) throw new CountryRequiredError();

  const account = await getStripe().v2.core.accounts.create(
    connectedAccountParams({
      storeId: store.id,
      storeSlug: store.slug,
      storeName: store.name,
      ownerEmail,
      country,
      website: publicUrl(storefrontUrl(store.slug)),
    }),
    {
      idempotencyKey: `connect-account:${store.id}:${store.stripeAccountId ?? "none"}:${country}:${Math.floor(Date.now() / 60_000)}`,
    },
  );

  const saved = await rootDb.store.updateMany({
    where: { id: store.id, stripeAccountId: store.stripeAccountId },
    data: {
      stripeAccountId: account.id,
      stripeOnboardingComplete: false,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
    },
  });
  if (saved.count === 1) return account.id;

  // Someone else replaced the id first; theirs stands.
  const current = await rootDb.store.findUniqueOrThrow({
    where: { id: store.id },
    select: { stripeAccountId: true },
  });
  return current.stripeAccountId ?? account.id;
}

/**
 * A single-use link into Stripe-hosted onboarding. It expires within minutes,
 * which is why the refresh URL is a route that mints a new one rather than a
 * page.
 */
export async function createOnboardingLink(slug: string, accountId: string): Promise<string> {
  const [refreshUrl, returnUrl] = await Promise.all([
    adminAbsoluteUrl(slug, "settings/payments/refresh"),
    adminAbsoluteUrl(slug, "settings/payments?onboarding=returned"),
  ]);

  const link = await getStripe().v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: { refresh_url: refreshUrl, return_url: returnUrl },
    },
  });
  return link.url;
}

/**
 * Copies the account's state onto the store it belongs to. Null when no store
 * holds the account — it was replaced, or belongs to another environment.
 */
export async function syncStoreFromAccount(account: ConnectedAccount): Promise<StoreStripeFields | null> {
  const store = await rootDb.store.findUnique({
    where: { stripeAccountId: account.id },
    select: { id: true, status: true, stripeChargesEnabled: true },
  });
  if (!store) return null;

  const fields = storeFieldsFromAccount(account, store.status);
  await rootDb.store.update({ where: { id: store.id }, data: fields });

  if (!store.stripeChargesEnabled && fields.stripeChargesEnabled) {
    await registerPaymentMethodDomain(account.id);
  }

  return fields;
}

/**
 * The seller disconnected Tender from their Stripe account. Checkout closes;
 * the store keeps its orders, and connecting again starts a new account.
 */
export async function disconnectAccount(accountId: string): Promise<void> {
  await rootDb.store.updateMany({
    where: { stripeAccountId: accountId },
    data: {
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
    },
  });
}

/**
 * Apple Pay and Google Pay only show on domains registered with the account
 * that takes the charge — with direct charges, the seller's. Storefronts all
 * live on the platform's root host, so that one domain is registered per
 * account. Skipped where there is no public https host, as in development.
 */
async function registerPaymentMethodDomain(accountId: string): Promise<void> {
  const appUrl = publicUrl(process.env.NEXT_PUBLIC_APP_URL ?? "");
  if (!appUrl) return;

  try {
    await getStripe().paymentMethodDomains.create(
      { domain_name: new URL(appUrl).hostname },
      { stripeContext: accountId },
    );
  } catch (error) {
    // Cards still work without it; wallets just stay hidden.
    console.error("registerPaymentMethodDomain failed", error);
  }
}

/**
 * An absolute URL to a page in the store's admin, for Stripe to send the
 * seller back to. `storeAdminUrl` is relative when the admin has no host of
 * its own (local development), so it is resolved against the app URL, or the
 * host this request came in on.
 */
export async function adminAbsoluteUrl(slug: string, section: string): Promise<string> {
  const url = storeAdminUrl(slug, section);
  if (/^https?:\/\//.test(url)) return url;

  let base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) {
    const requestHeaders = await headers();
    const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
    base = `${protocol}://${requestHost(requestHeaders)}`;
  }
  return new URL(url, base).toString();
}

/** The URL when it is public https, which is all Stripe accepts as a website. */
function publicUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const local = parsed.hostname === "localhost" || parsed.hostname.endsWith(".localhost");
    return parsed.protocol === "https:" && !local ? parsed.toString() : null;
  } catch {
    return null;
  }
}
