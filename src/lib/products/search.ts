/**
 * What counts as a match for storefront search, as pure functions. Free of
 * `server-only` so the header's live results can highlight exactly what the
 * query matched — and so tests can pin the ranking down without a database.
 */

/** Longest query the storefront accepts, in characters. */
export const SEARCH_QUERY_MAX = 100;

/** More words than this stop narrowing anything and only cost query time. */
const MAX_TERMS = 8;

/** The query as the storefront stores and echoes it. */
export function normalizeSearchQuery(query: string): string {
  return query.trim().slice(0, SEARCH_QUERY_MAX);
}

/**
 * The words a product has to contain, lower-cased and deduplicated. Each one
 * must match on its own, in any order — "red shirt" finds "Red Cotton Shirt",
 * which a single substring match would miss.
 */
export function searchTerms(query: string): string[] {
  const words = normalizeSearchQuery(query).toLowerCase().split(/\s+/);
  return [...new Set(words.filter(Boolean))].slice(0, MAX_TERMS);
}

/**
 * A term made literal for a `LIKE`/`ILIKE` pattern. Prisma's `contains` wraps
 * its value in `%…%` without escaping it, so a search for `%` or `_` would
 * match every product; Postgres's default escape character is a backslash.
 */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

/** Whether `term` appears in `text` at the start of a word. */
function startsAWord(text: string, term: string): boolean {
  for (
    let index = text.indexOf(term);
    index !== -1;
    index = text.indexOf(term, index + 1)
  ) {
    if (index === 0 || !WORD_CHARACTER.test(text[index - 1])) return true;
  }
  return false;
}

/**
 * How well a title answers the query, lower is better: the title itself, then
 * titles that begin with it, then titles with every word at a word start
 * ("sh" → "Linen Shirt"), then titles merely containing every word. Anything
 * else only matched on its description.
 */
export function titleMatchRank(title: string, terms: string[]): number {
  const text = title.toLowerCase();
  const phrase = terms.join(" ");

  if (text === phrase) return 0;
  if (text.startsWith(phrase)) return 1;
  if (terms.every((term) => startsAWord(text, term))) return 2;
  if (terms.every((term) => text.includes(term))) return 3;
  return 4;
}

/**
 * Orders matches best first. The sort is stable, so products the query
 * matches equally well keep the order they came in — newest first.
 */
export function rankByTitle<T extends { title: string }>(
  products: readonly T[],
  terms: string[],
): T[] {
  return products
    .map((product) => ({ product, rank: titleMatchRank(product.title, terms) }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ product }) => product);
}

/**
 * The spans of `text` to highlight for these terms, merged and in order. A
 * term is marked wherever it starts a word, or at its first occurrence if it
 * never does — so "m" bolds the M of "Camp Mug" rather than every m in it.
 *
 * Empty when lower-casing changes the text's length (a Turkish "İ", say): the
 * offsets would no longer line up, and no highlight beats a misplaced one.
 */
export function matchRanges(
  text: string,
  terms: string[],
): Array<[start: number, end: number]> {
  const lower = text.toLowerCase();
  if (lower.length !== text.length) return [];

  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    const hits: number[] = [];
    for (
      let index = lower.indexOf(term);
      index !== -1;
      index = lower.indexOf(term, index + term.length)
    ) {
      hits.push(index);
    }
    const wordStarts = hits.filter(
      (index) => index === 0 || !WORD_CHARACTER.test(lower[index - 1]),
    );
    for (const index of wordStarts.length > 0 ? wordStarts : hits.slice(0, 1)) {
      ranges.push([index, index + term.length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);

  const merged: Array<[number, number]> = [];
  for (const [start, end] of ranges) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
