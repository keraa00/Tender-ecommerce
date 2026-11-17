/**
 * Platform details shown in the site footer. Anything left empty is not
 * rendered, so the footer never advertises something that does not exist yet.
 */
type SiteConfig = {
  /** Copyright holder. Falls back to "Tender" until a company is registered. */
  legalName: string;
  /** Public support address, e.g. support@your-domain. Adds a "Contact" link. */
  supportEmail: string;
  /** A path (`/terms`) or a full URL. Each link appears once it is set. */
  legal: { terms: string; privacy: string };
  /**
   * A public demo: payments run in Stripe test mode and nothing ships. Shows a
   * notice on the platform pages and above every checkout, so nobody types a
   * real card or a real address into a store that will never deliver.
   */
  demo: boolean;
};

export const SITE: SiteConfig = {
  legalName: "",
  supportEmail: "",
  legal: { terms: "/terms", privacy: "/privacy" },
  demo: true,
};
