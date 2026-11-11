import { describe, expect, it } from "vitest";

import {
  accountDeletionBlockers,
  describeAccountDeletionBlocker,
} from "@/lib/account/deletion";
import { displayName, initialsFor } from "@/lib/account/display";
import {
  authErrorMessage,
  GENERIC_ACCOUNT_ERROR,
  isExpectedAuthError,
} from "@/lib/account/errors";
import { accountExportFilename, buildAccountExport } from "@/lib/account/export";
import { describeUserAgent } from "@/lib/account/user-agent";
import { PlatformRole } from "@/lib/db/types";

describe("authErrorMessage", () => {
  it("has copy of its own for the codes users cause", () => {
    expect(authErrorMessage({ code: "same_password" })).toMatch(/different/);
    expect(authErrorMessage({ code: "weak_password" })).toMatch(/guess/);
    expect(authErrorMessage({ code: "email_exists" })).toMatch(/another account/);
  });

  it("treats any 429 as a rate limit", () => {
    expect(authErrorMessage({ status: 429 })).toMatch(/Wait a minute/);
    expect(isExpectedAuthError({ status: 429 })).toBe(true);
  });

  it("never passes Supabase's own message through", () => {
    const leaked = { code: "unexpected_failure", message: "pq: relation does not exist" };
    expect(authErrorMessage(leaked)).toBe(GENERIC_ACCOUNT_ERROR);
    expect(authErrorMessage(leaked, "Could not save.")).toBe("Could not save.");
    expect(isExpectedAuthError(leaked)).toBe(false);
  });
});

describe("describeUserAgent", () => {
  it("names browser and system", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome on macOS");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari on iPhone");
    expect(
      describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0"),
    ).toBe("Firefox on Windows");
  });

  it("does not mistake Edge or Opera for the Chrome they claim to be", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
      ),
    ).toBe("Edge on Windows");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 OPR/85.0.0.0",
      ),
    ).toBe("Opera on Android");
  });

  it("falls back for anything unrecognised", () => {
    expect(describeUserAgent(null)).toBe("Unknown device");
    expect(describeUserAgent("node")).toBe("Unknown device");
  });
});

describe("initialsFor", () => {
  it("takes the first and last names", () => {
    expect(initialsFor("Amra Hodžić", "a@example.com")).toBe("AH");
    expect(initialsFor("  mia  ", "m@example.com")).toBe("M");
    expect(initialsFor("Jean Claude Van Damme", "j@example.com")).toBe("JD");
  });

  it("keeps whole letters outside ASCII", () => {
    expect(initialsFor("đorđe šarić", "d@example.com")).toBe("ĐŠ");
  });

  it("falls back to the email", () => {
    expect(initialsFor(null, "kerim@example.com")).toBe("K");
    expect(initialsFor("", "kerim@example.com")).toBe("K");
  });

  it("greets by name, or email when there is none", () => {
    expect(displayName("Amra", "a@example.com")).toBe("Amra");
    expect(displayName("  ", "a@example.com")).toBe("a@example.com");
  });
});

describe("accountDeletionBlockers", () => {
  it("is clear for a shopper or a seller with no stores left", () => {
    expect(accountDeletionBlockers({ ownedStores: [], platformRole: PlatformRole.USER })).toEqual([]);
  });

  it("blocks on every owned store, naming a single one", () => {
    const one = accountDeletionBlockers({
      ownedStores: [{ name: "Acme", slug: "acme" }],
      platformRole: PlatformRole.USER,
    });
    expect(one).toEqual([{ kind: "owns-stores", stores: [{ name: "Acme", slug: "acme" }] }]);
    expect(describeAccountDeletionBlocker(one[0])).toMatch(/Acme/);

    const two = accountDeletionBlockers({
      ownedStores: [
        { name: "Acme", slug: "acme" },
        { name: "Bolt", slug: "bolt" },
      ],
      platformRole: PlatformRole.USER,
    });
    expect(describeAccountDeletionBlocker(two[0])).toMatch(/2 stores/);
  });

  it("blocks a platform admin", () => {
    expect(
      accountDeletionBlockers({ ownedStores: [], platformRole: PlatformRole.PLATFORM_ADMIN }),
    ).toEqual([{ kind: "platform-admin" }]);
  });
});

describe("buildAccountExport", () => {
  const generatedAt = new Date("2026-11-11T09:30:00Z");

  const input = {
    user: {
      id: "0193b6a0-0000-7000-8000-000000000001",
      email: "me@example.com",
      name: "Me",
      createdAt: new Date("2026-08-01T00:00:00Z"),
    },
    auth: { emailConfirmedAt: "2026-08-01T00:05:00Z", lastSignInAt: "2026-11-10T08:00:00Z" },
    memberships: [
      { role: "OWNER", createdAt: new Date("2026-08-02T00:00:00Z"), store: { name: "Acme", slug: "acme" } },
    ],
    orders: [
      {
        orderNumber: 7,
        status: "PAID",
        paymentMethod: "STRIPE",
        currency: "EUR",
        email: "me@example.com",
        subtotalCents: 4000,
        discountCents: 500,
        shippingCents: 450,
        paymentFeeCents: 0,
        totalCents: 3950,
        shippingAddress: { line1: "Ferhadija 1", city: "Sarajevo", country: "BA" },
        billingAddress: null,
        shippingRateName: "Standard",
        note: null,
        marketingConsent: false,
        createdAt: new Date("2026-10-01T12:00:00Z"),
        paidAt: new Date("2026-10-01T12:01:00Z"),
        fulfilledAt: null,
        cancelledAt: null,
        store: { name: "Bolt", slug: "bolt" },
        lines: [
          {
            titleSnapshot: "Tee",
            variantTitleSnapshot: "M / Black",
            skuSnapshot: "TEE-M-BLK",
            unitPriceCents: 2000,
            quantity: 2,
            discountCents: 500,
          },
        ],
      },
    ],
    generatedAt,
  };

  it("shapes the account, memberships and orders with ISO dates and cents", () => {
    const out = buildAccountExport(input);
    expect(out).toMatchObject({
      format: "tender-account-export",
      version: 1,
      generatedAt: "2026-11-11T09:30:00.000Z",
      account: { email: "me@example.com", lastSignInAt: "2026-11-10T08:00:00Z" },
      storeMemberships: [{ store: "Acme", storeSlug: "acme", role: "OWNER" }],
    });
    expect(out.ordersPlaced[0]).toMatchObject({
      store: "Bolt",
      orderNumber: 7,
      totalCents: 3950,
      currency: "EUR",
      paidAt: "2026-10-01T12:01:00.000Z",
      fulfilledAt: null,
      lines: [{ title: "Tee", variant: "M / Black", quantity: 2, unitPriceCents: 2000 }],
    });
  });

  it("survives a round trip through JSON unchanged", () => {
    const out = buildAccountExport(input);
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });

  it("is dated in UTC", () => {
    expect(accountExportFilename(new Date("2026-11-11T23:59:59Z"))).toBe(
      "tender-account-2026-11-11.json",
    );
  });
});
