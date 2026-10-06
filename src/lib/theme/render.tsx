import type { ReactNode } from "react";

import type { StorefrontContext } from "./define";
import type { ThemeSection } from "./document";
import { PREVIEW_SECTION_ATTRIBUTE } from "./preview";
import { getSectionDefinition } from "./registry";

/**
 * Draws theme sections through the registry. Server Components: each section
 * fetches what it shows, and siblings fetch concurrently.
 */

/**
 * One section, or nothing if it is hidden or its type is unknown.
 *
 * In the editor's preview each section is tagged with its id, so a click on
 * it can select it in the editor. The tag is a `display: contents` element:
 * it adds no box, so the page lays out exactly as the storefront does.
 */
export function ThemeSectionView({
  section,
  ctx,
  preview = false,
}: {
  section: ThemeSection;
  ctx: StorefrontContext;
  preview?: boolean;
}) {
  const definition = getSectionDefinition(section.type);
  if (!definition || section.hidden) return null;

  const { Component } = definition;
  const { hidden: _hidden, blocks, ...rest } = section;
  const rendered = (
    <Component
      section={{ ...rest, blocks: blocks.filter((block) => !block.hidden) }}
      ctx={ctx}
    />
  );

  return preview ? (
    <div {...{ [PREVIEW_SECTION_ATTRIBUTE]: section.id }} className="contents">
      {rendered}
    </div>
  ) : (
    rendered
  );
}

/**
 * A page's sections in order. Full-bleed sections run edge to edge; each run
 * of consecutive contained ones shares the page's content column, spaced as
 * the home page always has been.
 */
export function ThemePage({
  sections,
  ctx,
  preview = false,
}: {
  sections: ThemeSection[];
  ctx: StorefrontContext;
  preview?: boolean;
}) {
  const output: ReactNode[] = [];
  let run: ThemeSection[] = [];

  const flush = () => {
    if (run.length === 0) return;
    output.push(
      // A gap rather than `space-y`: margins would not reach through the
      // preview's `display: contents` wrappers, and a gap looks the same.
      <div
        key={`column-${run[0].id}`}
        className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 py-12 sm:px-6"
      >
        {run.map((section) => (
          <ThemeSectionView key={section.id} section={section} ctx={ctx} preview={preview} />
        ))}
      </div>,
    );
    run = [];
  };

  for (const section of sections) {
    const definition = getSectionDefinition(section.type);
    if (!definition || section.hidden) continue;

    if (definition.layout === "contained") {
      run.push(section);
    } else {
      flush();
      output.push(
        <ThemeSectionView key={section.id} section={section} ctx={ctx} preview={preview} />,
      );
    }
  }
  flush();

  return <>{output}</>;
}
