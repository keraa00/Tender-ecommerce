import { describe, expect, it } from "vitest";

import { en } from "@/lib/i18n/admin/en";
import {
  describeStoreDeletionBlocker as describeIn,
  parseDeleteStoreForm as parseIn,
  storeDeletionBlockers,
  type StoreDeletionBlocker,
} from "@/lib/stores/deletion";

const describeStoreDeletionBlocker = (blocker: StoreDeletionBlocker) =>
  describeIn(blocker, "en", en.stores.deletionBlockers);
const parseDeleteStoreForm = (formData: FormData, slug: string) =>
  parseIn(formData, slug, en.stores.errors);

const clear = { paidUnfulfilled: 0, pendingCod: 0, paymentsInFlight: 0 };

describe("storeDeletionBlockers", () => {
  it("is clear when no buyer is owed anything", () => {
    expect(storeDeletionBlockers(clear)).toEqual([]);
  });

  it("blocks on paid orders not yet sent", () => {
    const [blocker] = storeDeletionBlockers({ ...clear, paidUnfulfilled: 2 });
    expect(blocker).toEqual({ kind: "paid-unfulfilled", count: 2 });
    expect(describeStoreDeletionBlocker(blocker)).toMatch(/^2 orders are paid/);
  });

  it("blocks on cash on delivery still to be collected", () => {
    const [blocker] = storeDeletionBlockers({ ...clear, pendingCod: 1 });
    expect(blocker).toEqual({ kind: "pending-cod", count: 1 });
    expect(describeStoreDeletionBlocker(blocker)).toMatch(/^1 order is waiting/);
  });

  it("blocks on a payment already moving, which cannot be cancelled", () => {
    const [blocker] = storeDeletionBlockers({ ...clear, paymentsInFlight: 1 });
    expect(describeStoreDeletionBlocker(blocker)).toMatch(/still going through/);
  });

  it("reports every reason, in a fixed order", () => {
    expect(
      storeDeletionBlockers({ paidUnfulfilled: 1, pendingCod: 1, paymentsInFlight: 1 }).map(
        (blocker) => blocker.kind,
      ),
    ).toEqual(["paid-unfulfilled", "pending-cod", "payment-in-flight"]);
  });
});

describe("parseDeleteStoreForm", () => {
  const form = (confirmSlug?: string, currentPassword?: string) => {
    const data = new FormData();
    if (confirmSlug !== undefined) data.set("confirmSlug", confirmSlug);
    if (currentPassword !== undefined) data.set("currentPassword", currentPassword);
    return data;
  };

  it("accepts the slug, typed with stray case or spaces, with a password", () => {
    expect(parseDeleteStoreForm(form(" Acme-Goods ", "hunter2"), "acme-goods")).toEqual({
      ok: true,
      currentPassword: "hunter2",
    });
  });

  it("refuses anything else, the store's name included", () => {
    expect(parseDeleteStoreForm(form("Acme Goods", "hunter2"), "acme-goods").ok).toBe(false);
    expect(parseDeleteStoreForm(form(undefined, "hunter2"), "acme-goods")).toEqual({
      ok: false,
      fieldErrors: { confirmSlug: "Type acme-goods to confirm." },
    });
  });

  it("wants the current password, and keeps it as typed", () => {
    expect(parseDeleteStoreForm(form("acme-goods"), "acme-goods")).toEqual({
      ok: false,
      fieldErrors: { currentPassword: "Enter your current password." },
    });
    expect(parseDeleteStoreForm(form("acme-goods", " spaced "), "acme-goods")).toEqual({
      ok: true,
      currentPassword: " spaced ",
    });
  });
});
