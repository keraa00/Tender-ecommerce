import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "@/lib/auth/redirect";

describe("safeRedirectPath", () => {
  it("accepts same-origin paths", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("/dashboard/acme?tab=orders")).toBe(
      "/dashboard/acme?tab=orders",
    );
  });

  it("rejects protocol-relative URLs that leave the origin", () => {
    expect(safeRedirectPath("//evil.com")).toBeNull();
    expect(safeRedirectPath("//evil.com/dashboard")).toBeNull();
  });

  it("rejects backslash and control-character tricks browsers normalise away", () => {
    // Browsers read `\` as `/`, so these are `//evil.com` in disguise.
    expect(safeRedirectPath("/\\evil.com")).toBeNull();
    expect(safeRedirectPath("/\\/evil.com")).toBeNull();
    expect(safeRedirectPath("/\\\\evil.com")).toBeNull();
    // ...and strip tabs and newlines before parsing.
    expect(safeRedirectPath("/\t/evil.com")).toBeNull();
    expect(safeRedirectPath("/\n/evil.com")).toBeNull();
    expect(safeRedirectPath("/\r/evil.com")).toBeNull();
    expect(safeRedirectPath("/dashboard\u0000")).toBeNull();
  });

  it("keeps an encoded backslash, which stays a path on this origin", () => {
    expect(safeRedirectPath("/%5Cevil.com")).toBe("/%5Cevil.com");
  });

  it("rejects absolute URLs", () => {
    expect(safeRedirectPath("https://evil.com")).toBeNull();
    expect(safeRedirectPath("javascript:alert(1)")).toBeNull();
  });

  it("rejects anything that is not a path-shaped string", () => {
    expect(safeRedirectPath("dashboard")).toBeNull();
    expect(safeRedirectPath("")).toBeNull();
    expect(safeRedirectPath(null)).toBeNull();
    expect(safeRedirectPath(undefined)).toBeNull();
    // `searchParams` hands back an array when the key repeats.
    expect(safeRedirectPath(["/dashboard"])).toBeNull();
  });
});
