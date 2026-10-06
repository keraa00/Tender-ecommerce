"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import type { ThemeBlock, ThemeDocument, ThemeSection } from "@/lib/theme/document";
import {
  addBlockBlockedReason,
  addSectionBlockedReason,
  type SettingsTarget,
} from "@/lib/theme/operations";
import type { SectionManifest } from "@/lib/theme/registry";
import { IconButton } from "../settings-fields";
import { useSortable } from "./use-sortable";

/**
 * The page's sections in order, between the header and footer that every page
 * shares, each with its blocks a click away.
 *
 * Sections and blocks reorder by dragging their handle, or with the move
 * up/down buttons beside them — which are the keyboard's way, and announced.
 */

export type SectionListActions = {
  onSelect: (target: SettingsTarget) => void;
  onMoveSection: (id: string, to: number) => void;
  onAddSection: (type: string) => void;
  onRemoveSection: (id: string) => void;
  onToggleSection: (id: string) => void;
  onAddBlock: (sectionId: string, blockType: string) => void;
  onMoveBlock: (sectionId: string, blockId: string, to: number) => void;
  onRemoveBlock: (sectionId: string, blockId: string) => void;
  onToggleBlock: (sectionId: string, blockId: string) => void;
};

export function SectionList({
  document,
  manifests,
  selected,
  actions,
}: {
  document: ThemeDocument;
  manifests: SectionManifest[];
  selected: SettingsTarget;
  actions: SectionListActions;
}) {
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const manifestByType = new Map(manifests.map((manifest) => [manifest.type, manifest]));
  const sections = document.pages.home.sections;
  const sortable = useSortable((from, to) => actions.onMoveSection(sections[from].id, to));

  const isSelected = (id: string) => selected.kind === "section" && selected.id === id;
  const isOpen = (id: string) =>
    expanded.has(id) || (selected.kind === "block" && selected.sectionId === id);
  const toggleOpen = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pinned = (section: ThemeSection) => (
    <div className="px-2">
      <button
        type="button"
        onClick={() => actions.onSelect({ kind: "section", id: section.id })}
        aria-current={isSelected(section.id) ? "true" : undefined}
        className={cn(
          "w-full cursor-pointer rounded-lg px-2 py-2 text-start text-sm transition-colors",
          isSelected(section.id) ? "bg-surface-hover font-medium" : "hover:bg-surface-hover/60",
        )}
      >
        {manifestByType.get(section.type)?.name ?? "Section"}
      </button>
    </div>
  );

  return (
    <div className="flex min-h-full flex-col">
      <p className="px-4 pb-1 pt-4 text-xs font-medium text-muted">Header</p>
      {pinned(document.layout.header)}

      <p className="px-4 pb-1 pt-4 text-xs font-medium text-muted">Home page</p>
      <ol aria-label="Home page sections" className="space-y-0.5 px-2">
        {sections.map((section, index) => {
          const manifest = manifestByType.get(section.type);
          const name = manifest?.name ?? "Unknown section";
          const active = isSelected(section.id);
          const hasBlocks = (manifest?.maxBlocks ?? 0) > 0;
          const open = hasBlocks && isOpen(section.id);

          return (
            <li
              key={section.id}
              ref={sortable.rowRef(index)}
              style={sortable.rowStyle(index)}
              className="rounded-lg bg-background"
            >
              <Row
                active={active}
                hidden={section.hidden}
                name={name}
                summary={summaryOf(section.settings)}
                onSelect={() => actions.onSelect({ kind: "section", id: section.id })}
                handle={sortable.handleProps(index)}
                leading={
                  hasBlocks ? (
                    <IconButton
                      label={open ? `Collapse ${name}` : `Expand ${name}`}
                      pressed={open}
                      onClick={() => toggleOpen(section.id)}
                      className="h-6 w-6"
                    >
                      <Chevron direction={open ? "down" : "right"} />
                    </IconButton>
                  ) : (
                    <span aria-hidden className="w-6 shrink-0" />
                  )
                }
              >
                <IconButton
                  label={`Move ${name} up`}
                  disabled={index === 0}
                  onClick={() => actions.onMoveSection(section.id, index - 1)}
                >
                  <Chevron direction="up" />
                </IconButton>
                <IconButton
                  label={`Move ${name} down`}
                  disabled={index === sections.length - 1}
                  onClick={() => actions.onMoveSection(section.id, index + 1)}
                >
                  <Chevron direction="down" />
                </IconButton>
                <IconButton
                  label={section.hidden ? `Show ${name}` : `Hide ${name}`}
                  pressed={section.hidden}
                  onClick={() => actions.onToggleSection(section.id)}
                >
                  <Eye closed={section.hidden} />
                </IconButton>
                <IconButton label={`Remove ${name}`} onClick={() => actions.onRemoveSection(section.id)}>
                  <Trash />
                </IconButton>
              </Row>

              {open && manifest ? (
                <BlockList
                  document={document}
                  section={section}
                  manifest={manifest}
                  selected={selected}
                  actions={actions}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {sections.length === 0 ? (
        <p className="px-4 py-2 text-sm text-muted">This page has no sections yet.</p>
      ) : null}

      <div className="px-2 pt-1">
        <AddButton open={adding} onToggle={() => setAdding((current) => !current)}>
          Add section
        </AddButton>
        {adding ? (
          <Menu
            items={manifests
              .filter((manifest) => !manifest.pinned)
              .map((manifest) => ({
                key: manifest.type,
                label: manifest.name,
                hint: manifest.description,
                blocked: addSectionBlockedReason(document, manifest),
              }))}
            onChoose={(type) => {
              actions.onAddSection(type);
              setAdding(false);
            }}
          />
        ) : null}
      </div>

      <p className="px-4 pb-1 pt-4 text-xs font-medium text-muted">Footer</p>
      {pinned(document.layout.footer)}

      <div className="mt-auto border-t border-border p-2">
        <button
          type="button"
          onClick={() => actions.onSelect({ kind: "theme" })}
          aria-current={selected.kind === "theme" ? "true" : undefined}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors",
            selected.kind === "theme" ? "bg-surface-hover font-medium" : "hover:bg-surface-hover",
          )}
        >
          Theme settings
          <span className="ms-auto text-xs text-muted">Colours, fonts</span>
        </button>
      </div>
    </div>
  );
}

/** A section's blocks, indented under it, with their own reordering. */
function BlockList({
  document,
  section,
  manifest,
  selected,
  actions,
}: {
  document: ThemeDocument;
  section: ThemeSection;
  manifest: SectionManifest;
  selected: SettingsTarget;
  actions: SectionListActions;
}) {
  const [adding, setAdding] = useState(false);
  const { blocks } = section;
  const sortable = useSortable((from, to) =>
    actions.onMoveBlock(section.id, blocks[from].id, to),
  );

  return (
    <div className="ms-6 border-s border-border ps-1 pb-1">
      <ol aria-label={`${manifest.name} blocks`} className="space-y-0.5">
        {blocks.map((block: ThemeBlock, index) => {
          const name = manifest.blocks[block.type]?.name ?? "Block";
          const active =
            selected.kind === "block" &&
            selected.sectionId === section.id &&
            selected.blockId === block.id;
          return (
            <li
              key={block.id}
              ref={sortable.rowRef(index)}
              style={sortable.rowStyle(index)}
              className="rounded-lg bg-background"
            >
              <Row
                active={active}
                hidden={block.hidden}
                name={name}
                summary={summaryOf(block.settings)}
                onSelect={() =>
                  actions.onSelect({ kind: "block", sectionId: section.id, blockId: block.id })
                }
                handle={sortable.handleProps(index)}
                compact
              >
                <IconButton
                  label={`Move ${name} up`}
                  disabled={index === 0}
                  onClick={() => actions.onMoveBlock(section.id, block.id, index - 1)}
                >
                  <Chevron direction="up" />
                </IconButton>
                <IconButton
                  label={`Move ${name} down`}
                  disabled={index === blocks.length - 1}
                  onClick={() => actions.onMoveBlock(section.id, block.id, index + 1)}
                >
                  <Chevron direction="down" />
                </IconButton>
                <IconButton
                  label={block.hidden ? `Show ${name}` : `Hide ${name}`}
                  pressed={block.hidden}
                  onClick={() => actions.onToggleBlock(section.id, block.id)}
                >
                  <Eye closed={block.hidden} />
                </IconButton>
                <IconButton
                  label={`Remove ${name}`}
                  onClick={() => actions.onRemoveBlock(section.id, block.id)}
                >
                  <Trash />
                </IconButton>
              </Row>
            </li>
          );
        })}
      </ol>

      <AddButton open={adding} onToggle={() => setAdding((current) => !current)} small>
        Add block
      </AddButton>
      {adding ? (
        <Menu
          items={Object.entries(manifest.blocks).map(([type, block]) => ({
            key: type,
            label: block.name,
            blocked: addBlockBlockedReason(document, section.id, manifest, type),
          }))}
          onChoose={(type) => {
            actions.onAddBlock(section.id, type);
            setAdding(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** One section or block: grip, name and summary, then its buttons. */
function Row({
  active,
  hidden,
  name,
  summary,
  onSelect,
  handle,
  leading,
  compact = false,
  children,
}: {
  active: boolean;
  hidden: boolean;
  name: string;
  summary: string | null;
  onSelect: () => void;
  handle: ReturnType<ReturnType<typeof useSortable>["handleProps"]>;
  leading?: ReactNode;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-lg pe-1 transition-colors",
        active ? "bg-surface-hover" : "hover:bg-surface-hover/60",
      )}
    >
      <span
        {...handle}
        aria-hidden
        title="Drag to reorder"
        className="grid h-7 w-5 shrink-0 place-items-center text-muted/70 hover:text-foreground"
      >
        <Grip />
      </span>
      {leading}
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={cn("min-w-0 flex-1 cursor-pointer px-1.5 text-start", compact ? "py-1.5" : "py-2")}
      >
        <span
          className={cn(
            "block truncate text-sm",
            active && "font-medium",
            hidden && "text-muted line-through decoration-muted/60",
          )}
        >
          {name}
        </span>
        {summary ? <span className="block truncate text-xs text-muted">{summary}</span> : null}
      </button>
      {children}
    </div>
  );
}

function AddButton({
  open,
  onToggle,
  small = false,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  small?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 font-medium text-accent transition-colors hover:bg-surface-hover",
        small ? "py-1.5 text-xs" : "py-2 text-sm",
      )}
    >
      <span aria-hidden className="text-base leading-none">+</span> {children}
    </button>
  );
}

/** What can be added, with the reason when something cannot. */
function Menu({
  items,
  onChoose,
}: {
  items: { key: string; label: string; hint?: string; blocked: string | null }[];
  onChoose: (key: string) => void;
}) {
  return (
    <ul className="mb-2 space-y-0.5 rounded-lg border border-border bg-surface p-1">
      {items.map((item) => (
        <li key={item.key}>
          <button
            type="button"
            disabled={item.blocked !== null}
            title={item.blocked ?? undefined}
            onClick={() => onChoose(item.key)}
            className="w-full cursor-pointer rounded-md px-2 py-1.5 text-start text-sm transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {item.label}
            {item.blocked ? (
              <span className="block text-xs text-muted">{item.blocked}</span>
            ) : item.hint ? (
              <span className="block text-xs text-muted">{item.hint}</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A line to tell two of the same kind apart: their heading, text or label. */
function summaryOf(settings: Record<string, unknown>): string | null {
  for (const key of ["heading", "label", "text"]) {
    const value = settings[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

function Svg({ children, className = "h-4 w-4" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

function Chevron({ direction }: { direction: "up" | "down" | "right" }) {
  const paths = { up: "m6 15 6-6 6 6", down: "m6 9 6 6 6-6", right: "m9 6 6 6-6 6" };
  return (
    <Svg className={direction === "right" ? "h-3.5 w-3.5 rtl:-scale-x-100" : "h-4 w-4"}>
      <path d={paths[direction]} />
    </Svg>
  );
}

function Eye({ closed }: { closed: boolean }) {
  return (
    <Svg>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {closed ? <path d="m3 3 18 18" /> : null}
    </Svg>
  );
}

function Trash() {
  return (
    <Svg>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M9 7V4h6v3" />
    </Svg>
  );
}

function Grip() {
  return (
    <svg aria-hidden viewBox="0 0 10 16" fill="currentColor" className="h-3.5 w-2.5">
      {[2, 8, 14].flatMap((y) => [
        <circle key={`l${y}`} cx="2.5" cy={y} r="1.3" />,
        <circle key={`r${y}`} cx="7.5" cy={y} r="1.3" />,
      ])}
    </svg>
  );
}
