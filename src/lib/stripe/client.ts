import { loadStripe, type Stripe } from "@stripe/stripe-js";

/**
 * Stripe.js for one connected account, loaded once per account.
 *
 * Charges are direct, so Stripe.js has to act as the seller's account to
 * confirm a PaymentIntent that lives there. `<Elements stripe>` must not
 * change identity between renders — it would remount the Payment Element and
 * drop what the buyer typed — hence the module-level cache rather than a call
 * in render.
 */
const cache = new Map<string, Promise<Stripe | null>>();

export function stripeForAccount(
  publishableKey: string,
  stripeAccount: string,
): Promise<Stripe | null> {
  const key = `${publishableKey}:${stripeAccount}`;
  let promise = cache.get(key);
  if (!promise) {
    promise = loadStripe(publishableKey, { stripeAccount });
    cache.set(key, promise);
  }
  return promise;
}
