/**
 * Single re-export point for generated Prisma types. Application code imports
 * from here rather than reaching into `src/generated/`, so the generated path
 * is an implementation detail of the data layer.
 */
export type {
  Cart,
  CartLine,
  Collection,
  Discount,
  DiscountCollection,
  DiscountCustomer,
  DiscountProduct,
  DiscountRedemption,
  Order,
  OrderLine,
  Product,
  ProductImage,
  ProductOnCollection,
  ShippingRate,
  ShippingZone,
  ShippingZoneCountry,
  Store,
  StoreMember,
  StoreTheme,
  User,
  Variant,
  WebhookEvent,
} from "@/generated/prisma/client";

export {
  CartKind,
  CheckoutFieldMode,
  CustomerSegment,
  DiscountAppliesTo,
  DiscountEligibility,
  DiscountTargetRole,
  DiscountType,
  OrderStatus,
  PlatformRole,
  ProductStatus,
  StoreMemberRole,
  StoreStatus,
} from "@/generated/prisma/enums";

export { Prisma } from "@/generated/prisma/client";
