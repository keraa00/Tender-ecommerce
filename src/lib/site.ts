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
};

export const SITE: SiteConfig = {
  legalName: "",
  supportEmail: "",
  legal: { terms: "", privacy: "" },
};
