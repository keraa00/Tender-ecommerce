import "server-only";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

import { isUuid } from "@/lib/ids";

/**
 * Anonymous cart identity. One opaque id per browser, shared by every
 * storefront; the `Cart` row is keyed by (store, session), so each store still
 * gets its own cart and none can see another's.
 *
 * httpOnly because nothing in the browser needs to read it, and a script that
 * could would be able to lift someone's cart.
 */

const CART_COOKIE = "tender_cart";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

/** The current session id, or null when this browser has never added anything. */
export async function readCartSessionId(): Promise<string | null> {
  const value = (await cookies()).get(CART_COOKIE)?.value;
  return isUuid(value) ? value : null;
}

/**
 * The current session id, minting one if needed. Writes a cookie, so it may
 * only be called from a Server Action or Route Handler.
 */
export async function ensureCartSessionId(): Promise<string> {
  const existing = await readCartSessionId();
  const id = existing ?? randomUUID();

  // Re-set on every write so an active cart's expiry keeps sliding forward.
  (await cookies()).set(CART_COOKIE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: THIRTY_DAYS,
  });

  return id;
}
