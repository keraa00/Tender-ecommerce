import { z } from "zod";

import { format } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";

/**
 * Store slugs live at `/s/[storeSlug]`, so they cannot collide with top-level
 * routes. These are reserved anyway — partly to keep `/s/api` and friends free
 * for future use, partly so a seller cannot register a slug that reads like
 * platform infrastructure to a buyer.
 */
export const RESERVED_STORE_SLUGS = new Set([
  "account",
  "account-deleted",
  "admin",
  "api",
  "app",
  "auth",
  "billing",
  "cart",
  "checkout",
  "dashboard",
  "forgot-password",
  "help",
  "internal",
  "login",
  "logout",
  "new",
  "orders",
  "p",
  "platform",
  "reset-password",
  "s",
  "settings",
  "signup",
  "static",
  "stripe",
  "support",
  "system",
  "webhooks",
  "www",
]);

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 40;

/** Lowercase, alphanumeric, single hyphens, no leading/trailing hyphen. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}

/** The schemas' messages, in the seller's language: `t.validation.slug`. */
export type SlugMessages = AdminMessages["validation"]["slug"];

export function storeSlugSchema(t: SlugMessages) {
  return z
    .string()
    .trim()
    .toLowerCase()
    .min(SLUG_MIN_LENGTH, format(t.tooShort, { min: SLUG_MIN_LENGTH }))
    .max(SLUG_MAX_LENGTH, format(t.tooLong, { max: SLUG_MAX_LENGTH }))
    .regex(SLUG_PATTERN, t.pattern)
    .refine((value) => !RESERVED_STORE_SLUGS.has(value), { message: t.reserved });
}

/** Product and collection slugs are unique per store, so no reserved list. */
export function resourceSlugSchema(t: SlugMessages) {
  return z.string().trim().toLowerCase().min(1).max(80).regex(SLUG_PATTERN, t.pattern);
}
