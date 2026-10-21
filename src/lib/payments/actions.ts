"use server";

import { redirect } from "next/navigation";

import { getStoreContext } from "@/lib/stores/context";
import { canManagePayments } from "@/lib/stores/policy";
import { isStripeConfigured } from "@/lib/stripe/server";
import { CountryRequiredError, createOnboardingLink, ensureConnectedAccount } from "./accounts";
import { isStripeMerchantCountry } from "./rules";

export type PaymentsFormState = {
  formError?: string;
  fieldErrors?: { country?: string };
};

/**
 * Settings → Payments → Connect / Continue setup. Creates the store's
 * connected account if it has none — in the country the owner picked, which
 * Accounts v2 needs up front — then sends the owner to Stripe-hosted
 * onboarding. Stripe sends them back to Settings → Payments, which reads the
 * account's state fresh; the webhook may not have arrived yet.
 */
export async function startStripeOnboardingAction(
  storeSlug: string,
  _prev: PaymentsFormState,
  formData: FormData,
): Promise<PaymentsFormState> {
  const { user, store, membership } = await getStoreContext(storeSlug);

  if (!canManagePayments(membership)) {
    return { formError: "Only the store owner can set up payments." };
  }
  if (!isStripeConfigured()) {
    return { formError: "Stripe is not configured on this server yet." };
  }

  // Only posted while the store has no account; continuing setup sends none.
  const rawCountry = formData.get("country");
  const country = isStripeMerchantCountry(rawCountry) ? rawCountry : null;
  if (rawCountry !== null && !country) {
    return { fieldErrors: { country: "Choose the country your business is based in." } };
  }

  let url: string;
  try {
    const accountId = await ensureConnectedAccount(store, user.email, country);
    url = await createOnboardingLink(store.slug, accountId);
  } catch (error) {
    if (error instanceof CountryRequiredError) {
      return { fieldErrors: { country: "Choose the country your business is based in." } };
    }
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
