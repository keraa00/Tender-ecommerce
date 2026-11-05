/**
 * Pulls openly-licensed photography for the demo catalogue and writes it to
 * `prisma/seed-images.json`.
 *
 *   npm run seed:images              fill gaps only (default)
 *   npm run seed:images -- --refresh discard the manifest and refetch everything
 *   npm run seed:images -- --commons search Wikimedia Commons from the start
 *
 * The resulting JSON is committed, so `npm run db:seed` is deterministic and
 * needs no network access. Openverse rate-limits anonymous callers to 20
 * requests a minute, so a full refresh takes a few minutes; gap-filling is
 * quick, which is why it is the default.
 *
 * When Openverse stops answering — rate-limited past its retries, or its
 * search simply down — the rest of the run searches Wikimedia Commons, which
 * carries the same licences and serves from a host next.config.ts allows.
 *
 * Every image is CC0, Public Domain Mark, CC-BY or CC-BY-SA. Attribution for
 * the ones that require it is written to CREDITS.md.
 */

import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

import { SEED_STORES } from "../prisma/seed-catalog";

const API = "https://api.openverse.org/v1/images/";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "TenderSeed/1.0 (https://github.com/keraa00/Tender-ecommerce; demo seed data)";

const REQUEST_SPACING_MS = 3_400;
/** Commons sets no hard limit, only that scripts don't hammer it. */
const COMMONS_SPACING_MS = 1_000;
const MAX_ATTEMPTS = 3;
const IMAGES_PER_PRODUCT = 2;

/**
 * The seed-photography hosts `images.remotePatterns` in next.config.ts lets
 * next/image load. A picture from anywhere else would break on the page, so
 * it is skipped here rather than widening that list.
 */
const ALLOWED_HOSTS = new Set(["live.staticflickr.com", "upload.wikimedia.org", "pd.w.org"]);

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

type CommonsPage = {
  title: string;
  /** Search rank: generator results come back in no particular order. */
  index?: number;
  imageinfo?: {
    url: string;
    thumburl?: string;
    thumbwidth?: number;
    thumbheight?: number;
    width: number;
    height: number;
    descriptionurl: string;
    extmetadata?: Record<string, { value: string } | undefined>;
  }[];
};

/** Set once Openverse stops answering, so the rest of the run skips it. */
let useCommons = process.argv.includes("--commons");

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
  if (useCommons) return searchCommons(query);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const results = await searchOnce(query).catch(() => null);
    if (results !== null) return results;

    const backoff = REQUEST_SPACING_MS * 2 ** attempt;
    console.warn(`    rate-limited on "${query}", waiting ${backoff / 1000}s`);
    await sleep(backoff);
  }

  console.warn(`    Openverse isn't answering — searching Wikimedia Commons for the rest of the run`);
  useCommons = true;
  return searchCommons(query);
}

/**
 * Commons' file search, in Openverse's shape. Only the licences Openverse is
 * asked for are kept, spelled the way it spells them.
 */
async function searchCommons(query: string): Promise<OpenverseResult[]> {
  const url = new URL(COMMONS_API);
  const params = {
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrnamespace: "6",
    gsrlimit: "20",
    gsrsearch: `filetype:bitmap ${query}`,
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "1280",
    iiextmetadatafilter: "LicenseShortName|Artist|ObjectName",
  };
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      console.warn(`    commons ${response.status} for "${query}"`);
      return [];
    }

    const body = (await response.json()) as { query?: { pages?: CommonsPage[] } };
    return (body.query?.pages ?? [])
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .flatMap((page) => {
        const info = page.imageinfo?.[0];
        const meta = info?.extmetadata ?? {};
        const license = commonsLicense(meta.LicenseShortName?.value ?? "");
        if (!info || !license) return [];

        // A 1280px rendition, not the original, which is often 20MB. Commons
        // hands these out on thumb.wikimedia.org now; the same path still
        // answers on upload.wikimedia.org, the host next.config.ts allows.
        const src = new URL(info.thumburl ?? info.url);
        if (src.hostname === "thumb.wikimedia.org") src.hostname = "upload.wikimedia.org";
        // Commons tags its thumbnail links with utm_* parameters; the file
        // doesn't need them.
        src.search = "";

        return [
          {
            title:
              plainText(meta.ObjectName?.value) ??
              page.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""),
            url: src.toString(),
            creator: plainText(meta.Artist?.value),
            license: license.name,
            license_version: license.version,
            foreign_landing_url: info.descriptionurl,
            width: info.thumbwidth ?? info.width,
            height: info.thumbheight ?? info.height,
          },
        ];
      });
  } catch {
    console.warn(`    commons unreachable for "${query}"`);
    return [];
  }
}

/** "CC BY-SA 4.0", "CC0", "Public domain" as Openverse's licence and version. */
function commonsLicense(shortName: string): { name: string; version: string | null } | null {
  const name = shortName.trim();
  if (/^cc0( 1\.0)?$/i.test(name)) return { name: "cc0", version: "1.0" };
  if (/^public domain$/i.test(name)) return { name: "pdm", version: "1.0" };
  const match = /^cc (by|by-sa) (\d\.\d)\b/i.exec(name);
  return match ? { name: match[1].toLowerCase(), version: match[2] } : null;
}

/** Commons metadata is HTML; alt text and credits want the words. */
function plainText(html: string | undefined): string | null {
  const text = html
    ?.replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text : null;
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
  if (!ALLOWED_HOSTS.has(new URL(result.url).hostname)) return false;
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
    await sleep(useCommons ? COMMONS_SPACING_MS : REQUEST_SPACING_MS);

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
      // Photographed with another key's image; a search would never be used.
      if (product.imageFrom) continue;
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
      "Generated by scripts/fetch-seed-images.ts from api.openverse.org and Wikimedia Commons. " +
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
    "Demo product photography is openly licensed and pulled from Openverse and",
    "Wikimedia Commons by `scripts/fetch-seed-images.ts`. Public-domain and CC0",
    "images are not listed.",
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
