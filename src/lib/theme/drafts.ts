import "server-only";

import { cache } from "react";

import { rootDb } from "@/lib/db/root";
import { Prisma } from "@/lib/db/types";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { defaultTheme } from "./default-theme";
import type { ThemeDocument } from "./document";
import { previewSource } from "./preview";
import { themeCollectionReferences } from "./references";
import { themeStatus, type ThemeStatus } from "./status";
import {
  parseThemeForWrite,
  resolveTheme,
  storeImageUrlPolicy,
  type ThemeIssue,
} from "./validate";

/**
 * Reading and writing a store's draft, and publishing it. Every function takes
 * the `storeId` of a store the caller has already resolved through
 * `getStoreContext()` — these trust it, and scope every query by it.
 */

export type ThemeDraft = {
  name: string;
  document: ThemeDocument;
  /** The version a save must start from. 0 until the first save. */
  version: number;
  status: ThemeStatus;
};

/**
 * The draft to edit: the saved one, or the default theme before any save.
 * Deduplicated per request.
 */
export const getThemeDraft = cache(async (storeId: string): Promise<ThemeDraft> => {
  const row = await rootDb.storeTheme.findUnique({
    where: { storeId },
    select: {
      name: true,
      draft: true,
      draftVersion: true,
      publishedVersion: true,
      draftSavedAt: true,
      publishedAt: true,
    },
  });

  return {
    name: row?.name ?? "Tender",
    // Read leniently, like the storefront: a draft saved by older code opens
    // with whatever no longer fits put back to its defaults.
    document: row ? resolveTheme(row.draft) : defaultTheme(),
    version: row?.draftVersion ?? 0,
    status: themeStatus(row),
  };
});

export type ThemeWriteResult =
  | { ok: true; version: number }
  | { ok: false; reason: "conflict" }
  | { ok: false; reason: "invalid"; issues: ThemeIssue[] };

/**
 * Saves `document` as the store's draft, if the draft is still at
 * `baseVersion` — the version the seller started editing from. Otherwise
 * someone else saved in between, and this save is refused rather than
 * quietly overwriting their work.
 *
 * The version check is part of the write itself, not a read before it, so two
 * saves racing each other cannot both pass.
 */
export async function saveThemeDraft(
  storeId: string,
  document: unknown,
  baseVersion: number,
): Promise<ThemeWriteResult> {
  const checked = await checkThemeForStore(storeId, document);
  if (!checked.ok) return checked;

  const draft = toJson(checked.theme);
  const now = new Date();

  if (baseVersion === 0) {
    try {
      await rootDb.storeTheme.create({
        data: { storeId, draft, draftVersion: 1, draftSavedAt: now },
      });
    } catch (error) {
      // The store's row appeared since the seller loaded the page.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { ok: false, reason: "conflict" };
      }
      throw error;
    }
    return { ok: true, version: 1 };
  }

  const { count } = await rootDb.storeTheme.updateMany({
    where: { storeId, draftVersion: baseVersion },
    data: { draft, draftVersion: { increment: 1 }, draftSavedAt: now },
  });

  return count === 1 ? { ok: true, version: baseVersion + 1 } : { ok: false, reason: "conflict" };
}

export type ThemePublishResult =
  | { ok: true }
  | { ok: false; reason: "conflict" | "nothing-to-publish" }
  | { ok: false; reason: "invalid"; issues: ThemeIssue[] };

/**
 * Puts the draft in front of buyers — the draft at `baseVersion`, which is the
 * one the seller was looking at when they chose to publish.
 *
 * The draft is checked again on the way out: it was valid when saved, but the
 * code reading it may have changed since, and buyers must only ever be served
 * a document the current code fully accepts.
 *
 * A theme accent also becomes the store's own colour, so the admin, the store
 * list and the storefront agree on what colour this store is.
 */
export async function publishThemeDraft(
  storeId: string,
  baseVersion: number,
): Promise<ThemePublishResult> {
  const row = await rootDb.storeTheme.findUnique({
    where: { storeId },
    select: { draft: true, draftVersion: true },
  });

  if (!row) return { ok: false, reason: "nothing-to-publish" };
  if (row.draftVersion !== baseVersion) return { ok: false, reason: "conflict" };

  const checked = await checkThemeForStore(storeId, row.draft);
  if (!checked.ok) return checked;

  const { accent } = checked.theme.settings;

  try {
    await rootDb.$transaction(async (tx) => {
      const { count } = await tx.storeTheme.updateMany({
        where: { storeId, draftVersion: baseVersion },
        data: {
          published: toJson(checked.theme),
          publishedVersion: baseVersion,
          publishedAt: new Date(),
        },
      });
      if (count !== 1) throw new PublishConflict();

      if (accent !== null) {
        await tx.store.update({ where: { id: storeId }, data: { accentColor: accent } });
      }
    });
  } catch (error) {
    if (error instanceof PublishConflict) return { ok: false, reason: "conflict" };
    throw error;
  }

  return { ok: true };
}

class PublishConflict extends Error {}

/**
 * Stages the editor's working document for its preview: one row per seller
 * per store, overwritten on every change. Checked as strictly as a save — the
 * preview renders it on the server with the store's own data, so it must be a
 * document the storefront code accepts — and the issues go back to the editor
 * as it types.
 */
export async function stageThemePreview(
  storeId: string,
  userId: string,
  session: string,
  document: unknown,
): Promise<{ ok: true } | { ok: false; issues: ThemeIssue[] }> {
  const checked = await checkThemeForStore(storeId, document);
  if (!checked.ok) return { ok: false, issues: checked.issues };

  const staged = toJson(checked.theme);
  await rootDb.themePreview.upsert({
    where: { storeId_userId: { storeId, userId } },
    create: { storeId, userId, session, document: staged },
    update: { session, document: staged },
  });

  return { ok: true };
}

/**
 * What one seller's preview shows: their staged edits from this editor
 * session, or their saved draft.
 */
export async function getPreviewTheme(
  storeId: string,
  userId: string,
  session: string | null,
): Promise<ThemeDocument> {
  const staged = session
    ? await rootDb.themePreview.findUnique({
        where: { storeId_userId: { storeId, userId } },
        select: { session: true, document: true },
      })
    : null;

  return previewSource(staged, session) === "staged" && staged
    ? resolveTheme(staged.document)
    : (await getThemeDraft(storeId)).document;
}

/**
 * The strict check every write goes through, plus what needs the database:
 * images must be this store's uploads, and no collection may be another
 * store's. A collection that no longer exists anywhere is allowed — it was
 * deleted after being chosen, and the storefront simply leaves it out.
 */
async function checkThemeForStore(
  storeId: string,
  document: unknown,
): Promise<{ ok: true; theme: ThemeDocument } | { ok: false; reason: "invalid"; issues: ThemeIssue[] }> {
  const supabase = getSupabaseConfig();
  const parsed = parseThemeForWrite(document, {
    // Without storage configured there are no uploads, so no image is ours.
    isAllowedImageUrl: supabase ? storeImageUrlPolicy(storeId, supabase.url) : () => false,
  });
  if (!parsed.ok) return { ok: false, reason: "invalid", issues: parsed.issues };

  const references = themeCollectionReferences(parsed.theme);
  if (references.length > 0) {
    const foreign = await rootDb.collection.findMany({
      where: {
        id: { in: [...new Set(references.map((reference) => reference.id))] },
        storeId: { not: storeId },
      },
      select: { id: true },
    });
    const foreignIds = new Set(foreign.map((collection) => collection.id));

    const issues = references
      .filter((reference) => foreignIds.has(reference.id))
      .map((reference) => ({
        path: reference.path,
        message: "Choose one of this store's collections.",
      }));
    if (issues.length > 0) return { ok: false, reason: "invalid", issues };
  }

  return { ok: true, theme: parsed.theme };
}

/** A validated document, as Prisma's JSON input. */
function toJson(theme: ThemeDocument): Prisma.InputJsonValue {
  return theme as unknown as Prisma.InputJsonValue;
}
