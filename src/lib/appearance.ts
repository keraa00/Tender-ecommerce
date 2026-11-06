/**
 * The landing pages' light/dark pick. Kept in a cookie rather than local
 * storage so the server renders the chosen scheme into the first paint, with
 * no flash of the other one. No cookie means the page follows the system.
 *
 * Dependency-free, so the client-side toggle can import it.
 */
export const APPEARANCE_COOKIE = "tender-appearance";

export type Appearance = "light" | "dark";

export function parseAppearance(value: string | undefined): Appearance | undefined {
  return value === "light" || value === "dark" ? value : undefined;
}
