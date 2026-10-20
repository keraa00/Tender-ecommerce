import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { storeAdminPath } from "@/lib/admin/links";
import { createOnboardingLink, ensureConnectedAccount } from "@/lib/payments/accounts";
import { getStoreContext } from "@/lib/stores/context";
import { canManagePayments } from "@/lib/stores/policy";
import { isStripeConfigured } from "@/lib/stripe/server";

/**
 * Stripe's `refresh_url`: where an onboarding link that has expired, or was
 * already used (a reload, the back button), sends the seller. Mints a new
 * link and goes straight back to Stripe, so they never see the dead end.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/dashboard/[storeSlug]/settings/payments/refresh">,
) {
  const { storeSlug } = await ctx.params;
  const { user, store, membership } = await getStoreContext(storeSlug);
  const settings = storeAdminPath(storeSlug, "settings/payments");

  if (!canManagePayments(membership) || !isStripeConfigured()) redirect(settings);

  let url: string;
  try {
    const accountId = await ensureConnectedAccount(store, user.email);
    url = await createOnboardingLink(store.slug, accountId);
  } catch (error) {
    console.error("Stripe onboarding refresh failed", error);
    url = settings;
  }

  redirect(url);
}
