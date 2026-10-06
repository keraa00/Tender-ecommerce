"use server";

import { revalidatePath } from "next/cache";

import { uploadThemeImage } from "@/lib/products/images";
import { canEditTheme, canPublishTheme } from "@/lib/stores/policy";
import { getStoreContext } from "@/lib/stores/context";
import { publishThemeDraft, saveThemeDraft, stageThemePreview } from "./drafts";
import { isPreviewSession } from "./preview";
import { parseThemeVersion } from "./status";
import { themeImageRejectionReason } from "./uploads";
import type { ThemeIssue } from "./validate";

/**
 * The theme editor's writes. Each one resolves the store from the URL slug and
 * the session, checks the member may do this, and treats everything else it
 * is handed — the document above all — as untrusted input.
 */

const CONFLICT =
  "Someone else saved this store's design while you were editing. Reload to see their changes, then make yours again.";

export type SaveThemeDraftResult =
  | { ok: true; version: number }
  | { ok: false; error: string; conflict?: boolean; issues?: ThemeIssue[] };

/** Saves the editor's document as the draft, if the draft is still at `baseVersion`. */
export async function saveThemeDraftAction(
  storeSlug: string,
  input: { document: unknown; baseVersion: unknown },
): Promise<SaveThemeDraftResult> {
  const { store, membership } = await getStoreContext(storeSlug);
  if (!canEditTheme(membership)) {
    return { ok: false, error: "You don't have permission to change this store's design." };
  }

  const baseVersion = versionFrom(input?.baseVersion);
  if (baseVersion === null) return { ok: false, error: "Reload the editor and try again." };

  let result;
  try {
    result = await saveThemeDraft(store.id, input.document, baseVersion);
  } catch (error) {
    console.error("saveThemeDraftAction failed", error);
    return { ok: false, error: "Could not save the theme. Please try again." };
  }

  if (!result.ok) {
    return result.reason === "conflict"
      ? { ok: false, error: CONFLICT, conflict: true }
      : {
          ok: false,
          error: "Some settings need fixing before this can be saved.",
          issues: result.issues,
        };
  }

  // Internal route paths, not admin-host URLs — see `lib/products/actions.ts`.
  revalidatePath(`/dashboard/${storeSlug}/online-store`);

  return { ok: true, version: result.version };
}

export type StagePreviewResult = { ok: true } | { ok: false; issues: ThemeIssue[] };

/**
 * Stages the editor's working document for its preview iframe. Called as the
 * seller edits; nothing is saved, and buyers see nothing.
 */
export async function stagePreviewAction(
  storeSlug: string,
  input: { session: unknown; document: unknown },
): Promise<StagePreviewResult> {
  const { store, user, membership } = await getStoreContext(storeSlug);
  if (!canEditTheme(membership) || !isPreviewSession(input?.session)) {
    return { ok: false, issues: [{ path: "", message: "Reload the editor and try again." }] };
  }

  try {
    return await stageThemePreview(store.id, user.id, input.session, input.document);
  } catch (error) {
    console.error("stagePreviewAction failed", error);
    return { ok: false, issues: [{ path: "", message: "The preview could not be updated." }] };
  }
}

export type UploadThemeImageResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Uploads an image for a theme section, under this store's prefix. The editor
 * has already scaled it down; the size check here is the one that counts.
 */
export async function uploadThemeImageAction(
  storeSlug: string,
  formData: FormData,
): Promise<UploadThemeImageResult> {
  const { store, membership } = await getStoreContext(storeSlug);
  if (!canEditTheme(membership)) {
    return { ok: false, error: "You don't have permission to change this store's design." };
  }

  const file = formData.get("image");
  if (!(file instanceof File)) return { ok: false, error: "Choose an image to upload." };

  const rejection = themeImageRejectionReason(file);
  if (rejection) return { ok: false, error: rejection };

  try {
    return { ok: true, url: await uploadThemeImage(store.id, file) };
  } catch (error) {
    console.error("uploadThemeImageAction failed", error);
    return { ok: false, error: "Could not upload the image. Please try again." };
  }
}

export type PublishThemeState = {
  formError?: string;
  notice?: string;
};

/** Publishes the draft the seller is looking at. */
export async function publishThemeAction(
  storeSlug: string,
  _prev: PublishThemeState,
  formData: FormData,
): Promise<PublishThemeState> {
  const { store, membership } = await getStoreContext(storeSlug);
  if (!canPublishTheme(membership)) {
    return { formError: "You don't have permission to publish this store's design." };
  }

  const baseVersion = parseThemeVersion(formData.get("baseVersion"));
  if (baseVersion === null) return { formError: "Reload the page and try again." };

  let result;
  try {
    result = await publishThemeDraft(store.id, baseVersion);
  } catch (error) {
    console.error("publishThemeAction failed", error);
    return { formError: "Could not publish the theme. Please try again." };
  }

  if (!result.ok) {
    switch (result.reason) {
      case "conflict":
        return { formError: CONFLICT };
      case "nothing-to-publish":
        return { formError: "There are no saved changes to publish." };
      case "invalid":
        return {
          formError:
            "Some of this design's settings are no longer valid. Open the editor, fix them and save, then publish.",
        };
    }
  }

  revalidatePath(`/s/${storeSlug}`, "layout");
  // A published accent is the store's colour everywhere it is drawn: this
  // store's admin and the store list.
  revalidatePath(`/dashboard/${storeSlug}`, "layout");
  revalidatePath("/dashboard");

  return { notice: "Published. Buyers now see this design." };
}

/** A version number from JSON: a whole number from 0 up, or nothing. */
function versionFrom(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
