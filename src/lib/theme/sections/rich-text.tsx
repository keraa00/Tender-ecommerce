import { cn } from "@/lib/cn";
import { buttonFields, ThemeButton } from "../components";
import { defineSection } from "../define";
import { field } from "../fields";
import { resolveLinkHref } from "../links";

/**
 * Headings, paragraphs and buttons, stacked. Plain text only: line breaks are
 * kept, and nothing the seller types is ever read as markup.
 */
export default defineSection({
  type: "rich-text",
  name: "Rich text",
  description: "Headings, text and buttons.",
  layout: "contained",
  maxPerPage: 10,
  settings: {
    alignment: field.select({
      label: "Alignment",
      options: [
        { value: "start", label: "Left" },
        { value: "center", label: "Centre" },
      ],
      default: "center",
    }),
  },
  blocks: {
    heading: {
      name: "Heading",
      settings: { text: field.text({ label: "Heading", maxLength: 120 }) },
    },
    text: {
      name: "Text",
      settings: { text: field.textarea({ label: "Text", maxLength: 2_000 }) },
    },
    button: { name: "Button", settings: buttonFields },
  },
  // Everything it shows is a block, so it arrives with somewhere to type.
  startingBlocks: ["heading", "text"],
  maxBlocks: 6,
  async Component({ section, ctx }) {
    const centered = section.settings.alignment === "center";

    const items = await Promise.all(
      section.blocks.map(async (block) => {
        switch (block.type) {
          case "heading":
            return block.settings.text.trim() === "" ? null : (
              <h2
                key={block.id}
                className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
              >
                {block.settings.text}
              </h2>
            );
          case "text":
            return block.settings.text.trim() === "" ? null : (
              <p key={block.id} className="whitespace-pre-line text-muted text-pretty">
                {block.settings.text}
              </p>
            );
          case "button":
            // A button needs words; there is no sensible translated default.
            return block.settings.label.trim() === "" ? null : (
              <div key={block.id} className="pt-2">
                <ThemeButton
                  href={await resolveLinkHref(block.settings.link, ctx)}
                  label={block.settings.label}
                  style={block.settings.style}
                />
              </div>
            );
        }
      }),
    );

    if (items.every((item) => item === null)) return null;

    return (
      <section className={cn("mx-auto max-w-2xl space-y-4", centered && "text-center")}>
        {items}
      </section>
    );
  },
});
