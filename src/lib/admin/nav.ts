/**
 * The seller admin's left-hand navigation.
 *
 * `segment` is the route segment *relative to the store*, which is exactly what
 * `useSelectedLayoutSegment()` reports from the store layout — null on the
 * store's own page, the folder name on every nested one. Deriving the active
 * item that way rather than by comparing pathnames keeps it correct on the
 * admin subdomain, where the URL in the address bar (`/acme/orders`) is not the
 * internal route (`/dashboard/acme/orders`).
 *
 * Labels are keys into the admin messages rather than English, so the drawer
 * and the tabs read in the seller's language.
 */

import type { AdminMessages } from "@/lib/i18n/admin";

export type AdminIcon =
  | "home"
  | "orders"
  | "products"
  | "collections"
  | "customers"
  | "discounts"
  | "analytics"
  | "online-store"
  | "settings"
  | "general"
  | "payments"
  | "shipping"
  | "checkout"
  | "profile"
  | "security"
  | "privacy";

/** A label in the seller's language: a key of the admin messages' `nav`. */
export type NavLabel = keyof AdminMessages["nav"];

export type AdminSection = {
  /** Path segment under the store, or null for the store's home page. */
  segment: string | null;
  label: NavLabel;
  icon: AdminIcon;
  /** Also offers a shortcut that opens the live storefront in a new tab. */
  opensStorefront?: boolean;
};

/** A run of sections, set apart from the one before it by a divider. */
export type AdminNavGroup = {
  /** Shown above the group. The first group has none. */
  label?: NavLabel;
  sections: readonly AdminSection[];
};

export const ADMIN_NAV: readonly AdminNavGroup[] = [
  {
    sections: [
      { segment: null, label: "home", icon: "home" },
      { segment: "orders", label: "orders", icon: "orders" },
      { segment: "products", label: "products", icon: "products" },
      { segment: "collections", label: "collections", icon: "collections" },
      { segment: "customers", label: "customers", icon: "customers" },
      { segment: "discounts", label: "discounts", icon: "discounts" },
      { segment: "analytics", label: "analytics", icon: "analytics" },
    ],
  },
  {
    // Where the store is sold. One channel today; the label is what makes room
    // for the next without moving anything.
    label: "salesChannel",
    sections: [
      {
        segment: "online-store",
        label: "onlineStore",
        icon: "online-store",
        opensStorefront: true,
      },
    ],
  },
  { sections: [{ segment: "settings", label: "settings", icon: "settings" }] },
];

/**
 * The pages inside Settings, as a second row of navigation. `segment` is
 * relative to the settings layout — null on Settings itself — which is what
 * `useSelectedLayoutSegment()` reports from there. The drawer above still
 * sees `settings` on every one of them, so it keeps Settings lit throughout.
 */
export type SettingsSection = {
  segment: string | null;
  label: NavLabel;
  icon: AdminIcon;
};

export const SETTINGS_NAV: readonly SettingsSection[] = [
  { segment: null, label: "general", icon: "general" },
  { segment: "payments", label: "payments", icon: "payments" },
  { segment: "shipping", label: "shipping", icon: "shipping" },
  { segment: "checkout", label: "checkout", icon: "checkout" },
];

/** The path of a settings page under the store, for `storeAdminPath`. */
export function settingsPath(segment: string | null): string {
  return segment ? `settings/${segment}` : "settings";
}

/**
 * The tabs of account settings, at `/dashboard/account`. Shaped like
 * `SETTINGS_NAV`: `segment` is relative to the account layout, null on the
 * profile page. Account settings belong to the platform, not to a store, so
 * these are plain root-host paths — see `PLATFORM_DASHBOARD_SEGMENTS`.
 */
export const ACCOUNT_NAV: readonly SettingsSection[] = [
  { segment: null, label: "profile", icon: "profile" },
  { segment: "security", label: "security", icon: "security" },
  { segment: "privacy", label: "privacy", icon: "privacy" },
];

/** The path of an account settings page, on the root host. */
export function accountPath(segment: string | null = null): string {
  return segment ? `/dashboard/account/${segment}` : "/dashboard/account";
}
