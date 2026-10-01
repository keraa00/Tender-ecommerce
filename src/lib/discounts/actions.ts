"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { storeAdminPath } from "@/lib/admin/links";
import { rootDb } from "@/lib/db/root";
import { Prisma } from "@/lib/db/types";
import { isUuid } from "@/lib/ids";
import { getStoreContext } from "@/lib/stores/context";
import { parseDiscountForm, type DiscountDraft, type DiscountFieldErrors } from "./form";

export type DiscountFormState = {
  formError?: string;
  notice?: string;
  fieldErrors?: DiscountFieldErrors;
};

const CODE_TAKEN = "You already have a discount with that code.";
const SAVE_FAILED = "Could not save the discount. Please try again.";

/**
 * Narrows every product and collection id in the draft to ones this store
 * owns. The ids come back from the browser, so a forged or foreign one is
 * dropped here rather than written; a side that chose specific items and has
 * none left afterwards is reported, not saved as "applies to nothing".
 */
async function ownTargets(
  storeId: string,
  draft: DiscountDraft,
): Promise<{ draft: DiscountDraft } | { fieldErrors: DiscountFieldErrors }> {
  const productIds = [...new Set([...draft.productIds, ...draft.buyProductIds])];
  const collectionIds = [...new Set([...draft.collectionIds, ...draft.buyCollectionIds])];

  const [products, collections] = await Promise.all([
    productIds.length > 0
      ? rootDb.product.findMany({
          where: { storeId, id: { in: productIds } },
          select: { id: true },
        })
      : [],
    collectionIds.length > 0
      ? rootDb.collection.findMany({
          where: { storeId, id: { in: collectionIds } },
          select: { id: true },
        })
      : [],
  ]);

  const ownProducts = new Set(products.map((product) => product.id));
  const ownCollections = new Set(collections.map((collection) => collection.id));

  const owned: DiscountDraft = {
    ...draft,
    productIds: draft.productIds.filter((id) => ownProducts.has(id)),
    collectionIds: draft.collectionIds.filter((id) => ownCollections.has(id)),
    buyProductIds: draft.buyProductIds.filter((id) => ownProducts.has(id)),
    buyCollectionIds: draft.buyCollectionIds.filter((id) => ownCollections.has(id)),
  };

  const fieldErrors: DiscountFieldErrors = {};
  const gone = "Those items are no longer in your store. Choose again.";

  if (
    (owned.appliesTo === "PRODUCT" && owned.productIds.length === 0) ||
    (owned.appliesTo === "COLLECTION" && owned.collectionIds.length === 0)
  ) {
    fieldErrors.appliesTo = gone;
  }
  if (
    (owned.buysFrom === "PRODUCT" && owned.buyProductIds.length === 0) ||
    (owned.buysFrom === "COLLECTION" && owned.buyCollectionIds.length === 0)
  ) {
    fieldErrors.buysFrom = gone;
  }

  return Object.keys(fieldErrors).length > 0 ? { fieldErrors } : { draft: owned };
}

function scalarData(draft: DiscountDraft) {
  return {
    code: draft.code,
    title: draft.title,
    type: draft.type,
    value: draft.value,
    appliesTo: draft.appliesTo,
    buysFrom: draft.buysFrom,
    buyQuantity: draft.buyQuantity,
    getQuantity: draft.getQuantity,
    maxUsesPerOrder: draft.maxUsesPerOrder,
    minSubtotalCents: draft.minSubtotalCents,
    minQuantity: draft.minQuantity,
    eligibility: draft.eligibility,
    segments: draft.segments,
    usageLimit: draft.usageLimit,
    perCustomerLimit: draft.perCustomerLimit,
    combinable: draft.combinable,
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
    active: draft.active,
  };
}

function linkRows(draft: DiscountDraft) {
  return {
    products: [
      ...draft.productIds.map((productId) => ({ productId, role: "DISCOUNTED" as const })),
      ...draft.buyProductIds.map((productId) => ({ productId, role: "QUALIFYING" as const })),
    ],
    collections: [
      ...draft.collectionIds.map((collectionId) => ({
        collectionId,
        role: "DISCOUNTED" as const,
      })),
      ...draft.buyCollectionIds.map((collectionId) => ({
        collectionId,
        role: "QUALIFYING" as const,
      })),
    ],
    customers: draft.customerEmails.map((email) => ({ email })),
  };
}

function isCodeTaken(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function revalidateDiscountPages(storeSlug: string, discountId?: string) {
  // Internal route paths, not admin-host URLs — see the note in
  // `lib/products/actions.ts`.
  revalidatePath(`/dashboard/${storeSlug}/discounts`);
  if (discountId) revalidatePath(`/dashboard/${storeSlug}/discounts/${discountId}`);
}

export async function createDiscountAction(
  storeSlug: string,
  _prev: DiscountFormState,
  formData: FormData,
): Promise<DiscountFormState> {
  // The tenant comes from the URL plus the session, never from the form body.
  const { store } = await getStoreContext(storeSlug);

  const parsed = parseDiscountForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const checked = await ownTargets(store.id, parsed.draft);
  if ("fieldErrors" in checked) return { fieldErrors: checked.fieldErrors };

  const { draft } = checked;
  const links = linkRows(draft);
  let discountId: string;

  try {
    const discount = await rootDb.discount.create({
      data: {
        storeId: store.id,
        ...scalarData(draft),
        products: { create: links.products },
        collections: { create: links.collections },
        customers: { create: links.customers },
      },
      select: { id: true },
    });
    discountId = discount.id;
  } catch (error) {
    if (isCodeTaken(error)) return { fieldErrors: { code: CODE_TAKEN } };
    console.error("createDiscountAction failed", error);
    return { formError: SAVE_FAILED };
  }

  revalidateDiscountPages(storeSlug);
  // Outside the try block: redirect() signals by throwing.
  redirect(`${storeAdminPath(storeSlug, `discounts/${discountId}`)}?created=1`);
}

export async function updateDiscountAction(
  storeSlug: string,
  discountId: string,
  _prev: DiscountFormState,
  formData: FormData,
): Promise<DiscountFormState> {
  const { store } = await getStoreContext(storeSlug);
  if (!isUuid(discountId)) notFound();

  const existing = await rootDb.discount.findFirst({
    where: { id: discountId, storeId: store.id },
    select: { id: true },
  });
  if (!existing) notFound();

  const parsed = parseDiscountForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const checked = await ownTargets(store.id, parsed.draft);
  if ("fieldErrors" in checked) return { fieldErrors: checked.fieldErrors };

  const { draft } = checked;
  const links = linkRows(draft);

  try {
    await rootDb.$transaction(async (tx) => {
      await tx.discount.update({
        where: { id: existing.id },
        data: scalarData(draft),
      });

      // The form submits every target and customer each time, so replacing
      // them is the simplest write and cannot leave a stale one behind.
      await tx.discountProduct.deleteMany({ where: { discountId: existing.id } });
      await tx.discountCollection.deleteMany({ where: { discountId: existing.id } });
      await tx.discountCustomer.deleteMany({ where: { discountId: existing.id } });

      if (links.products.length > 0) {
        await tx.discountProduct.createMany({
          data: links.products.map((row) => ({ ...row, discountId: existing.id })),
        });
      }
      if (links.collections.length > 0) {
        await tx.discountCollection.createMany({
          data: links.collections.map((row) => ({ ...row, discountId: existing.id })),
        });
      }
      if (links.customers.length > 0) {
        await tx.discountCustomer.createMany({
          data: links.customers.map((row) => ({ ...row, discountId: existing.id })),
        });
      }
    });
  } catch (error) {
    if (isCodeTaken(error)) return { fieldErrors: { code: CODE_TAKEN } };
    console.error("updateDiscountAction failed", error);
    return { formError: SAVE_FAILED };
  }

  revalidateDiscountPages(storeSlug, existing.id);
  return { notice: "Saved." };
}

/**
 * The on/off switch on the list, so pausing a promotion does not mean opening
 * it. `active` is posted explicitly rather than flipped server-side: a double
 * click then lands on the state the seller saw, not back where it started.
 */
export async function setDiscountActiveAction(
  storeSlug: string,
  discountId: string,
  formData: FormData,
): Promise<void> {
  const { store } = await getStoreContext(storeSlug);
  if (!isUuid(discountId)) notFound();

  const active = formData.get("active") === "true";
  let updated = 0;

  try {
    ({ count: updated } = await rootDb.discount.updateMany({
      where: { id: discountId, storeId: store.id },
      data: { active },
    }));
  } catch (error) {
    // The list re-renders with the old state, which is the honest answer.
    console.error("setDiscountActiveAction failed", error);
    return;
  }

  // Outside the try block, like redirect(): notFound() signals by throwing.
  if (updated === 0) notFound();

  revalidateDiscountPages(storeSlug, discountId);
}

export async function deleteDiscountAction(
  storeSlug: string,
  discountId: string,
): Promise<void> {
  const { store } = await getStoreContext(storeSlug);
  if (!isUuid(discountId)) notFound();

  let deleted = 0;

  try {
    // Scoped by storeId as well as id. Targets, customers and redemptions
    // cascade; orders keep their `discountCents` and lose only the link.
    ({ count: deleted } = await rootDb.discount.deleteMany({
      where: { id: discountId, storeId: store.id },
    }));
  } catch (error) {
    console.error("deleteDiscountAction failed", error);
    redirect(
      `${storeAdminPath(storeSlug, `discounts/${discountId}`)}?error=delete-failed`,
    );
  }

  if (deleted === 0) notFound();

  revalidateDiscountPages(storeSlug);
  redirect(storeAdminPath(storeSlug, "discounts"));
}
