import "server-only";

import { headers } from "next/headers";
import type Stripe from "stripe";

import { requestHost } from "@/lib/admin/host";
import { storeAdminUrl, storefrontUrl } from "@/lib/admin/links";
import { rootDb } from "@/lib/db/root";
import type { Store } from "@/lib/db/types";
import { getStripe } from "@/lib/stripe/server";
import {
  CONNECT_CONTROLLER,
  isAccountUnreachable,
  storeFieldsFromAccount,
  type StoreStripeFields,
} from "./rules";

/**
 * Connected accounts: creating one for a store, sending its owner through
 * Stripe-hosted onboarding, and copying what Stripe says about it onto the
 * store row that gates checkout.
 *
 * Stripe is the source of truth for whether a seller can be paid. The store
 * columns are a cache of it, refreshed from `account.updated` and whenever the
 * owner opens Settings → Payments — so a missed webhook costs a page view, not
 * a store stuck closed.
 */

/** The account, or null when the stored id is unusable (see `isAccountUnreachable`). */
export async function retrieveAccount(accountId: string): Promise<Stripe.Account | null> {
  try {
    return await getStripe().accounts.retrieve(accountId);
  } catch (error) {
    if (isAccountUnreachable(error)) return null;
    throw error;
  }
}

/**
 * The store's connected account id, creating the account when there is none
 * or the stored one is unusable — a leftover placeholder, or a test id under a
 * live key.
 *
 * Two clicks racing here create one account: the idempotency key is the store,
 * the id being replaced and the current minute, so both get the same account
 * back, and the compare-and-set below lets only one of them write it. The
 * minute is there because Stripe replays a key's first response — errors
 * included — for a day: a request refused before the owner fixed their
 * Stripe settings must not keep being refused after.
 */
export async function ensureConnectedAccount(store: Store, ownerEmail: string): Promise<string> {
  if (store.stripeAccountId) {
    const existing = await retrieveAccount(store.stripeAccountId);
    if (existing) return existing.id;
  }

  const website = publicUrl(storefrontUrl(store.slug));
  const account = await getStripe().accounts.create(
    {
      controller: CONNECT_CONTROLLER,
      email: ownerEmail,
      business_profile: {
        name: store.name,
        // Stripe rejects localhost and other non-public URLs here.
        ...(website ? { url: website } : {}),
      },
      metadata: { store_id: store.id, store_slug: store.slug },
    },
    {
      idempotencyKey: `connect-account:${store.id}:${store.stripeAccountId ?? "none"}:${Math.floor(Date.now() / 60_000)}`,
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

  const link = await getStripe().accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: refreshUrl,
    return_url: returnUrl,
  });
  return link.url;
}

/**
 * Copies the account's state onto the store it belongs to. Null when no store
 * holds the account — it was replaced, or belongs to another environment.
 */
export async function syncStoreFromAccount(account: Stripe.Account): Promise<StoreStripeFields | null> {
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
