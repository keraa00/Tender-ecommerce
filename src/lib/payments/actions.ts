"use server";

import { redirect } from "next/navigation";

import { format } from "@/lib/i18n/format";
import { getAdminI18n } from "@/lib/i18n/server";
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
  const [{ user, store, membership }, { t: messages }] = await Promise.all([
    getStoreContext(storeSlug),
    getAdminI18n(),
  ]);
  const t = messages.settings.connect;

  if (!canManagePayments(membership)) {
    return { formError: t.ownerOnly };
  }
  if (!isStripeConfigured()) {
    return { formError: t.notConfigured };
  }

  // Only posted while the store has no account; continuing setup sends none.
  const rawCountry = formData.get("country");
  const country = isStripeMerchantCountry(rawCountry) ? rawCountry : null;
  if (rawCountry !== null && !country) {
    return { fieldErrors: { country: t.countryRequired } };
  }

  let url: string;
  try {
    const accountId = await ensureConnectedAccount(store, user.email, country);
    url = await createOnboardingLink(store.slug, accountId);
  } catch (error) {
    if (error instanceof CountryRequiredError) {
      return { fieldErrors: { country: t.countryRequired } };
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
          ? format(t.refused, { message })
          : t.unreachable,
    };
  }

  // Outside the try block: redirect() signals by throwing.
  redirect(url);
}
