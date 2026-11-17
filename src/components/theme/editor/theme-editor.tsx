"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAdminI18n } from "@/components/admin/admin-i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { format } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";
import type {
  PublishThemeState,
  SaveThemeDraftResult,
  StagePreviewResult,
  UploadThemeImageResult,
} from "@/lib/theme/actions";
import type {
  THEME_SETTINGS,
  ThemeBlock,
  ThemeDocument,
  ThemeSection,
} from "@/lib/theme/document";
import type { Fields } from "@/lib/theme/fields";
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redo,
  undo,
  type History,
} from "@/lib/theme/history";
import {
  addBlock,
  addSection,
  findSection,
  moveBlockTo,
  moveSectionTo,
  removeBlock,
  removeSection,
  setBlockHidden,
  setSectionHidden,
  settingsIssues,
  updateSetting,
  type SettingsTarget,
} from "@/lib/theme/operations";
import {
  PREVIEW_FOCUS,
  PREVIEW_READY,
  PREVIEW_REFRESH,
  PREVIEW_SELECT,
  readPreviewMessage,
} from "@/lib/theme/preview";
import type { SectionManifest } from "@/lib/theme/registry";
import type { ThemeIssue } from "@/lib/theme/validate";
import { IconButton, SettingsFields, type SettingsFieldsContext } from "../settings-fields";
import { SectionList, type SectionListActions } from "./section-list";

/**
 * The theme editor: sections and their blocks on the left, the storefront in
 * the middle, the selected section's or block's settings on the right.
 *
 * The working document lives here, in the browser, with a history to undo
 * through. Every change is staged on the server for the preview iframe —
 * which renders it with the real storefront components and the store's real
 * catalogue — and checked there as strictly as a save, so a problem shows up
 * beside its input as the seller types rather than on save. Nothing reaches
 * buyers until Publish.
 */

export type ThemeEditorProps = {
  store: { name: string; accentColor: string | null };
  initialDocument: ThemeDocument;
  initialVersion: number;
  /** Whether a saved draft is waiting that buyers do not see yet. */
  initialUnpublished: boolean;
  /** Already in the seller's language — see `sectionManifests()`. */
  manifests: SectionManifest[];
  /** `THEME_SETTINGS`, its labels in the seller's language. */
  themeSettings: typeof THEME_SETTINGS;
  collections: { id: string; title: string }[];
  /** This tab's preview session; see `src/lib/theme/preview.ts`. */
  session: string;
  urls: { exit: string; preview: string; storefront: string };
  canPublish: boolean;
  actions: {
    save: (input: { document: unknown; baseVersion: unknown }) => Promise<SaveThemeDraftResult>;
    stage: (input: { session: unknown; document: unknown }) => Promise<StagePreviewResult>;
    upload: (formData: FormData) => Promise<UploadThemeImageResult>;
    publish: (state: PublishThemeState, formData: FormData) => Promise<PublishThemeState>;
  };
  t: AdminMessages["themeEditor"];
};

type Notice = { tone: "info" | "success" | "danger"; text: string } | null;
type Device = "desktop" | "mobile";

/** How long the editor waits after a change before staging it for the preview. */
const STAGE_DELAY_MS = 350;

/** A phone's width, for the mobile preview. */
const MOBILE_WIDTH = 390;

export function ThemeEditor({
  store,
  initialDocument,
  initialVersion,
  initialUnpublished,
  manifests,
  themeSettings,
  collections,
  session,
  urls,
  canPublish,
  actions,
  t,
}: ThemeEditorProps) {
  const { locale } = useAdminI18n();
  const blockedCopy = useMemo(() => ({ locale, t: t.operations }), [locale, t]);
  const [history, setHistory] = useState<History<ThemeDocument>>(() =>
    createHistory(initialDocument),
  );
  const document = history.present;
  const [saved, setSaved] = useState({ document: initialDocument, version: initialVersion });
  const [unpublished, setUnpublished] = useState(initialUnpublished);
  const [selected, setSelected] = useState<SettingsTarget>(() => {
    const first = initialDocument.pages.home.sections[0];
    return first ? { kind: "section", id: first.id } : { kind: "theme" };
  });
  const [issues, setIssues] = useState<ThemeIssue[]>([]);
  const [busy, setBusy] = useState<"saving" | "publishing" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [conflict, setConflict] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [device, setDevice] = useState<Device>("desktop");

  const dirty = useMemo(
    () => JSON.stringify(document) !== JSON.stringify(saved.document),
    [document, saved.document],
  );

  const manifestByType = useMemo(
    () => new Map(manifests.map((manifest) => [manifest.type, manifest])),
    [manifests],
  );
  const nameOf = (type: string) => manifestByType.get(type)?.name ?? t.section;

  // ---------------------------------------------------------------------------
  // Live preview
  // ---------------------------------------------------------------------------

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const latest = useRef(document);
  const firstRender = useRef(true);
  const staging = useRef<{ inFlight: boolean; queued: ThemeDocument | null; any: boolean }>({
    inFlight: false,
    queued: null,
    any: false,
  });

  const toPreview = useCallback((message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  // One staging request at a time, always ending on the newest document: a
  // slow request finishing after a faster, newer one must not leave the
  // preview showing the older edit.
  const stage = useCallback(
    async (next: ThemeDocument) => {
      const state = staging.current;
      if (state.inFlight) {
        state.queued = next;
        return;
      }

      state.inFlight = true;
      let current = next;
      let result: StagePreviewResult;
      for (;;) {
        try {
          result = await actions.stage({ session, document: current });
        } catch {
          result = { ok: false, issues: [{ path: "", message: t.previewFailed }] };
        }
        if (!state.queued) break;
        // A newer edit arrived meanwhile: send that one before reporting.
        current = state.queued;
        state.queued = null;
      }
      state.inFlight = false;

      if (current !== latest.current) return;
      setIssues(result.ok ? [] : result.issues);
      if (result.ok) {
        state.any = true;
        toPreview({ type: PREVIEW_REFRESH });
      }
    },
    [actions, session, toPreview, t.previewFailed],
  );

  useEffect(() => {
    latest.current = document;
    // The preview opens on the saved draft, which is this first document.
    // Every change after that is staged — undoing back to it included.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => void stage(document), STAGE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [document, stage]);

  /** Selects something in the editor and, for a section, shows it in the preview. */
  const select = useCallback(
    (target: SettingsTarget, { reveal = true }: { reveal?: boolean } = {}) => {
      setSelected(target);
      if (!reveal || target.kind === "theme") return;
      toPreview({
        type: PREVIEW_FOCUS,
        sectionId: target.kind === "section" ? target.id : target.sectionId,
      });
    },
    [toPreview],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = readPreviewMessage(event.data);

      // A preview that finished loading after a staging request missed the
      // refresh that followed it.
      if (message?.type === PREVIEW_READY && staging.current.any) {
        toPreview({ type: PREVIEW_REFRESH });
      }
      // A click in the preview selects what was clicked; it is already in view.
      if (message?.type === PREVIEW_SELECT && findSection(latest.current, message.sectionId)) {
        select({ kind: "section", id: message.sectionId }, { reveal: false });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [select, toPreview]);

  // ---------------------------------------------------------------------------
  // Editing and history
  // ---------------------------------------------------------------------------

  /**
   * Applies an edit. `key` names what changed for undo: edits to the same
   * setting in quick succession are one step to undo.
   */
  const edit = (next: ThemeDocument, key: string | null = null) => {
    if (next === document) return;
    setHistory((current) => pushHistory(current, next, { key }));
    if (notice?.tone !== "info") setNotice(null);
  };

  const undoEdit = useCallback(() => {
    setHistory((current) => undo(current));
    setAnnouncement(t.undone);
  }, [t]);

  const redoEdit = useCallback(() => {
    setHistory((current) => redo(current));
    setAnnouncement(t.redone);
  }, [t]);

  // Positions are counted from 1 for the seller, in their own digits.
  const moved = (name: string, position: number, total: number) =>
    format(t.moved, { name, position: position + 1, total });

  const sections = document.pages.home.sections;

  const listActions: SectionListActions = {
    onSelect: (target) => select(target),

    onMoveSection: (id, to) => {
      const next = moveSectionTo(document, id, to);
      if (next === document) return;
      edit(next);
      const position = next.pages.home.sections.findIndex((section) => section.id === id);
      const section = next.pages.home.sections[position];
      setAnnouncement(moved(nameOf(section.type), position, sections.length));
    },

    onAddSection: (type) => {
      const manifest = manifestByType.get(type);
      if (!manifest) return;
      const result = addSection(document, manifest, blockedCopy);
      if (!result.ok) {
        setNotice({ tone: "danger", text: result.reason });
        return;
      }
      edit(result.document);
      // A section that starts with blocks opens on the first, so its input is
      // the first thing in the settings panel.
      const [first] = findSection(result.document, result.id)?.blocks ?? [];
      select(
        first
          ? { kind: "block", sectionId: result.id, blockId: first.id }
          : { kind: "section", id: result.id },
      );
      setAnnouncement(format(t.sectionAdded, { name: manifest.name }));
    },

    onRemoveSection: (id) => {
      const index = sections.findIndex((section) => section.id === id);
      if (index === -1) return;
      const name = nameOf(sections[index].type);
      const next = removeSection(document, id);
      edit(next);
      const neighbour =
        next.pages.home.sections[Math.min(index, next.pages.home.sections.length - 1)];
      setSelected(neighbour ? { kind: "section", id: neighbour.id } : { kind: "theme" });
      // Undo brings it back, so removing does not ask first.
      setAnnouncement(format(t.removed, { name }));
    },

    onToggleSection: (id) => {
      const section = sections.find((entry) => entry.id === id);
      if (!section) return;
      edit(setSectionHidden(document, id, !section.hidden));
      setAnnouncement(
        format(section.hidden ? t.shown : t.hidden, { name: nameOf(section.type) }),
      );
    },

    onAddBlock: (sectionId, blockType) => {
      const section = findSection(document, sectionId);
      const manifest = section && manifestByType.get(section.type);
      if (!manifest) return;
      const result = addBlock(document, sectionId, manifest, blockType, blockedCopy);
      if (!result.ok) {
        setNotice({ tone: "danger", text: result.reason });
        return;
      }
      edit(result.document);
      select({ kind: "block", sectionId, blockId: result.id });
      setAnnouncement(
        format(t.blockAdded, { block: manifest.blocks[blockType].name, section: manifest.name }),
      );
    },

    onMoveBlock: (sectionId, blockId, to) => {
      const next = moveBlockTo(document, sectionId, blockId, to);
      if (next === document) return;
      edit(next);
      const blocks = findSection(next, sectionId)?.blocks ?? [];
      const position = blocks.findIndex((block) => block.id === blockId);
      setAnnouncement(moved(blockName(sectionId, blocks[position]), position, blocks.length));
    },

    onRemoveBlock: (sectionId, blockId) => {
      const block = findSection(document, sectionId)?.blocks.find((entry) => entry.id === blockId);
      if (!block) return;
      edit(removeBlock(document, sectionId, blockId));
      if (selected.kind === "block" && selected.blockId === blockId) {
        setSelected({ kind: "section", id: sectionId });
      }
      setAnnouncement(format(t.removed, { name: blockName(sectionId, block) }));
    },

    onToggleBlock: (sectionId, blockId) => {
      const block = findSection(document, sectionId)?.blocks.find((entry) => entry.id === blockId);
      if (!block) return;
      edit(setBlockHidden(document, sectionId, blockId, !block.hidden));
      setAnnouncement(
        format(block.hidden ? t.shown : t.hidden, { name: blockName(sectionId, block) }),
      );
    },
  };

  function blockName(sectionId: string, block: ThemeBlock | undefined): string {
    const section = findSection(document, sectionId);
    const manifest = section && manifestByType.get(section.type);
    return (block && manifest?.blocks[block.type]?.name) ?? t.block;
  }

  // ---------------------------------------------------------------------------
  // Save and publish
  // ---------------------------------------------------------------------------

  const save = useCallback(async (): Promise<number | null> => {
    const snapshot = document;
    setBusy("saving");
    setNotice({ tone: "info", text: t.saving });

    let result: SaveThemeDraftResult;
    try {
      result = await actions.save({ document: snapshot, baseVersion: saved.version });
    } catch {
      result = { ok: false, error: t.saveFailed };
    }
    setBusy(null);

    if (!result.ok) {
      if (result.conflict) setConflict(true);
      if (result.issues) setIssues(result.issues);
      setNotice({ tone: "danger", text: result.error });
      return null;
    }

    setSaved({ document: snapshot, version: result.version });
    setUnpublished(true);
    setNotice({ tone: "success", text: t.savedPublishHint });
    return result.version;
  }, [actions, document, saved.version, t]);

  const publish = useCallback(async () => {
    const version = dirty ? await save() : saved.version;
    if (version === null) return;

    setBusy("publishing");
    setNotice({ tone: "info", text: t.publishing });
    const formData = new FormData();
    formData.set("baseVersion", String(version));

    let result: PublishThemeState;
    try {
      result = await actions.publish({}, formData);
    } catch {
      result = { formError: t.publishFailed };
    }
    setBusy(null);

    if (result.formError) {
      setNotice({ tone: "danger", text: result.formError });
      return;
    }
    setUnpublished(false);
    setNotice({ tone: "success", text: result.notice ?? t.published });
  }, [actions, dirty, save, saved.version, t]);

  // ⌘Z / Ctrl+Z undoes, ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y redoes, ⌘S / Ctrl+S
  // saves. Undo is the editor's even inside a text input: the input's value is
  // the document's, so a native undo there would only fight it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();

      if (key === "s") {
        event.preventDefault();
        if (dirty && !busy && !conflict) void save();
      } else if ((key === "z" && event.shiftKey) || (key === "y" && event.ctrlKey)) {
        event.preventDefault();
        redoEdit();
      } else if (key === "z") {
        event.preventDefault();
        undoEdit();
      }
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [busy, conflict, dirty, redoEdit, save, undoEdit]);

  // ---------------------------------------------------------------------------
  // Settings panel
  // ---------------------------------------------------------------------------

  const target = resolveTarget(document, selected);
  // What edits apply to: the selection as it stands now, so something undone
  // or removed falls back to what contains it rather than to nothing.
  const editing: SettingsTarget =
    target.kind === "theme"
      ? target
      : target.kind === "section"
        ? { kind: "section", id: target.section.id }
        : { kind: "block", sectionId: target.section.id, blockId: target.block.id };

  const fieldsContext: SettingsFieldsContext = {
    colorFallback: store.accentColor ?? "#1c1917",
    collections,
    uploadImage: actions.upload,
    t: t.fields,
  };

  const panel: { title: string; subtitle?: string; fields: Fields; values: Record<string, unknown>; key: string } =
    target.kind === "theme"
      ? { title: t.themeSettings, fields: themeSettings, values: document.settings, key: "theme" }
      : target.kind === "section"
        ? {
            title: nameOf(target.section.type),
            subtitle: target.pinned ? t.onEveryPage : undefined,
            fields: manifestByType.get(target.section.type)?.settings ?? {},
            values: target.section.settings,
            key: `section:${target.section.id}`,
          }
        : {
            title:
              manifestByType.get(target.section.type)?.blocks[target.block.type]?.name ?? t.block,
            subtitle: format(t.inSection, { section: nameOf(target.section.type) }),
            fields: manifestByType.get(target.section.type)?.blocks[target.block.type]?.settings ?? {},
            values: target.block.settings,
            key: `block:${target.section.id}:${target.block.id}`,
          };

  const generalIssues = issues.filter((issue) => issue.path === "");

  const exit = (event: React.MouseEvent) => {
    if (dirty && !window.confirm(t.leaveConfirm)) event.preventDefault();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 hidden flex-col bg-surface-subtle lg:flex">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
          {/* A client navigation, so the confirm below is the only prompt. */}
          <Link
            href={urls.exit}
            onClick={exit}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <span aria-hidden className="rtl:-scale-x-100">←</span> {t.exit}
          </Link>
          <span aria-hidden className="h-5 w-px bg-border" />
          <p className="max-w-48 truncate text-sm font-medium">{store.name}</p>
          <label className="ms-2 flex items-center gap-2 text-sm text-muted">
            {t.page}
            {/* One page so far; the selector is where the next ones go. */}
            <select
              defaultValue="home"
              className="h-8 cursor-pointer rounded-lg border border-border-strong bg-surface px-2 text-sm text-foreground"
            >
              <option value="home">{t.homePage}</option>
            </select>
          </label>

          <div className="ms-2 flex items-center">
            <IconButton label={t.undo} disabled={!canUndo(history)} onClick={undoEdit}>
              <ToolbarIcon path="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </IconButton>
            <IconButton label={t.redo} disabled={!canRedo(history)} onClick={redoEdit}>
              <ToolbarIcon path="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
            </IconButton>
          </div>

          <div
            role="group"
            aria-label={t.previewSize}
            className="ms-1 flex rounded-lg border border-border-strong p-0.5"
          >
            {(["desktop", "mobile"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={device === option}
                aria-label={option === "desktop" ? t.desktopPreview : t.mobilePreview}
                title={option === "desktop" ? t.desktop : t.mobile}
                onClick={() => setDevice(option)}
                className={cn(
                  "grid h-7 w-8 cursor-pointer place-items-center rounded-md transition-colors",
                  device === option
                    ? "bg-surface-hover text-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                <ToolbarIcon
                  path={
                    option === "desktop"
                      ? "M3 5h18v11H3zM8 20h8M12 16v4"
                      : "M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2"
                  }
                />
              </button>
            ))}
          </div>

          <p
            role="status"
            aria-live="polite"
            className={cn(
              "ms-auto min-w-0 truncate text-sm",
              notice?.tone === "danger"
                ? "text-danger"
                : notice?.tone === "success"
                  ? "text-success"
                  : "text-muted",
            )}
          >
            {notice?.text ?? (dirty ? t.unsavedChanges : unpublished ? t.savedNotPublished : "")}
          </p>

          <a
            href={urls.storefront}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center rounded-lg px-2.5 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            {t.viewStore}
          </a>
          <Button
            variant="secondary"
            size="sm"
            disabled={!dirty || busy !== null || conflict}
            onClick={() => void save()}
          >
            {busy === "saving" ? t.saving : t.save}
          </Button>
          {canPublish ? (
            <Button
              size="sm"
              disabled={(!dirty && !unpublished) || busy !== null || conflict}
              onClick={() => void publish()}
            >
              {busy === "publishing" ? t.publishing : t.publish}
            </Button>
          ) : null}
        </header>

        {conflict ? (
          <div
            role="alert"
            className="flex items-center gap-3 border-b border-danger/30 bg-danger/5 px-4 py-2 text-sm text-danger"
          >
            <p className="flex-1">{t.conflict}</p>
            <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
              {t.reload}
            </Button>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1">
          <aside
            aria-label={t.sections}
            className="w-72 shrink-0 overflow-y-auto border-e border-border bg-background"
          >
            <SectionList
              document={document}
              manifests={manifests}
              selected={editing}
              actions={listActions}
              t={t}
              blockedCopy={blockedCopy}
            />
          </aside>

          <main className="flex min-w-0 flex-1 justify-center overflow-auto p-4">
            <iframe
              ref={iframeRef}
              src={urls.preview}
              title={format(t.previewOf, { store: store.name })}
              style={device === "mobile" ? { width: MOBILE_WIDTH } : undefined}
              className={cn(
                "h-full rounded-lg border border-border bg-background shadow-sm transition-[width] duration-200",
                device === "desktop" && "w-full",
              )}
            />
          </main>

          <aside
            aria-label={t.settings}
            className="w-80 shrink-0 overflow-y-auto border-s border-border bg-background"
          >
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-semibold tracking-tight">{panel.title}</h2>
              {panel.subtitle ? <p className="mt-0.5 text-xs text-muted">{panel.subtitle}</p> : null}
            </div>
            <div className="space-y-4 p-4">
              {generalIssues.length > 0 ? (
                <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                  {generalIssues[0].message}
                </p>
              ) : null}
              {Object.keys(panel.fields).length === 0 ? (
                <p className="text-sm text-muted">{t.nothingToSet}</p>
              ) : (
                <SettingsFields
                  // A fresh panel per target, so inputs never carry state across.
                  key={panel.key}
                  fields={panel.fields}
                  values={panel.values}
                  onChange={(field, value) =>
                    edit(updateSetting(document, editing, field, value), `${panel.key}:${field}`)
                  }
                  errors={settingsIssues(document, editing, issues)}
                  context={fieldsContext}
                />
              )}
              {target.kind === "section" && !target.pinned ? (
                <div className="flex gap-2 border-t border-border pt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => listActions.onToggleSection(target.section.id)}
                  >
                    {target.section.hidden ? t.showSection : t.hideSection}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => listActions.onRemoveSection(target.section.id)}
                  >
                    {t.removeSection}
                  </Button>
                </div>
              ) : null}
              {target.kind === "block" ? (
                <div className="flex gap-2 border-t border-border pt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => listActions.onToggleBlock(target.section.id, target.block.id)}
                  >
                    {target.block.hidden ? t.showBlock : t.hideBlock}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => listActions.onRemoveBlock(target.section.id, target.block.id)}
                  >
                    {t.removeBlock}
                  </Button>
                </div>
              ) : null}
            </div>
          </aside>
        </div>

        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>

      <div className="grid flex-1 place-items-center px-6 py-24 text-center lg:hidden">
        <div className="max-w-sm">
          <h1 className="text-lg font-semibold tracking-tight">{t.largerScreen}</h1>
          <p className="mt-2 text-sm text-muted text-pretty">{t.largerScreenBody}</p>
          <a
            href={urls.exit}
            className="mt-6 inline-block text-sm font-medium underline underline-offset-4"
          >
            {t.backToOnlineStore}
          </a>
        </div>
      </div>
    </>
  );
}

/**
 * The selected target if it still exists. A block that is gone falls back to
 * its section, and a section that is gone to the theme settings.
 */
function resolveTarget(
  document: ThemeDocument,
  selected: SettingsTarget,
):
  | { kind: "theme" }
  | { kind: "section"; section: ThemeSection; pinned: boolean }
  | { kind: "block"; section: ThemeSection; block: ThemeBlock } {
  if (selected.kind === "theme") return selected;

  const sectionId = selected.kind === "section" ? selected.id : selected.sectionId;
  const section = findSection(document, sectionId);
  if (!section) return { kind: "theme" };

  if (selected.kind === "block") {
    const block = section.blocks.find((entry) => entry.id === selected.blockId);
    if (block) return { kind: "block", section, block };
  }

  const { header, footer } = document.layout;
  return { kind: "section", section, pinned: section === header || section === footer };
}

function ToolbarIcon({ path }: { path: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d={path} />
    </svg>
  );
}
