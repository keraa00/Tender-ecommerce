"use server";

import { redirect } from "next/navigation";

import { getStoreContext } from "@/lib/stores/context";
import { canManagePayments } from "@/lib/stores/policy";
import { isStripeConfigured } from "@/lib/stripe/server";
import { createOnboardingLink, ensureConnectedAccount } from "./accounts";

export type PaymentsFormState = {
  formError?: string;
};

/**
 * Settings → Payments → Connect / Continue setup. Creates the store's
 * connected account if it has none, then sends the owner to Stripe-hosted
 * onboarding. Stripe sends them back to Settings → Payments, which reads the
 * account's state fresh — the webhook may not have arrived yet.
 */
export async function startStripeOnboardingAction(
  storeSlug: string,
  _prev: PaymentsFormState,
  _formData: FormData,
): Promise<PaymentsFormState> {
  const { user, store, membership } = await getStoreContext(storeSlug);

  if (!canManagePayments(membership)) {
    return { formError: "Only the store owner can set up payments." };
  }
  if (!isStripeConfigured()) {
    return { formError: "Stripe is not configured on this server yet." };
  }

  let url: string;
  try {
    const accountId = await ensureConnectedAccount(store, user.email);
    url = await createOnboardingLink(store.slug, accountId);
  } catch (error) {
    console.error("startStripeOnboardingAction failed", error);
    // Stripe refusing the request is a setup problem the owner can fix in
    // their Stripe Dashboard, and its message says how; only an owner sees
    // this page. Anything else — a timeout, a 5xx — is worth a retry.
    const refused = (error as { type?: unknown }).type === "StripeInvalidRequestError";
    const message = (error as { message?: unknown }).message;
    return {
      formError:
        refused && typeof message === "string"
          ? `Stripe refused the request: ${message}`
          : "Could not reach Stripe. Please try again.",
    };
  }

  // Outside the try block: redirect() signals by throwing.
  redirect(url);
}
