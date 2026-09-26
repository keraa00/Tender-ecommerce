import * as z from "zod";

const uuid = z.uuid();

/**
 * Ids reach us in URLs and form fields. Postgres rejects a malformed uuid with
 * an error rather than an empty result, so anything that is not one is turned
 * away before it becomes a 500.
 */
export function isUuid(value: unknown): value is string {
  return uuid.safeParse(value).success;
}
