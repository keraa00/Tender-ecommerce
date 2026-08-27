/**
 * Pulls openly-licensed photography for the demo catalogue and writes it to
 * `prisma/seed-images.json`.
 *
 *   npm run seed:images              fill gaps only (default)
 *   npm run seed:images -- --refresh discard the manifest and refetch everything
 *
 * The resulting JSON is committed, so `npm run db:seed` is deterministic and
 * needs no network access. Openverse rate-limits anonymous callers to 20
 * requests a minute, so a full refresh takes a few minutes; gap-filling is
 * quick, which is why it is the default.
 *
 * Every image is CC0, Public Domain Mark, CC-BY or CC-BY-SA. Attribution for
 * the ones that require it is written to CREDITS.md.
 */

import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

import { SEED_STORES } from "../prisma/seed-catalog";

const API = "https://api.openverse.org/v1/images/";
const USER_AGENT = "tender-seed-script/1.0 (portfolio project)";

const REQUEST_SPACING_MS = 3_400;
const MAX_ATTEMPTS = 3;
const IMAGES_PER_PRODUCT = 2;

const MANIFEST_URL = new URL("../prisma/seed-images.json", import.meta.url);
const CREDITS_URL = new URL("../CREDITS.md", import.meta.url);

type OpenverseResult = {
  title: string | null;
  url: string;
  creator: string | null;
  license: string;
  license_version: string | null;
  foreign_landing_url: string | null;
  width: number | null;
  height: number | null;
};

export type SeedImage = {
  url: string;
  altText: string;
  creator: string | null;
  license: string;
  sourceUrl: string | null;
};

type Manifest = {
  generatedAt: string;
  note: string;
  images: Record<string, SeedImage[]>;
};

type Job = { key: string; queries: string[]; count: number };

// ---------------------------------------------------------------------------

async function searchOnce(query: string): Promise<OpenverseResult[] | null> {
  const url = new URL(API);
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", "20");
  url.searchParams.set("license", "cc0,pdm,by,by-sa");
  url.searchParams.set("mature", "false");

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });

  // 403 and 429 are the rate limiter, not a bad query — worth retrying.
  if (response.status === 403 || response.status === 429) return null;

  if (!response.ok) {
    console.warn(`    search ${response.status} for "${query}"`);
    return [];
  }

  const body = (await response.json()) as { results?: OpenverseResult[] };
  return body.results ?? [];
}

async function search(query: string): Promise<OpenverseResult[]> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const results = await searchOnce(query).catch(() => null);
    if (results !== null) return results;

    const backoff = REQUEST_SPACING_MS * 2 ** attempt;
    console.warn(`    rate-limited on "${query}", waiting ${backoff / 1000}s`);
    await sleep(backoff);
  }

  console.warn(`    giving up on "${query}"`);
  return [];
}

/** A URL that 404s at seed time is worse than no image at all. */
async function isReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function usable(result: OpenverseResult): boolean {
  if (!result.url.startsWith("https://")) return false;
  if (!result.width || !result.height) return false;
  if (result.width < 500) return false;

  const ratio = result.width / result.height;
  return ratio >= 0.5 && ratio <= 2.2;
}

function toSeedImage(result: OpenverseResult, fallbackAlt: string): SeedImage {
  return {
    url: result.url,
    altText: (result.title ?? fallbackAlt).slice(0, 160),
    creator: result.creator,
    license: result.license_version
      ? `${result.license.toUpperCase()} ${result.license_version}`
      : result.license.toUpperCase(),
    sourceUrl: result.foreign_landing_url,
  };
}

/**
 * Progressively broader queries. "waterproof rain jacket outdoor" finding
 * nothing usable does not mean "rain jacket" won't.
 */
function queryLadder(query: string, ...extra: string[]): string[] {
  const words = query.split(/\s+/).filter(Boolean);
  const ladder = [query];

  if (words.length > 2) ladder.push(words.slice(0, 2).join(" "));
  if (words.length > 1) ladder.push(words[words.length - 1]);
  ladder.push(...extra);

  return [...new Set(ladder)];
}

async function run(job: Job): Promise<SeedImage[]> {
  const picked: SeedImage[] = [];
  const seen = new Set<string>();

  for (const query of job.queries) {
    if (picked.length >= job.count) break;

    const results = (await search(query)).filter(usable);
    await sleep(REQUEST_SPACING_MS);

    for (const result of results) {
      if (picked.length >= job.count) break;
      if (seen.has(result.url)) continue;
      seen.add(result.url);

      if (!(await isReachable(result.url))) continue;
      picked.push(toSeedImage(result, query));
    }
  }

  console.log(
    `  ${job.key.padEnd(50)} ${picked.length === 0 ? "MISS" : `${picked.length}`}`,
  );
  return picked;
}

// ---------------------------------------------------------------------------

function buildJobs(): Job[] {
  const jobs: Job[] = [];

  for (const store of SEED_STORES) {
    jobs.push({
      key: `store:${store.slug}:banner`,
      queries: queryLadder(store.bannerQuery),
      count: 1,
    });
    jobs.push({
      key: `store:${store.slug}:logo`,
      queries: queryLadder(store.logoQuery),
      count: 1,
    });

    for (const product of store.products) {
      jobs.push({
        key: `product:${store.slug}:${product.slug}`,
        queries: queryLadder(product.imageQuery, product.title.toLowerCase()),
        count: IMAGES_PER_PRODUCT,
      });
    }
  }

  return jobs;
}

async function loadExisting(): Promise<Record<string, SeedImage[]>> {
  try {
    const raw = await readFile(MANIFEST_URL, "utf8");
    return (JSON.parse(raw) as Manifest).images ?? {};
  } catch {
    return {};
  }
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const existing = refresh ? {} : await loadExisting();
  const images: Record<string, SeedImage[]> = { ...existing };

  const jobs = buildJobs();
  const pending = jobs.filter((job) => (images[job.key]?.length ?? 0) === 0);

  console.log(
    `${jobs.length} keys, ${pending.length} to fetch` +
      (refresh ? " (full refresh)" : " (filling gaps)"),
  );

  for (const job of pending) {
    images[job.key] = await run(job);
  }

  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    note:
      "Generated by scripts/fetch-seed-images.ts from api.openverse.org. " +
      "All images are CC0, Public Domain Mark, CC-BY or CC-BY-SA. See CREDITS.md.",
    images,
  };

  await writeFile(MANIFEST_URL, `${JSON.stringify(manifest, null, 2)}\n`);

  const total = Object.values(images).flat().length;
  const missing = jobs.filter((job) => (images[job.key]?.length ?? 0) === 0);

  console.log(`\nWrote prisma/seed-images.json — ${total} images.`);
  if (missing.length > 0) {
    console.log(`Still missing ${missing.length} key(s):`);
    for (const job of missing) console.log(`  - ${job.key}`);
  }

  await writeCredits(images);
}

async function writeCredits(images: Record<string, SeedImage[]>) {
  const attributed = Object.values(images)
    .flat()
    .filter((image) => image.license.startsWith("BY"));

  const seen = new Set<string>();
  const lines = [
    "# Credits",
    "",
    "Demo product photography is openly licensed and pulled from Openverse by",
    "`scripts/fetch-seed-images.ts`. Public-domain and CC0 images are not listed.",
    "The images below are CC-BY or CC-BY-SA and are reproduced with attribution.",
    "",
  ];

  for (const image of attributed) {
    if (seen.has(image.url)) continue;
    seen.add(image.url);
    lines.push(
      `- "${image.altText}" by ${image.creator ?? "unknown"} — ${image.license}` +
        (image.sourceUrl ? ` — ${image.sourceUrl}` : ""),
    );
  }

  if (seen.size === 0) lines.push("_No attribution-required images in the current seed._");

  await writeFile(CREDITS_URL, `${lines.join("\n")}\n`);
  console.log(`Wrote CREDITS.md — ${seen.size} attributed image(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
