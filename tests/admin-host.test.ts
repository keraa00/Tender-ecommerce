import { afterEach, describe, expect, it } from "vitest";

import {
  deriveAdminHost,
  getAdminRouting,
  originFor,
  requestHost,
  sharedCookieDomain,
  splitHost,
  type AdminRouting,
} from "@/lib/admin/host";
import {
  hostRedirectRewrite,
  hostRedirectTarget,
  HOST_REDIRECT_PATH,
} from "@/lib/admin/host-redirect";
import {
  resolveAdminHostRoute,
  resolveRootHostRoute,
  resolveRoute,
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
    expect(sharedCookieDomain("tender.test:3000", "admin.tender.test:3000")).toBe(
      "tender.test",
    );
  });

  it("returns null for a single-label host, which cannot carry a Domain", () => {
    // `localhost` is a public suffix. RFC 6265 §5.3 downgrades
    // `Domain=localhost` to a host-only cookie, so `admin.localhost` never
    // receives the session however confidently we set it — and a seller signed
    // in on the root host loops between the login page and an admin that
    // cannot see them. Saying null here is the difference between a dev setup
    // that is honestly single-host and one that appears to work and does not.
    expect(sharedCookieDomain("localhost:3000", "admin.localhost:3000")).toBeNull();
    expect(sharedCookieDomain("dev-box", "admin.dev-box")).toBeNull();
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

  it("sends account settings to the root host, tabs included", () => {
    expect(resolveAdminHostRoute("/account")).toEqual({
      kind: "redirect",
      host: "root",
      pathname: "/dashboard/account",
    });
    expect(resolveAdminHostRoute("/account/security")).toEqual({
      kind: "redirect",
      host: "root",
      pathname: "/dashboard/account/security",
    });
    expect(resolveAdminHostRoute("/dashboard/account/privacy")).toEqual({
      kind: "redirect",
      host: "root",
      pathname: "/dashboard/account/privacy",
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
    expect(resolveRootHostRoute("/dashboard/account")).toEqual({ kind: "pass" });
    expect(resolveRootHostRoute("/dashboard/account/export")).toEqual({
      kind: "pass",
    });
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

const LOCAL: AdminRouting = {
  rootHost: "localhost:3000",
  adminHost: "admin.localhost:3000",
  protocol: "http:",
  cookieDomain: "localhost",
};

/**
 * In development every request's `nextUrl` carries the *server's* address,
 * whatever host the browser used — Next builds it from `--hostname`/`--port`
 * rather than from the `Host` header. So the URL alone cannot say which host a
 * request arrived on, and these tests model that: the URL is the root host's
 * even when the browser is on the admin host.
 */
function devUrl(pathAndSearch: string): URL {
  return new URL(pathAndSearch, "http://localhost:3000");
}

describe("requestHost", () => {
  it("prefers x-forwarded-host, since `host` may be an internal origin", () => {
    const headers = new Headers({
      host: "internal.fly.dev",
      "x-forwarded-host": "admin.tender.com",
    });

    expect(requestHost(headers)).toBe("admin.tender.com");
  });

  it("lowercases, and is empty when the request names no host at all", () => {
    expect(requestHost(new Headers({ host: "Admin.Tender.Com" }))).toBe(
      "admin.tender.com",
    );
    expect(requestHost(new Headers())).toBe("");
  });
});

describe("resolveRoute", () => {
  it("picks the table from the host the browser used, not from the URL", () => {
    expect(resolveRoute(LOCAL, "admin.localhost:3000", "/acme")).toEqual({
      kind: "rewrite",
      pathname: "/dashboard/acme",
    });
    expect(resolveRoute(LOCAL, "localhost:3000", "/acme")).toEqual({
      kind: "pass",
    });
  });

  it("leaves a host neither side owns alone", () => {
    // A preview URL, an IP, a health check: serve the paths as written.
    expect(resolveRoute(LOCAL, "10.0.0.5:3000", "/dashboard/acme")).toBeNull();
    expect(resolveRoute(LOCAL, "", "/dashboard/acme")).toBeNull();
  });
});

describe("hostRedirectRewrite", () => {
  it("keeps the request's own origin, so the rewrite stays internal", () => {
    // Anything cross-origin here would be a proxy Location header again, which
    // is the one thing that cannot carry a host.
    const rewritten = hostRedirectRewrite(devUrl("/login?next=%2Fdashboard"));

    expect(rewritten.origin).toBe("http://localhost:3000");
    expect(rewritten.pathname).toBe(HOST_REDIRECT_PATH);
  });
});

describe("hostRedirectTarget", () => {
  it("sends a platform path on the admin host to the root host, absolutely", () => {
    const target = hostRedirectTarget(
      LOCAL,
      "admin.localhost:3000",
      devUrl("/login?next=%2Fdashboard%2Facme"),
    );

    // The bug this route exists for: a relative `/login` here is resolved by
    // the browser against admin.localhost, which is where it just came from.
    expect(target?.toString()).toBe(
      "http://localhost:3000/login?next=%2Fdashboard%2Facme",
    );
  });

  it("sends a store path on the root host to the admin host, absolutely", () => {
    const target = hostRedirectTarget(
      LOCAL,
      "localhost:3000",
      devUrl("/dashboard/acme/orders?status=paid"),
    );

    expect(target?.toString()).toBe(
      "http://admin.localhost:3000/acme/orders?status=paid",
    );
  });

  it("refuses a request that reached it on its own", () => {
    // `/api/…` is passed through on both hosts, so the route is reachable
    // directly. Nothing in the URL names a destination, and nothing is trusted
    // to: the answer comes from the same table, and for this path it is `pass`.
    expect(
      hostRedirectTarget(
        LOCAL,
        "admin.localhost:3000",
        devUrl(`${HOST_REDIRECT_PATH}?host=root&to=https%3A%2F%2Fevil.example`),
      ),
    ).toBeNull();
    expect(
      hostRedirectTarget(LOCAL, "evil.example", devUrl("/dashboard/acme")),
    ).toBeNull();
  });
});

describe("the proxy and the redirect route together", () => {
  it("agree on every path, so the rewrite always has something to issue", () => {
    // The proxy rewrites onto the route handler whenever it sees a redirect,
    // and the handler recomputes that decision from the same request. If the
    // two could disagree the rewrite would land on a 404 — or, worse, send the
    // browser back where it came from.
    const cases: [host: string, path: string][] = [
      ["admin.localhost:3000", "/login?next=%2Fdashboard%2Facme"],
      ["admin.localhost:3000", "/"],
      ["admin.localhost:3000", "/new"],
      ["admin.localhost:3000", "/s/acme"],
      ["admin.localhost:3000", "/dashboard/acme/products"],
      ["localhost:3000", "/dashboard/acme"],
      ["localhost:3000", "/dashboard/acme/orders"],
    ];

    for (const [host, path] of cases) {
      const url = devUrl(path);
      const route = resolveRoute(LOCAL, host, url.pathname);

      expect(route?.kind).toBe("redirect");

      const target = hostRedirectTarget(LOCAL, host, url);
      expect(target).not.toBeNull();
      // Absolute, on one of the two hosts, carrying the original query. Not
      // necessarily the *other* host: a stray `/dashboard/…` typed on the admin
      // host is corrected in place.
      expect([LOCAL.rootHost, LOCAL.adminHost]).toContain(target!.host);
      expect(target!.search).toBe(url.search);

      // And one hop settles it — whatever the browser asks for next is not
      // another redirect. This is the property that was missing in the wild:
      // the table never looped, but the Location header it produced did.
      const next = resolveRoute(LOCAL, target!.host, target!.pathname);
      expect(next?.kind).not.toBe("redirect");
    }
  });

  it("terminates: the host a redirect lands on keeps the path", () => {
    // One hop, never two. Re-resolving each target on its new host must give
    // an answer that stays there.
    const onRoot = hostRedirectTarget(
      LOCAL,
      "admin.localhost:3000",
      devUrl("/login"),
    );
    expect(resolveRoute(LOCAL, onRoot!.host, onRoot!.pathname)).toEqual({
      kind: "pass",
    });

    const onAdmin = hostRedirectTarget(
      LOCAL,
      "localhost:3000",
      devUrl("/dashboard/acme/orders"),
    );
    expect(resolveRoute(LOCAL, onAdmin!.host, onAdmin!.pathname)).toEqual({
      kind: "rewrite",
      pathname: "/dashboard/acme/orders",
    });
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
    // Routing across the two hosts works on localhost; the session does not.
    expect(routing!.cookieDomain).toBeNull();
  });

  it("takes an explicit cookie domain over the derived one", () => {
    // The escape hatch for a dev host whose parent is not derivable, and the
    // reason the localhost guard above is not a dead end.
    process.env.NEXT_PUBLIC_APP_URL = "http://tender.test:3000";
    process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = "tender.test";

    expect(getAdminRouting()?.cookieDomain).toBe("tender.test");
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
