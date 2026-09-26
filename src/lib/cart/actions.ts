"use server";

import { refresh } from "next/cache";

import { rootDb } from "@/lib/db/root";
import { ProductStatus } from "@/lib/db/types";
import { isUuid } from "@/lib/ids";
import { getStoreBySlug } from "@/lib/stores/queries";
import { isStorePubliclyVisible } from "@/lib/stores/policy";
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

export async function addToCartAction(
  storeSlug: string,
  _prev: AddToCartState,
  formData: FormData,
): Promise<AddToCartState> {
  const storeId = await visibleStoreId(storeSlug);
  if (!storeId) return { error: "unavailable" };

  const variantId = formData.get("variantId");
  const requested = parseQuantity(formData.get("quantity")) ?? 1;
  if (!isUuid(variantId) || requested < 1) return { error: "unavailable" };

  // `storeId` in the filter is the IDOR guard: a variant id from another store
  // simply does not match.
  const variant = await rootDb.variant.findFirst({
    where: {
      id: variantId,
      storeId,
      product: { status: ProductStatus.ACTIVE },
    },
    select: { id: true, inventoryQty: true },
  });

  if (!variant) return { error: "unavailable" };
  if (variant.inventoryQty <= 0) return { error: "sold-out" };

  try {
    const sessionId = await ensureCartSessionId();

    await rootDb.$transaction(async (tx) => {
      const cart = await tx.cart.upsert({
        where: { storeId_sessionId: { storeId, sessionId } },
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
