/**
 * The contract between the theme editor and its preview iframe. Dependency-
 * free: both sides — and the server action between them — import it.
 *
 * The editor stages its working document on the server under a session id it
 * made up when it opened, then tells the iframe to refresh. The iframe's page
 * renders the staged copy only if it carries the same session id, and the
 * seller's saved draft otherwise.
 */

/** Random per editor tab. Not a secret: the preview is behind sign-in. */
export const PREVIEW_SESSION_PATTERN = /^[a-z0-9]{8,32}$/;

export function newPreviewSession(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => (byte % 36).toString(36)).join("");
}

export function isPreviewSession(value: unknown): value is string {
  return typeof value === "string" && PREVIEW_SESSION_PATTERN.test(value);
}

/** Editor → preview: the staged document changed; render it again. */
export const PREVIEW_REFRESH = "tender:theme-preview:refresh";
/** Editor → preview: bring this section into view. */
export const PREVIEW_FOCUS = "tender:theme-preview:focus";
/** Preview → editor: the preview finished rendering and is listening. */
export const PREVIEW_READY = "tender:theme-preview:ready";
/** Preview → editor: the seller clicked this section in the preview. */
export const PREVIEW_SELECT = "tender:theme-preview:select";

export type PreviewMessage =
  | { type: typeof PREVIEW_REFRESH }
  | { type: typeof PREVIEW_READY }
  | { type: typeof PREVIEW_FOCUS; sectionId: string }
  | { type: typeof PREVIEW_SELECT; sectionId: string };

/** The attribute the preview marks each section's markup with. */
export const PREVIEW_SECTION_ATTRIBUTE = "data-theme-section-id";

/**
 * A message from the other side, if it is one of ours and well formed. Both
 * listeners also check the sender's origin and window; this checks the shape,
 * since `postMessage` data is whatever the sender chose.
 */
export function readPreviewMessage(data: unknown): PreviewMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const { type, sectionId } = data as { type?: unknown; sectionId?: unknown };

  switch (type) {
    case PREVIEW_REFRESH:
    case PREVIEW_READY:
      return { type };
    case PREVIEW_FOCUS:
    case PREVIEW_SELECT:
      return typeof sectionId === "string" && sectionId.length <= 64 ? { type, sectionId } : null;
    default:
      return null;
  }
}

/**
 * Which document a preview request shows. A staged copy from another session
 * — an editor tab closed with unsaved edits, or another tab — is ignored, so
 * the preview never shows the seller something their editor does not.
 */
export function previewSource(
  staged: { session: string } | null,
  session: string | null,
): "staged" | "draft" {
  return staged && session && staged.session === session ? "staged" : "draft";
}
