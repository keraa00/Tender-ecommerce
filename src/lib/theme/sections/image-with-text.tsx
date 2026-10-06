import Image from "next/image";

import { cn } from "@/lib/cn";
import { buttonFields, ThemeButton } from "../components";
import { defineSection } from "../define";
import { field } from "../fields";
import { resolveLinkHref } from "../links";

export default defineSection({
  type: "image-with-text",
  name: "Image with text",
  description: "An image beside a heading, text and a button.",
  layout: "contained",
  maxPerPage: 10,
  settings: {
    image: field.image({ label: "Image" }),
    imageAlt: field.text({
      label: "Image description",
      help: "Read aloud to buyers who can't see the image.",
      maxLength: 200,
    }),
    imagePosition: field.select({
      label: "Image position",
      options: [
        { value: "start", label: "Image first" },
        { value: "end", label: "Image second" },
      ],
      default: "start",
    }),
    heading: field.text({ label: "Heading", maxLength: 120 }),
    text: field.textarea({ label: "Text", maxLength: 1_000 }),
  },
  blocks: {
    button: { name: "Button", settings: buttonFields },
  },
  maxBlocks: 1,
  async Component({ section, ctx }) {
    const { settings } = section;
    const button = section.blocks.find((block) => block.settings.label.trim() !== "");
    const buttonHref = button ? await resolveLinkHref(button.settings.link, ctx) : null;

    return (
      <section className="grid items-center gap-8 sm:grid-cols-2 sm:gap-12">
        <div
          className={cn(
            "relative aspect-[4/3] overflow-hidden rounded-2xl bg-surface-subtle",
            settings.imagePosition === "end" && "sm:order-last",
          )}
        >
          {settings.image ? (
            <Image
              src={settings.image}
              alt={settings.imageAlt}
              fill
              sizes="(max-width: 640px) 100vw, 50vw"
              className="object-cover"
            />
          ) : null}
        </div>

        <div>
          {settings.heading.trim() !== "" ? (
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              {settings.heading}
            </h2>
          ) : null}
          {settings.text.trim() !== "" ? (
            <p className="mt-3 whitespace-pre-line text-muted text-pretty">
              {settings.text}
            </p>
          ) : null}
          {button && buttonHref ? (
            <ThemeButton
              href={buttonHref}
              label={button.settings.label}
              style={button.settings.style}
              className="mt-6"
            />
          ) : null}
        </div>
      </section>
    );
  },
});
