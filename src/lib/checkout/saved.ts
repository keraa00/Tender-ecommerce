import "server-only";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

import { rootDb } from "@/lib/db/root";
import { isUuid } from "@/lib/ids";
import { readCheckoutDraft, type CheckoutDraft } from "./draft";

/**
 * "Save my information for next time": a buyer's checkout details, kept for
 * one store in one browser so the next checkout there starts filled in — and
 * priced, since the server renders it from them.
 *
 * The browser holds only a random token, in an httpOnly cookie, so nothing on
 * the page can read the details back out of it; the details themselves are a
 * `SavedCheckout` row per store. Saving happens when an order is placed with
 * the box ticked, and unticking it forgets them at once — what someone on a
 * shared computer would expect.
 */

const SAVED_COOKIE = "tender_saved_checkout";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

async function readToken(): Promise<string | null> {
  const value = (await cookies()).get(SAVED_COOKIE)?.value;
  return isUuid(value) ? value : null;
}

/**
 * The details this browser saved in this store, or null. A row older than the
 * cookie could be is ignored rather than trusted: the browser it belonged to
 * has forgotten it.
 */
export async function getSavedCheckout(
  storeId: string,
): Promise<{ email: string; draft: CheckoutDraft } | null> {
  const token = await readToken();
  if (!token) return null;

  const row = await rootDb.savedCheckout.findUnique({
    where: { storeId_token: { storeId, token } },
    select: { email: true, draft: true, updatedAt: true },
  });
  if (!row || Date.now() - row.updatedAt.getTime() > ONE_YEAR_SECONDS * 1000) return null;

  return { email: row.email, draft: readCheckoutDraft(row.draft) };
}

/**
 * Keeps this checkout's details for next time. Writes a cookie, so it may only
 * be called from a Server Action; every save pushes the year forward.
 */
export async function rememberCheckout(
  storeId: string,
  email: string,
  draft: CheckoutDraft,
): Promise<void> {
  const token = (await readToken()) ?? randomUUID();
  (await cookies()).set(SAVED_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ONE_YEAR_SECONDS,
  });

  await rootDb.savedCheckout.upsert({
    where: { storeId_token: { storeId, token } },
    create: { storeId, token, email, draft },
    update: { email, draft },
  });
}

/**
 * Forgets what this browser saved in this store. The cookie stays: the same
 * token may still hold details saved in another store.
 */
export async function forgetCheckout(storeId: string): Promise<void> {
  const token = await readToken();
  if (!token) return;
  await rootDb.savedCheckout.deleteMany({ where: { storeId, token } });
}
