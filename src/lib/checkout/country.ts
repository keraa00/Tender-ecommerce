/**
 * Which country checkout starts on. Pure, so the guesswork is tested.
 *
 * In order: the country the buyer already chose (saved on the cart); the
 * first region in their browser's Accept-Language the store ships to; the
 * region of the storefront language they picked; the store's first zone's
 * first country, which is usually where it is based. Only ever a country the
 * store ships to — a default the buyer cannot check out with is no default.
 */

type Candidate = string | null | undefined;

/** Region subtags from an Accept-Language header, most preferred first. */
export function acceptLanguageRegions(header: string | null): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((entry) => entry.weight > 0)
    // Stable: equal weights keep the header's order.
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .flatMap(({ tag }) => {
      // "en-GB", "zh-Hant-TW", "es-419": the region is a two-letter subtag.
      const region = tag.split("-").slice(1).find((subtag) => /^[A-Za-z]{2}$/.test(subtag));
      return region ? [region.toUpperCase()] : [];
    });
}

export function preferredCountry(input: {
  saved: Candidate;
  acceptLanguage: string | null;
  /** A BCP 47 tag for the storefront language, like "pt-BR". */
  locale: string;
  /** Null when the store ships everywhere. */
  shipsTo: readonly string[] | null;
  /** The store's own guess at home. */
  fallback: Candidate;
}): string | null {
  const ships = (code: Candidate): code is string =>
    typeof code === "string" &&
    code !== "" &&
    (input.shipsTo === null || input.shipsTo.includes(code));

  const localeRegion = input.locale.split("-").find((subtag, index) => index > 0 && /^[A-Z]{2}$/.test(subtag));
  const candidates: Candidate[] = [
    input.saved,
    ...acceptLanguageRegions(input.acceptLanguage),
    localeRegion,
    input.fallback,
  ];

  return candidates.find(ships) ?? input.shipsTo?.[0] ?? null;
}
