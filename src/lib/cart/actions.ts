"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";

import { MAX_CART_CODES } from "@/lib/checkout/totals";
import { rootDb } from "@/lib/db/root";
import { CartKind, Prisma, ProductStatus } from "@/lib/db/types";
import { DISCOUNT_CODE_MAX_LENGTH } from "@/lib/discounts/constants";
import { normalizeDiscountCode } from "@/lib/discounts/form";
import { isUuid } from "@/lib/ids";
import { storefrontPaths } from "@/lib/storefront/links";
import { getStoreBySlug } from "@/lib/stores/queries";
import { canAcceptOrders, isStorePubliclyVisible } from "@/lib/stores/policy";
import { clampLineQuantity, parseQuantity } from "./rules";
import { ensureCartSessionId, readCartSessionId } from "./session";

/**
 * Cart writes. The store comes from the slug the action was bound to on the
 * server; the variant and line ids come from the browser and are each checked
 * against that store (and, for lines, against this browser's own cart) before
 * anything is written.
 *
 * Errors are codes rather than sentences so the storefront can say them in the
 * buyer's language.
 */

export type AddToCartState = {
  error?: "sold-out" | "unavailable" | "failed";
  /** Changes on every successful add, so the page can react to repeats too. */
  addedAt?: number;
};

async function visibleStoreId(storeSlug: string): Promise<string | null> {
  const store = await getStoreBySlug(storeSlug);
  return store && isStorePubliclyVisible(store) ? store.id : null;
}

/**
 * The variant and quantity a product page posted, checked against the store:
 * `storeId` in the filter is the IDOR guard — a variant id from another store
 * simply does not match.
 */
async function purchasableVariant(
  storeId: string,
  formData: FormData,
): Promise<
  | { ok: true; variant: { id: string; inventoryQty: number }; requested: number }
  | { ok: false; error: NonNullable<AddToCartState["error"]> }
> {
  const variantId = formData.get("variantId");
  const requested = parseQuantity(formData.get("quantity")) ?? 1;
  if (!isUuid(variantId) || requested < 1) return { ok: false, error: "unavailable" };

  const variant = await rootDb.variant.findFirst({
    where: {
      id: variantId,
      storeId,
      product: { status: ProductStatus.ACTIVE },
    },
    select: { id: true, inventoryQty: true },
  });

  if (!variant) return { ok: false, error: "unavailable" };
  if (variant.inventoryQty <= 0) return { ok: false, error: "sold-out" };
  return { ok: true, variant, requested };
}

export async function addToCartAction(
  storeSlug: string,
  _prev: AddToCartState,
  formData: FormData,
): Promise<AddToCartState> {
  const storeId = await visibleStoreId(storeSlug);
  if (!storeId) return { error: "unavailable" };

  const found = await purchasableVariant(storeId, formData);
  if (!found.ok) return { error: found.error };
  const { variant, requested } = found;

  try {
    const sessionId = await ensureCartSessionId();

    await rootDb.$transaction(async (tx) => {
      const cart = await tx.cart.upsert({
        where: { storeId_sessionId_kind: { storeId, sessionId, kind: CartKind.STANDARD } },
        create: { storeId, sessionId },
        update: {},
        select: { id: true },
      });

      const existing = await tx.cartLine.findUnique({
        where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
        select: { quantity: true },
      });

      const quantity = clampLineQuantity(
        (existing?.quantity ?? 0) + requested,
        variant.inventoryQty,
      );

      await tx.cartLine.upsert({
        where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
        create: { cartId: cart.id, variantId: variant.id, quantity },
        update: { quantity },
      });
    });
  } catch (error) {
    console.error("addToCartAction failed", error);
    return { error: "failed" };
  }

  refresh();
  return { addedAt: Date.now() };
}

/**
 * "Buy it now": straight to checkout with this item alone, leaving the
 * buyer's cart exactly as it was.
 *
 * The item goes into a second cart, kind BUY_NOW, keyed like the first by
 * (store, session) — so checkout, the code box, pricing and the saved draft
 * all work on it unchanged, and a refresh keeps it. Whatever it held before
 * is replaced: it is one purchase, not a second cart to fill. The buyer's
 * email and address come across from the everyday cart, so they are not
 * typed twice; its discount codes do not — they were entered for that cart.
 */
export async function buyNowAction(
  storeSlug: string,
  _prev: AddToCartState,
  formData: FormData,
): Promise<AddToCartState> {
  const store = await getStoreBySlug(storeSlug);
  if (!store || !isStorePubliclyVisible(store) || !canAcceptOrders(store)) {
    return { error: "unavailable" };
  }

  const found = await purchasableVariant(store.id, formData);
  if (!found.ok) return { error: found.error };
  const { variant, requested } = found;
  const storeId = store.id;

  try {
    const sessionId = await ensureCartSessionId();

    await rootDb.$transaction(async (tx) => {
      const everyday = await tx.cart.findUnique({
        where: { storeId_sessionId_kind: { storeId, sessionId, kind: CartKind.STANDARD } },
        select: { email: true, checkoutDraft: true, shippingRateId: true },
      });
      const carried = {
        email: everyday?.email ?? null,
        checkoutDraft: everyday?.checkoutDraft ?? Prisma.DbNull,
        shippingRateId: everyday?.shippingRateId ?? null,
      };

      const cart = await tx.cart.upsert({
        where: { storeId_sessionId_kind: { storeId, sessionId, kind: CartKind.BUY_NOW } },
        create: { storeId, sessionId, kind: CartKind.BUY_NOW, ...carried },
        update: { discountCodes: [], ...carried },
        select: { id: true },
      });

      await tx.cartLine.deleteMany({ where: { cartId: cart.id } });
      await tx.cartLine.create({
        data: {
          cartId: cart.id,
          variantId: variant.id,
          quantity: clampLineQuantity(requested, variant.inventoryQty),
        },
      });
    });
  } catch (error) {
    console.error("buyNowAction failed", error);
    return { error: "failed" };
  }

  // Outside the try block: redirect() signals by throwing.
  redirect(storefrontPaths(store.slug).checkoutBuyNow);
}

export type DiscountCodeError =
  | "not-found"
  | "already-applied"
  | "too-many"
  | "empty-cart"
  | "failed";

export type DiscountCodeState = {
  error?: DiscountCodeError;
  /** Changes on every successful apply, so the form can clear its input. */
  appliedAt?: number;
};

/**
 * This browser's cart of one kind in the store, with how many lines it holds.
 * The kind comes bound from the server, but through the browser, so anything
 * unexpected is the everyday cart — it only ever picks between the buyer's own.
 */
async function currentCart(storeId: string, kind: CartKind) {
  const sessionId = await readCartSessionId();
  if (!sessionId) return null;

  return rootDb.cart.findUnique({
    where: {
      storeId_sessionId_kind: {
        storeId,
        sessionId,
        kind: kind === CartKind.BUY_NOW ? CartKind.BUY_NOW : CartKind.STANDARD,
      },
    },
    select: { id: true, discountCodes: true, _count: { select: { lines: true } } },
  });
}

/**
 * Adds a code to the cart. Only a code this store actually has is kept — the
 * buyer is told at once about a typo — but one that exists and cannot apply
 * yet (a minimum not met, an email not given) is kept, and the cart explains
 * what it is waiting for. Whether it applies is decided on every render by the
 * discount engine, never stored.
 */
export async function applyDiscountCodeAction(
  storeSlug: string,
  kind: CartKind,
  _prev: DiscountCodeState,
  formData: FormData,
): Promise<DiscountCodeState> {
  const storeId = await visibleStoreId(storeSlug);
  if (!storeId) return { error: "failed" };

  const raw = formData.get("code");
  const code = normalizeDiscountCode(typeof raw === "string" ? raw : "");
  if (code === "" || code.length > DISCOUNT_CODE_MAX_LENGTH) return { error: "not-found" };

  const cart = await currentCart(storeId, kind);
  if (!cart || cart._count.lines === 0) return { error: "empty-cart" };
  if (cart.discountCodes.includes(code)) return { error: "already-applied" };
  if (cart.discountCodes.length >= MAX_CART_CODES) return { error: "too-many" };

  // (storeId, code) is the tenant-scoped key: another store's WELCOME10 is
  // simply not found here.
  const discount = await rootDb.discount.findUnique({
    where: { storeId_code: { storeId, code } },
    select: { id: true },
  });
  if (!discount) return { error: "not-found" };

  try {
    await rootDb.cart.update({
      where: { id: cart.id },
      data: { discountCodes: [...cart.discountCodes, code] },
    });
  } catch (error) {
    console.error("applyDiscountCodeAction failed", error);
    return { error: "failed" };
  }

  refresh();
  return { appliedAt: Date.now() };
}

/** Takes a code off the cart. Posted by the remove button beside each code. */
export async function removeDiscountCodeAction(
  storeSlug: string,
  kind: CartKind,
  formData: FormData,
): Promise<void> {
  const storeId = await visibleStoreId(storeSlug);
  if (!storeId) return;

  const raw = formData.get("code");
  const code = normalizeDiscountCode(typeof raw === "string" ? raw : "");
  const cart = await currentCart(storeId, kind);
  if (!cart || !cart.discountCodes.includes(code)) return;

  try {
    await rootDb.cart.update({
      where: { id: cart.id },
      data: { discountCodes: cart.discountCodes.filter((entry) => entry !== code) },
    });
  } catch (error) {
    console.error("removeDiscountCodeAction failed", error);
  }

  refresh();
}

/**
 * Sets a line's quantity; 0 removes it. Posted by the +/−/remove buttons as
 * `lineId` plus `quantity`, so it works as a plain form before hydration.
 */
export async function updateCartLineAction(
  storeSlug: string,
  formData: FormData,
): Promise<void> {
  const storeId = await visibleStoreId(storeSlug);
  const sessionId = await readCartSessionId();
  const lineId = formData.get("lineId");
  const requested = parseQuantity(formData.get("quantity"));

  if (!storeId || !sessionId || !isUuid(lineId) || requested === null) return;

  // The line must sit in *this* browser's cart for *this* store. A line id
  // lifted from someone else's cart matches nothing.
  const line = await rootDb.cartLine.findFirst({
    where: { id: lineId, cart: { storeId, sessionId } },
    select: { id: true, variant: { select: { inventoryQty: true } } },
  });
  if (!line) return;

  const quantity = clampLineQuantity(requested, line.variant.inventoryQty);

  try {
    if (quantity === 0) {
      await rootDb.cartLine.delete({ where: { id: line.id } });
    } else {
      await rootDb.cartLine.update({
        where: { id: line.id },
        data: { quantity },
      });
    }
  } catch (error) {
    console.error("updateCartLineAction failed", error);
  }

  refresh();
}
