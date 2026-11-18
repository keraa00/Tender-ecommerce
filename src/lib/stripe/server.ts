import "server-only";

import Stripe from "stripe";

/**
 * The platform's Stripe client, read lazily like the Supabase config: the
 * storefront and the build keep working before a Stripe account exists, and
 * checkout says "unavailable" instead of throwing about `undefined`.
 *
 * Every call that touches a seller's money passes `{ stripeContext:
 * store.stripeAccountId }` — charges are direct, so the PaymentIntent lives on
 * the connected account, not on the platform.
 */

let client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY) && stripePublishableKey() !== null;
}

export function stripePublishableKey(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null;
}

/** True when the configured secret key is a test-mode key. */
export function isStripeTestMode(): boolean {
  return /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY ?? "");
}

export function getStripe(): Stripe {
  if (client) return client;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY and " +
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in .env — see docs/setup.md → Payments.",
    );
  }

  client = new Stripe(key, {
    maxNetworkRetries: 2,
    appInfo: { name: "Tender" },
  });
  return client;
}
