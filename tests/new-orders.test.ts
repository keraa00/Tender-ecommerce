import { describe, expect, it } from "vitest";

import { en } from "@/lib/i18n/admin/en";
import {
  describeNewOrders,
  formatNewOrderCount,
  newOrdersReducer,
  orderArrivedAt,
  readOrderPaidPayload,
  storeOrdersTopic,
  toNewOrdersState,
} from "@/lib/orders/live";

const SEEN = Date.UTC(2026, 9, 21, 12, 0, 0);

function paid(id: string, paidAtMs: number | null = SEEN + 1000) {
  return { type: "received" as const, order: { id, orderNumber: 1, paidAtMs } };
}

describe("newOrdersReducer", () => {
  it("counts each newly paid order once", () => {
    let state = toNewOrdersState({ ids: [], seenThroughMs: SEEN });
    state = newOrdersReducer(state, paid("a"));
    state = newOrdersReducer(state, paid("b"));
    // Realtime may deliver the same announcement twice.
    state = newOrdersReducer(state, paid("a"));
    expect(state.ids.size).toBe(2);
  });

  it("does not count an order the server already reported", () => {
    // The sync ran just after the payment committed; its announcement lands
    // a moment later and must not make one order two.
    let state = toNewOrdersState({ ids: ["a"], seenThroughMs: SEEN });
    state = newOrdersReducer(state, paid("a"));
    expect(state.ids.size).toBe(1);
  });

  it("ignores orders paid before the member last looked", () => {
    let state = toNewOrdersState({ ids: [], seenThroughMs: SEEN });
    state = newOrdersReducer(state, paid("late", SEEN));
    state = newOrdersReducer(state, paid("older", SEEN - 60_000));
    expect(state.ids.size).toBe(0);
  });

  it("counts an announcement without a payment time", () => {
    const state = newOrdersReducer(
      toNewOrdersState({ ids: [], seenThroughMs: SEEN }),
      paid("a", null),
    );
    expect(state.ids.size).toBe(1);
  });

  it("takes the server's answer wholesale on sync", () => {
    let state = toNewOrdersState({ ids: [], seenThroughMs: SEEN });
    state = newOrdersReducer(state, paid("a"));
    state = newOrdersReducer(state, paid("b"));
    state = newOrdersReducer(state, {
      type: "synced",
      unseen: { ids: [], seenThroughMs: SEEN + 5000 },
    });
    expect(state.ids.size).toBe(0);
    expect(state.seenThroughMs).toBe(SEEN + 5000);

    // And the new marker applies to what arrives next.
    state = newOrdersReducer(state, paid("c", SEEN + 2000));
    expect(state.ids.size).toBe(0);
  });

  it("leaves the state untouched when nothing changes", () => {
    const state = toNewOrdersState({ ids: ["a"], seenThroughMs: SEEN });
    expect(newOrdersReducer(state, paid("a"))).toBe(state);
  });
});

describe("readOrderPaidPayload", () => {
  it("reads what the trigger sends", () => {
    expect(
      readOrderPaidPayload({ id: "a", orderNumber: 1042, paidAtMs: SEEN }),
    ).toEqual({ id: "a", orderNumber: 1042, paidAtMs: SEEN });
  });

  it("rejects anything without an id and order number", () => {
    expect(readOrderPaidPayload(null)).toBeNull();
    expect(readOrderPaidPayload("a")).toBeNull();
    expect(readOrderPaidPayload({ id: "a" })).toBeNull();
    expect(readOrderPaidPayload({ orderNumber: 1 })).toBeNull();
  });

  it("treats a missing or odd payment time as unknown", () => {
    expect(readOrderPaidPayload({ id: "a", orderNumber: 1 })?.paidAtMs).toBeNull();
    expect(
      readOrderPaidPayload({ id: "a", orderNumber: 1, paidAtMs: "soon" })?.paidAtMs,
    ).toBeNull();
  });
});

describe("labels", () => {
  it("caps the drawer count", () => {
    expect(formatNewOrderCount(1)).toBe("1");
    expect(formatNewOrderCount(99)).toBe("99");
    expect(formatNewOrderCount(100)).toBe("99+");
  });

  it("describes the count in words", () => {
    expect(describeNewOrders(1, "en", en.liveOrders)).toBe("1 new order");
    expect(describeNewOrders(3, "en", en.liveOrders)).toBe("3 new orders");
    expect(describeNewOrders(100, "en", en.liveOrders)).toBe("99+ new orders");
  });
});

describe("storeOrdersTopic", () => {
  it("matches the shape the Realtime policy accepts", () => {
    const topic = storeOrdersTopic("0199f0a2-7c1e-7b3a-9f00-123456789abc");
    expect(topic).toMatch(
      /^store:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:orders$/,
    );
  });
});

describe("orderArrivedAt", () => {
  const placed = new Date(SEEN - 60_000);
  const paidAt = new Date(SEEN + 60_000);

  it("is when a card order was paid", () => {
    expect(orderArrivedAt({ paymentMethod: "STRIPE", status: "PAID", createdAt: placed, paidAt })).toEqual(paidAt);
    expect(orderArrivedAt({ paymentMethod: "STRIPE", status: "PENDING", createdAt: placed, paidAt: null })).toBeNull();
  });

  it("is when a cash-on-delivery order was placed, paid or not, unless it was cancelled", () => {
    const cod = { paymentMethod: "CASH_ON_DELIVERY" as const, createdAt: placed };
    expect(orderArrivedAt({ ...cod, status: "PENDING", paidAt: null })).toEqual(placed);
    expect(orderArrivedAt({ ...cod, status: "PAID", paidAt })).toEqual(placed);
    expect(orderArrivedAt({ ...cod, status: "CANCELLED", paidAt: null })).toBeNull();
  });
});
