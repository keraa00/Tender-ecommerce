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
