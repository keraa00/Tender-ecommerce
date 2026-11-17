import Image from "next/image";

import { en } from "@/lib/i18n/messages/en";
import { buttonFields, ThemeButton } from "../components";
import { defineSection, type StorefrontContext } from "../define";
import type { ThemeDocument } from "../document";
import { field, textOr } from "../fields";
import { resolveLinkHref } from "../links";

/**
 * The banner at the top of the home page. Everything left empty falls back to
 * the store itself — its banner, name and description — which is how the
 * default theme reproduces the home page as it was before themes existed.
 */
export default defineSection({
  type: "hero",
  name: "Image banner",
  description: "A full-width image with a heading and buttons.",
  layout: "full-bleed",
  maxPerPage: 3,
  settings: {
    image: field.image({
      label: "Image",
      help: "Leave empty to use your store’s banner.",
    }),
    heading: field.text({
      label: "Heading",
      maxLength: 80,
      placeholder: "Your store’s name",
    }),
    text: field.textarea({
      label: "Text",
      maxLength: 280,
      placeholder: "Your store’s description",
    }),
  },
  blocks: {
    button: {
      name: "Button",
      settings: {
        ...buttonFields,
        label: { ...buttonFields.label, placeholder: en.home.shopAll },
      },
    },
  },
  maxBlocks: 2,
  async Component({ section, ctx }) {
    const { settings } = section;
    const { heading, text, image } = heroContent(settings, ctx);

    const buttons = await Promise.all(
      section.blocks.map(async (block) => ({
        id: block.id,
        href: await resolveLinkHref(block.settings.link, ctx),
        label: textOr(block.settings.label, ctx.t.home.shopAll),
        style: block.settings.style,
      })),
    );

    return (
      <section className="relative isolate overflow-hidden">
        {image ? (
          <>
            <Image
              src={image}
              alt=""
              fill
              priority
              sizes="100vw"
              className="-z-10 object-cover"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/65 via-black/35 to-black/5" />
          </>
        ) : (
          <div
            aria-hidden
            className="absolute inset-0 -z-10 opacity-15"
            style={{
              background:
                "radial-gradient(120% 90% at 0% 0%, var(--store-accent), transparent 60%)",
            }}
          />
        )}

        <div
          className={
            image
              ? "mx-auto w-full max-w-6xl px-4 py-20 text-white sm:px-6 sm:py-28"
              : "mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20"
          }
        >
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {heading}
          </h1>
          {text ? (
            <p
              className={
                image
                  ? "mt-4 max-w-xl text-lg text-white/85 text-pretty"
                  : "mt-4 max-w-xl text-lg text-muted text-pretty"
              }
            >
              {text}
            </p>
          ) : null}
          {/* One button sits straight under the text, as it always has. */}
          {buttons.length === 1 ? (
            <ThemeButton
              href={buttons[0].href}
              label={buttons[0].label}
              style={buttons[0].style}
              onImage={Boolean(image)}
              className="mt-8"
            />
          ) : buttons.length > 1 ? (
            <div className="mt-8 flex flex-wrap gap-3">
              {buttons.map(({ id, ...button }) => (
                <ThemeButton key={id} {...button} onImage={Boolean(image)} />
              ))}
            </div>
          ) : null}
        </div>
      </section>
    );
  },
});

/**
 * The picture at the top of a store’s home page, for showing the store
 * outside it — the card on Tender's landing page. The first visible banner's
 * image, with the same fallback to the store’s banner it renders with.
 */
export function storeCoverImage(
  theme: ThemeDocument,
  store: Pick<StorefrontContext["store"], "bannerUrl">,
): string | null {
  const hero = theme.pages.home.sections.find(
    (section) => section.type === "hero" && !section.hidden,
  );
  const image = hero?.settings.image;
  return (typeof image === "string" ? image : null) ?? store.bannerUrl;
}

/** The banner's copy and image, after the store’s own fallbacks. */
export function heroContent(
  settings: { image: string | null; heading: string; text: string },
  ctx: Pick<StorefrontContext, "store">,
) {
  return {
    image: settings.image ?? ctx.store.bannerUrl,
    heading: textOr(settings.heading, ctx.store.name),
    text: textOr(settings.text, ctx.store.description ?? ""),
  };
}
