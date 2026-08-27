import { z } from "zod";

/**
 * Store slugs live at `/s/[storeSlug]`, so they cannot collide with top-level
 * routes. These are reserved anyway — partly to keep `/s/api` and friends free
 * for future use, partly so a seller cannot register a slug that reads like
 * platform infrastructure to a buyer.
 */
export const RESERVED_STORE_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "billing",
  "cart",
  "checkout",
  "dashboard",
  "help",
  "internal",
  "login",
  "logout",
  "new",
  "orders",
  "p",
  "platform",
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

export const storeSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(SLUG_MIN_LENGTH, `Must be at least ${SLUG_MIN_LENGTH} characters.`)
  .max(SLUG_MAX_LENGTH, `Must be at most ${SLUG_MAX_LENGTH} characters.`)
  .regex(
    SLUG_PATTERN,
    "Use lowercase letters, numbers and single hyphens only.",
  )
  .refine((value) => !RESERVED_STORE_SLUGS.has(value), {
    message: "That address is reserved. Try another.",
  });

/** Product and collection slugs are unique per store, so no reserved list. */
export const resourceSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(80)
  .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens only.");
