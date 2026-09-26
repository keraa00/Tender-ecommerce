import "server-only";

import { cache } from "react";

import { rootDb } from "@/lib/db/root";
import { ProductStatus } from "@/lib/db/types";
import { cartTotals, MAX_LINE_QUANTITY } from "./rules";
import { readCartSessionId } from "./session";

export type CartLineView = {
  id: string;
  quantity: number;
  productTitle: string;
  productSlug: string;
  variantTitle: string;
  /** Hidden when it is the only option and still called "Default". */
  showVariantTitle: boolean;
  imageUrl: string | null;
  imageAlt: string;
  unitPriceCents: number;
  /** False once the product is unpublished or the option has sold out. */
  available: boolean;
  maxQuantity: number;
};

export type CartView = {
  lines: CartLineView[];
  itemCount: number;
  subtotalCents: number;
};

const EMPTY_CART: CartView = { lines: [], itemCount: 0, subtotalCents: 0 };

/**
 * This browser's cart in one store, shaped for display. Prices are read live
 * from the variant, not stored on the line — a cart is a wish list with
 * quantities, and the price that counts is the one at checkout.
 */
export const getCart = cache(async (storeId: string): Promise<CartView> => {
  const sessionId = await readCartSessionId();
  if (!sessionId) return EMPTY_CART;

  const cart = await rootDb.cart.findUnique({
    where: { storeId_sessionId: { storeId, sessionId } },
    include: {
      lines: {
        // Ids are uuid v7, so this is the order things were added in.
        orderBy: { id: "asc" },
        include: {
          variant: {
            include: {
              product: {
                select: {
                  title: true,
                  slug: true,
                  status: true,
                  _count: { select: { variants: true } },
                  images: {
                    orderBy: { position: "asc" },
                    take: 1,
                    select: { url: true, altText: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!cart) return EMPTY_CART;

  const lines = cart.lines
    // Belt and braces: the add action already refuses foreign variants.
    .filter((line) => line.variant.storeId === storeId)
    .map((line): CartLineView => {
      const { variant } = line;
      const { product } = variant;
      const image = product.images[0];
      const available =
        product.status === ProductStatus.ACTIVE && variant.inventoryQty > 0;
      const maxQuantity = Math.min(
        Math.max(variant.inventoryQty, 0),
        MAX_LINE_QUANTITY,
      );

      return {
        id: line.id,
        // Stock can fall after something was added. Show what can actually be
        // bought; the stored quantity is corrected on the next write.
        quantity: available ? Math.min(line.quantity, maxQuantity) : line.quantity,
        productTitle: product.title,
        productSlug: product.slug,
        variantTitle: variant.title,
        showVariantTitle:
          product._count.variants > 1 || variant.title.toLowerCase() !== "default",
        imageUrl: image?.url ?? null,
        imageAlt: image?.altText ?? product.title,
        unitPriceCents: variant.priceCents,
        available,
        maxQuantity,
      };
    });

  return { lines, ...cartTotals(lines) };
});
