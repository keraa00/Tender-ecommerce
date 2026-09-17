import { afterEach, describe, expect, it } from "vitest";

import {
  deriveAdminHost,
  getAdminRouting,
  originFor,
  sharedCookieDomain,
  splitHost,
} from "@/lib/admin/host";
import {
  resolveAdminHostRoute,
  resolveRootHostRoute,
} from "@/lib/admin/routing";

describe("deriveAdminHost", () => {
  it("prefixes the hostname and keeps the port", () => {
    expect(deriveAdminHost("localhost:3000")).toBe("admin.localhost:3000");
    expect(deriveAdminHost("tender.com")).toBe("admin.tender.com");
  });

  it("drops a www prefix rather than stacking on top of it", () => {
    expect(deriveAdminHost("www.tender.com")).toBe("admin.tender.com");
  });

  it("leaves an IPv6 literal's colons alone", () => {
    expect(splitHost("[::1]:3000")).toEqual(["[::1]:3000", null]);
  });
});

describe("sharedCookieDomain", () => {
  it("returns the parent domain, without the port a browser would reject", () => {
    expect(sharedCookieDomain("tender.com", "admin.tender.com")).toBe(
      "tender.com",
    );
    expect(sharedCookieDomain("localhost:3000", "admin.localhost:3000")).toBe(
      "localhost",
    );
  });

  it("returns null when the admin host is not under the root host", () => {
    // A `Domain` the current host does not own is dropped by the browser, so
    // guessing one here would read as a random logout.
    expect(sharedCookieDomain("tender.com", "admin.example.com")).toBeNull();
    expect(sharedCookieDomain("tender.com", "tender.com")).toBeNull();
    // Suffix match, not substring: `nottender.com` is a different site.
    expect(sharedCookieDomain("tender.com", "nottender.com")).toBeNull();
  });
});

describe("resolveAdminHostRoute", () => {
  it("rewrites a store path onto its internal route", () => {
    expect(resolveAdminHostRoute("/acme")).toEqual({
      kind: "rewrite",
      pathname: "/dashboard/acme",
    });
    expect(resolveAdminHostRoute("/acme/orders")).toEqual({
      kind: "rewrite",
      pathname: "/dashboard/acme/orders",
    });
    expect(resolveAdminHostRoute("/acme/products/abc-123")).toEqual({
      kind: "rewrite",
      pathname: "/dashboard/acme/products/abc-123",
    });
  });

  it("sends the store list and the create-store form to the root host", () => {
    expect(resolveAdminHostRoute("/")).toEqual({
      kind: "redirect",
      host: "root",
      pathname: "/dashboard",
    });
    expect(resolveAdminHostRoute("/new")).toEqual({
      kind: "redirect",
      host: "root",
      pathname: "/dashboard/new",
    });
  });

  it("sends platform routes back to the root host", () => {
    expect(resolveAdminHostRoute("/login")).toEqual({
      kind: "redirect",
      host: "root",
      pathname: "/login",
    });
    expect(resolveAdminHostRoute("/auth/confirm")).toEqual({
      kind: "redirect",
      host: "root",
      pathname: "/auth/confirm",
    });
    expect(resolveAdminHostRoute("/s/acme")).toEqual({
      kind: "redirect",
      host: "root",
      pathname: "/s/acme",
    });
  });

  it("re-resolves a stray absolute /dashboard link instead of 404ing", () => {
    expect(resolveAdminHostRoute("/dashboard/acme/products")).toEqual({
      kind: "redirect",
      host: "admin",
      pathname: "/acme/products",
    });
    // …including all the way back to the root host when that is where it goes.
    expect(resolveAdminHostRoute("/dashboard")).toEqual({
      kind: "redirect",
      host: "root",
      pathname: "/dashboard",
    });
    expect(resolveAdminHostRoute("/dashboard/new")).toEqual({
      kind: "redirect",
      host: "root",
      pathname: "/dashboard/new",
    });
  });

  it("leaves framework and API paths where they are", () => {
    // Rewriting these onto /dashboard/_next/… breaks fast refresh.
    expect(resolveAdminHostRoute("/_next/static/chunk.js")).toEqual({
      kind: "pass",
    });
    expect(resolveAdminHostRoute("/api/webhook")).toEqual({ kind: "pass" });
  });
});

describe("resolveRootHostRoute", () => {
  it("moves store admin onto the admin host", () => {
    expect(resolveRootHostRoute("/dashboard/acme")).toEqual({
      kind: "redirect",
      host: "admin",
      pathname: "/acme",
    });
    expect(resolveRootHostRoute("/dashboard/acme/products/new")).toEqual({
      kind: "redirect",
      host: "admin",
      pathname: "/acme/products/new",
    });
  });

  it("keeps the platform dashboard pages", () => {
    expect(resolveRootHostRoute("/dashboard")).toEqual({ kind: "pass" });
    expect(resolveRootHostRoute("/dashboard/new")).toEqual({ kind: "pass" });
  });

  it("ignores everything outside /dashboard", () => {
    expect(resolveRootHostRoute("/")).toEqual({ kind: "pass" });
    expect(resolveRootHostRoute("/s/acme")).toEqual({ kind: "pass" });
    expect(resolveRootHostRoute("/login")).toEqual({ kind: "pass" });
  });
});

describe("the two routing tables together", () => {
  it("never bounces a URL back and forth", () => {
    // The pairing that would loop: each host must send the other's paths away
    // and keep its own. Resolving one side's redirect on the other side has to
    // terminate.
    const adminPaths = ["/acme", "/acme/orders", "/acme/products/x"];
    for (const path of adminPaths) {
      const onAdmin = resolveAdminHostRoute(path);
      expect(onAdmin.kind).toBe("rewrite");
    }

    const rootPaths = ["/dashboard", "/dashboard/new", "/login", "/s/acme"];
    for (const path of rootPaths) {
      expect(resolveRootHostRoute(path).kind).toBe("pass");
    }

    // A redirect from one host always lands on a path the other host keeps.
    const fromRoot = resolveRootHostRoute("/dashboard/acme/orders");
    expect(fromRoot).toEqual({
      kind: "redirect",
      host: "admin",
      pathname: "/acme/orders",
    });
    expect(resolveAdminHostRoute(fromRoot.kind === "redirect" ? fromRoot.pathname : "")).toEqual({
      kind: "rewrite",
      pathname: "/dashboard/acme/orders",
    });

    const fromAdmin = resolveAdminHostRoute("/login");
    expect(fromAdmin.kind).toBe("redirect");
    expect(
      resolveRootHostRoute(fromAdmin.kind === "redirect" ? fromAdmin.pathname : ""),
    ).toEqual({ kind: "pass" });
  });
});

describe("getAdminRouting", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = original.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_ADMIN_HOST;
    delete process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
  });

  it("derives both hosts and the shared cookie domain from the app URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://tender.com";

    expect(getAdminRouting()).toEqual({
      rootHost: "tender.com",
      adminHost: "admin.tender.com",
      protocol: "https:",
      cookieDomain: "tender.com",
    });
  });

  it("builds absolute origins for each side", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    const routing = getAdminRouting();

    expect(routing).not.toBeNull();
    expect(originFor(routing!, "root")).toBe("http://localhost:3000");
    expect(originFor(routing!, "admin")).toBe("http://admin.localhost:3000");
  });

  it("switches off when the admin host is set to the root host", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://tender.com";
    process.env.NEXT_PUBLIC_ADMIN_HOST = "tender.com";

    expect(getAdminRouting()).toBeNull();
  });

  it("switches off without an app URL, and survives a malformed one", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(getAdminRouting()).toBeNull();

    process.env.NEXT_PUBLIC_APP_URL = "not a url";
    expect(getAdminRouting()).toBeNull();
  });
});
