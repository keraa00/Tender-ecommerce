"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as z from "zod";

import { allStoresUrl, storeAdminUrl } from "@/lib/admin/links";
import { verifyPassword } from "@/lib/auth/password";
import { requireUser } from "@/lib/auth/session";
import { rootDb } from "@/lib/db/root";
import { Prisma, StoreMemberRole, StoreStatus } from "@/lib/db/types";
import type { AdminMessages } from "@/lib/i18n/admin";
import { getAdminI18n } from "@/lib/i18n/server";
import { cancelPaymentIntent } from "@/lib/payments/intents";
import {
  UnrecognisedImageError,
  deleteProductImageObjects,
  deleteStoreObjects,
  uploadStoreLogo,
} from "@/lib/products/images";
import { slugify, storeSlugSchema } from "@/lib/slug";
import { requireSupabaseConfig } from "@/lib/supabase/config";
import { logoRejectionReason } from "./logo";
import { getStoreContext } from "./context";
import {
  describeStoreDeletionBlocker,
  parseDeleteStoreForm,
  storeDeletionBlockers,
  type DeleteStoreField,
  type StoreDeletionBlocker,
} from "./deletion";
import { canChangeCurrency, canDeleteStore } from "./policy";
import { getStoreDeletionReview, isStoreSlugTaken } from "./queries";
import {
  parseCheckoutSettingsForm,
  parseCodSettingsForm,
  parseGeneralSettingsForm,
  type CheckoutSettingsErrors,
  type CodSettingsErrors,
  type GeneralSettingsErrors,
} from "./settings-form";

function createStoreSchema(t: AdminMessages) {
  return z.object({
    name: z.string().trim().min(2, t.stores.errors.nameRequired).max(60),
    slug: storeSlugSchema(t.validation.slug),
    description: z.string().trim().max(280).optional(),
  });
}

export type CreateStoreState = {
  fieldErrors?: Partial<Record<"name" | "slug" | "description" | "logo", string>>;
  formError?: string;
  values?: { name: string; slug: string; description: string };
};

export async function createStoreAction(
  _prev: CreateStoreState,
  formData: FormData,
): Promise<CreateStoreState> {
  const [user, { t }] = await Promise.all([requireUser("/dashboard/new"), getAdminI18n()]);

  const values = {
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    description: String(formData.get("description") ?? ""),
  };

  const parsed = createStoreSchema(t).safeParse({
    name: values.name,
    // An empty slug field means "derive it from the name", which is what the
    // form does client-side anyway; this is the no-JavaScript fallback.
    slug: values.slug.trim() === "" ? slugify(values.name) : values.slug,
    description:
      values.description.trim() === "" ? undefined : values.description,
  });

  const logo = logoFrom(formData);
  const logoError = logo ? logoRejectionReason(logo, t.validation.images) : null;

  if (!parsed.success || logoError) {
    const fieldErrors = parsed.success ? {} : z.flattenError(parsed.error).fieldErrors;
    return {
      values,
      fieldErrors: {
        name: fieldErrors.name?.[0],
        slug: fieldErrors.slug?.[0],
        description: fieldErrors.description?.[0],
        logo: logoError ?? undefined,
      },
    };
  }

  const { name, slug, description } = parsed.data;

  let created: { id: string; slug: string };
  try {
    const store = await rootDb.store.create({
      data: {
        name,
        slug,
        description: description ?? null,
        ownerId: user.id,
        // The owner is also a member. Every authorization check in the app
        // reads membership, so ownership never becomes a special case that a
        // permission check can forget to handle.
        members: {
          create: { userId: user.id, role: StoreMemberRole.OWNER },
        },
      },
      select: { id: true, slug: true },
    });
    created = store;
  } catch (error) {
    // The unique index is the real guard. The pre-flight availability check is
    // a UX affordance and can always lose a race to another signup.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        values,
        fieldErrors: { slug: t.stores.errors.slugTaken },
      };
    }

    console.error("createStoreAction failed", error);
    return {
      values,
      formError: t.stores.errors.createFailed,
    };
  }

  // Uploaded once the store exists, because objects are keyed under its id.
  if (logo) await attachLogo(created.id, logo);

  revalidatePath("/dashboard");
  // redirect() throws a control-flow signal — it must sit outside the try block
  // or the catch above would swallow it.

  // Absolute, because this form is served from the platform host and the new
  // store's admin is not. Going via a relative path would work — the proxy
  // would bounce it — but it would cost the seller an extra round trip on the
  // one screen where they are waiting to see something appear.
  redirect(storeAdminUrl(created.slug));
}

/**
 * Best effort, and never throws: the store is already created, and a logo is
 * decoration. If storage is down the seller still gets their store, marked
 * with its initials, rather than an error that suggests nothing was made.
 */
async function attachLogo(storeId: string, logo: File): Promise<void> {
  let url: string | null = null;
  try {
    url = await uploadStoreLogo(storeId, logo);
    await rootDb.store.update({ where: { id: storeId }, data: { logoUrl: url } });
  } catch (error) {
    console.error("Store logo upload failed", error);
    if (url) await deleteProductImageObjects([url], requireSupabaseConfig().url);
  }
}

export type StoreSettingsState = {
  fieldErrors?: { logo?: string } & GeneralSettingsErrors;
  formError?: string;
  notice?: string;
};

/**
 * Saves Settings → General: the logo, the currency and the contact email.
 *
 * The currency is checked against the store's orders here, on the server, not
 * just disabled in the form: a forged post must not relabel a store that has
 * already taken money in another currency.
 */
export async function updateStoreSettingsAction(
  storeSlug: string,
  _prev: StoreSettingsState,
  formData: FormData,
): Promise<StoreSettingsState> {
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);

  const parsed = parseGeneralSettingsForm(formData, t);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };
  const { settings } = parsed;

  if (settings.currency !== store.currency) {
    const orderCount = await rootDb.order.count({ where: { storeId: store.id } });
    if (!canChangeCurrency({ orderCount })) {
      return {
        fieldErrors: {
          currency: t.stores.errors.currencyLocked,
        },
      };
    }
  }

  const logo = logoFrom(formData);
  const removeLogo = formData.get("removeLogo") === "1";
  const logoChanged = Boolean(logo) || removeLogo;

  const logoError = logo ? logoRejectionReason(logo, t.validation.images) : null;
  if (logoError) return { fieldErrors: { logo: logoError } };

  let logoUrl: string | null = store.logoUrl;
  let uploaded: string | null = null;
  try {
    if (logoChanged) {
      uploaded = logo ? await uploadStoreLogo(store.id, logo) : null;
      logoUrl = uploaded;
    }
    await rootDb.store.update({
      where: { id: store.id },
      data: { logoUrl, currency: settings.currency, contactEmail: settings.contactEmail },
    });
  } catch (error) {
    if (error instanceof UnrecognisedImageError) {
      return { fieldErrors: { logo: t.validation.images.unrecognised } };
    }
    console.error("updateStoreSettingsAction failed", error);
    if (uploaded) await deleteProductImageObjects([uploaded], requireSupabaseConfig().url);
    return { formError: t.stores.errors.settingsFailed };
  }

  // Nothing points at the old file any more. Only objects this app uploaded
  // are deleted; a seeded logo hosted elsewhere is left alone.
  if (logoChanged && store.logoUrl) {
    await deleteProductImageObjects([store.logoUrl], requireSupabaseConfig().url);
  }

  // The store list and this store's admin draw the mark; prices everywhere
  // in the admin follow the currency. The storefront reads the store fresh on
  // every request.
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/${storeSlug}`, "layout");

  return { notice: t.stores.saved };
}

export type CheckoutSettingsState = {
  fieldErrors?: CheckoutSettingsErrors;
  formError?: string;
  notice?: string;
};

/** Saves Settings → Checkout: which fields buyers are asked for. */
export async function updateCheckoutSettingsAction(
  storeSlug: string,
  _prev: CheckoutSettingsState,
  formData: FormData,
): Promise<CheckoutSettingsState> {
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);

  const parsed = parseCheckoutSettingsForm(formData, t);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  try {
    await rootDb.store.update({ where: { id: store.id }, data: parsed.settings });
  } catch (error) {
    console.error("updateCheckoutSettingsAction failed", error);
    return { formError: t.stores.errors.checkoutFailed };
  }

  revalidatePath(`/dashboard/${storeSlug}/settings/checkout`);
  return { notice: t.stores.saved };
}

export type CodSettingsState = {
  fieldErrors?: CodSettingsErrors;
  formError?: string;
  notice?: string;
};

/**
 * Saves Settings → Payments → Cash on delivery.
 *
 * Switching it on is a way of being paid, so — like finishing Stripe
 * onboarding — it opens a store that was still waiting to (PENDING → ACTIVE).
 * Never the other way, and never a SUSPENDED store: that is the platform's
 * decision. The status move is conditional on the row, not on what was read a
 * moment ago.
 */
export async function updateCodSettingsAction(
  storeSlug: string,
  _prev: CodSettingsState,
  formData: FormData,
): Promise<CodSettingsState> {
  const [{ store }, { t }] = await Promise.all([getStoreContext(storeSlug), getAdminI18n()]);

  const parsed = parseCodSettingsForm(formData, t);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  try {
    await rootDb.$transaction(async (tx) => {
      await tx.store.update({ where: { id: store.id }, data: parsed.settings });
      if (parsed.settings.codEnabled) {
        await tx.store.updateMany({
          where: { id: store.id, status: StoreStatus.PENDING },
          data: { status: StoreStatus.ACTIVE },
        });
      }
    });
  } catch (error) {
    console.error("updateCodSettingsAction failed", error);
    return { formError: t.stores.errors.codFailed };
  }

  // Whether the store can take orders shows across the admin — the overview's
  // checklist, the orders page — so the whole store layout is refreshed.
  revalidatePath(`/dashboard/${storeSlug}`, "layout");
  return { notice: t.stores.saved };
}

/**
 * The uploaded logo, if any. An empty file input still posts a nameless,
 * zero-byte File. The browser has already cropped and shrunk it, but only
 * `logoRejectionReason` on this side is a check that counts.
 */
function logoFrom(formData: FormData): File | null {
  const entry = formData.get("logo");
  return entry instanceof File && entry.size > 0 ? entry : null;
}

export type SlugAvailability =
  | { status: "available" }
  | { status: "taken" }
  | { status: "invalid"; message: string };

/**
 * Live availability check for the create-store form. Store slugs are public
 * URLs, so confirming that one exists leaks nothing.
 */
export async function checkStoreSlugAction(
  rawSlug: string,
): Promise<SlugAvailability> {
  const [, { t }] = await Promise.all([requireUser("/dashboard/new"), getAdminI18n()]);

  const parsed = storeSlugSchema(t.validation.slug).safeParse(rawSlug);
  if (!parsed.success) {
    return {
      status: "invalid",
      message: z.flattenError(parsed.error).formErrors[0] ?? t.stores.errors.invalidAddress,
    };
  }

  return (await isStoreSlugTaken(parsed.data))
    ? { status: "taken" }
    : { status: "available" };
}

export type DeleteStoreState = {
  fieldErrors?: Partial<Record<DeleteStoreField, string>>;
  formError?: string;
};

/**
 * Deletes the store and everything in it, orders included, for good.
 *
 * In order:
 * 0. Check the slug typed out and the owner's current password.
 * 1. Refuse while a buyer is owed something (`storeDeletionBlockers`).
 * 2. Suspend the store, so no new checkout can start — `checkoutBlockedReason`
 *    turns buyers away from a suspended store — while the next step runs.
 * 3. Cancel the PaymentIntent of every unpaid Stripe checkout. One that has
 *    meanwhile succeeded or is processing cannot be cancelled, and deleting its
 *    order would leave a charge with no order behind it, so that stops the
 *    deletion (and lifts the suspension) until it settles.
 * 4. Delete the orders and then the store in one transaction; every other row
 *    cascades from the store.
 * 5. Best effort: remove the store's files from storage.
 *
 * The seller's Stripe account is theirs and is left alone. Its later webhooks
 * find no store and no order, and are ignored.
 */
export async function deleteStoreAction(
  storeSlug: string,
  _prev: DeleteStoreState,
  formData: FormData,
): Promise<DeleteStoreState> {
  const [{ user, store, membership }, { t, locale }] = await Promise.all([
    getStoreContext(storeSlug),
    getAdminI18n(),
  ]);
  const say = t.stores.errors;
  const blocker = (found: StoreDeletionBlocker) =>
    describeStoreDeletionBlocker(found, locale, t.stores.deletionBlockers);

  if (!canDeleteStore(membership)) {
    return { formError: say.ownerOnly };
  }

  const parsed = parseDeleteStoreForm(formData, store.slug, say);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const check = await verifyPassword(user.email, parsed.currentPassword);
  if (check === "rate-limited") {
    return { formError: say.rateLimited };
  }
  if (check === "wrong") {
    return { fieldErrors: { currentPassword: say.wrongPassword } };
  }

  const review = await getStoreDeletionReview(store.id);
  const blockers = storeDeletionBlockers({ ...review, paymentsInFlight: 0 });
  if (blockers.length > 0) {
    return { formError: blocker(blockers[0]) };
  }

  const restoreStatus = () =>
    rootDb.store
      .update({ where: { id: store.id }, data: { status: store.status } })
      .catch((error) => console.error("deleteStoreAction: restoring status failed", error));

  await rootDb.store.update({
    where: { id: store.id },
    data: { status: StoreStatus.SUSPENDED },
  });

  // Read again now that checkout is closed, so an order placed in between is
  // not missed.
  const settled = await getStoreDeletionReview(store.id);
  const lateBlockers = storeDeletionBlockers({ ...settled, paymentsInFlight: 0 });
  if (lateBlockers.length > 0) {
    await restoreStatus();
    return { formError: blocker(lateBlockers[0]) };
  }

  let paymentsInFlight = 0;
  for (const order of settled.openCheckouts) {
    if (!order.stripePaymentIntentId || !order.stripeAccountId) continue;
    try {
      const intent = await cancelPaymentIntent(order.stripePaymentIntentId, order.stripeAccountId);
      if (intent.status === "succeeded" || intent.status === "processing") paymentsInFlight += 1;
    } catch (error) {
      // Not known to be dead, so not safe to orphan.
      console.error("deleteStoreAction: cancelling a PaymentIntent failed", error);
      paymentsInFlight += 1;
    }
  }

  if (paymentsInFlight > 0) {
    await restoreStatus();
    return {
      formError: blocker({ kind: "payment-in-flight", count: paymentsInFlight }),
    };
  }

  try {
    await rootDb.$transaction([
      rootDb.order.deleteMany({ where: { storeId: store.id } }),
      rootDb.store.delete({ where: { id: store.id } }),
    ]);
  } catch (error) {
    console.error("deleteStoreAction failed", error);
    await restoreStatus();
    return { formError: say.deleteFailed };
  }

  await deleteStoreObjects(store.id);

  revalidatePath("/dashboard");
  redirect(`${allStoresUrl()}?deleted=1`);
}
