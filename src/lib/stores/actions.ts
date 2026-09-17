"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as z from "zod";

import { storeAdminUrl } from "@/lib/admin/links";
import { requireUser } from "@/lib/auth/session";
import { rootDb } from "@/lib/db/root";
import { Prisma, StoreMemberRole } from "@/lib/db/types";
import { slugify, storeSlugSchema } from "@/lib/slug";
import { isStoreSlugTaken } from "./queries";

const createStoreSchema = z.object({
  name: z.string().trim().min(2, "Give your store a name.").max(60),
  slug: storeSlugSchema,
  description: z.string().trim().max(280).optional(),
});

export type CreateStoreState = {
  fieldErrors?: Partial<Record<"name" | "slug" | "description", string>>;
  formError?: string;
  values?: { name: string; slug: string; description: string };
};

export async function createStoreAction(
  _prev: CreateStoreState,
  formData: FormData,
): Promise<CreateStoreState> {
  const user = await requireUser("/dashboard/new");

  const values = {
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    description: String(formData.get("description") ?? ""),
  };

  const parsed = createStoreSchema.safeParse({
    name: values.name,
    // An empty slug field means "derive it from the name", which is what the
    // form does client-side anyway; this is the no-JavaScript fallback.
    slug: values.slug.trim() === "" ? slugify(values.name) : values.slug,
    description:
      values.description.trim() === "" ? undefined : values.description,
  });

  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      values,
      fieldErrors: {
        name: fieldErrors.name?.[0],
        slug: fieldErrors.slug?.[0],
        description: fieldErrors.description?.[0],
      },
    };
  }

  const { name, slug, description } = parsed.data;

  let createdSlug: string;
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
      select: { slug: true },
    });
    createdSlug = store.slug;
  } catch (error) {
    // The unique index is the real guard. The pre-flight availability check is
    // a UX affordance and can always lose a race to another signup.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        values,
        fieldErrors: { slug: "That address was just taken. Try another." },
      };
    }

    console.error("createStoreAction failed", error);
    return {
      values,
      formError: "Could not create the store. Please try again.",
    };
  }

  revalidatePath("/dashboard");
  // redirect() throws a control-flow signal — it must sit outside the try block
  // or the catch above would swallow it.

  // Absolute, because this form is served from the platform host and the new
  // store's admin is not. Going via a relative path would work — the proxy
  // would bounce it — but it would cost the seller an extra round trip on the
  // one screen where they are waiting to see something appear.
  redirect(storeAdminUrl(createdSlug));
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
  await requireUser("/dashboard/new");

  const parsed = storeSlugSchema.safeParse(rawSlug);
  if (!parsed.success) {
    return {
      status: "invalid",
      message: z.flattenError(parsed.error).formErrors[0] ?? "Invalid address.",
    };
  }

  return (await isStoreSlugTaken(parsed.data))
    ? { status: "taken" }
    : { status: "available" };
}
