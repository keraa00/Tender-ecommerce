/**
 * The seller admin's left-hand navigation.
 *
 * `segment` is the route segment *relative to the store*, which is exactly what
 * `useSelectedLayoutSegment()` reports from the store layout — null on the
 * store's own page, the folder name on every nested one. Deriving the active
 * item that way rather than by comparing pathnames keeps it correct on the
 * admin subdomain, where the URL in the address bar (`/acme/orders`) is not the
 * internal route (`/dashboard/acme/orders`).
 */

export type AdminIcon =
  | "home"
  | "orders"
  | "products"
  | "collections"
  | "customers"
  | "discounts"
  | "analytics"
  | "online-store"
  | "settings";

export type AdminSection = {
  /** Path segment under the store, or null for the store's home page. */
  segment: string | null;
  label: string;
  icon: AdminIcon;
  /** Also offers a shortcut that opens the live storefront in a new tab. */
  opensStorefront?: boolean;
};

/** A run of sections, set apart from the one before it by a divider. */
export type AdminNavGroup = {
  /** Shown above the group. The first group has none. */
  label?: string;
  sections: readonly AdminSection[];
};

export const ADMIN_NAV: readonly AdminNavGroup[] = [
  {
    sections: [
      { segment: null, label: "Home", icon: "home" },
      { segment: "orders", label: "Orders", icon: "orders" },
      { segment: "products", label: "Products", icon: "products" },
      { segment: "collections", label: "Collections", icon: "collections" },
      { segment: "customers", label: "Customers", icon: "customers" },
      { segment: "discounts", label: "Discounts", icon: "discounts" },
      { segment: "analytics", label: "Analytics", icon: "analytics" },
    ],
  },
  {
    // Where the store is sold. One channel today; the label is what makes room
    // for the next without moving anything.
    label: "Sales channel",
    sections: [
      {
        segment: "online-store",
        label: "Online store",
        icon: "online-store",
        opensStorefront: true,
      },
    ],
  },
  { sections: [{ segment: "settings", label: "Settings", icon: "settings" }] },
];
