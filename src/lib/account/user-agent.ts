/**
 * A session's user agent as a person would describe the device: "Chrome on
 * macOS". Deliberately coarse — the point is telling your phone from your
 * laptop, not fingerprinting — and order matters, because almost every
 * browser's UA string also claims to be Safari, and most claim Chrome too.
 */

const BROWSERS: readonly [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\b(?:OPR|Opera)\//, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\b(?:Firefox|FxiOS)\//, "Firefox"],
  [/\b(?:Chrome|CriOS)\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
];

const SYSTEMS: readonly [RegExp, string][] = [
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bAndroid\b/, "Android"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bWindows\b/, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

function match(table: readonly [RegExp, string][], ua: string): string | null {
  for (const [pattern, name] of table) {
    if (pattern.test(ua)) return name;
  }
  return null;
}

export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";

  const browser = match(BROWSERS, ua);
  const system = match(SYSTEMS, ua);

  if (browser && system) return `${browser} on ${system}`;
  if (browser) return browser;
  if (system) return system;
  return "Unknown device";
}
