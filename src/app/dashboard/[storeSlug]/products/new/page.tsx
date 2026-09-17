import type { Metadata } from "next";
import Link from "next/link";

import { ProductForm } from "@/components/products/product-form";
import { createProductAction } from "@/lib/products/actions";
import { getStoreContext } from "@/lib/stores/context";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage(
  props: PageProps<"/dashboard/[storeSlug]/products/new">,
) {
  const { storeSlug } = await props.params;
  // Verifies membership before the form is even rendered.
  await getStoreContext(storeSlug);

  // The tenant is bound server-side, so the slug is never taken from the
  // submitted body — a forged store field in the form would change nothing.
  const action = createProductAction.bind(null, storeSlug);

  return (
    <div className="py-8">
      <Link
        href={`/dashboard/${storeSlug}/products`}
        className="text-sm text-muted underline-offset-4 hover:underline"
      >
        ← Products
      </Link>

      <h2 className="mt-4 text-lg font-medium tracking-tight">New product</h2>
      <p className="mt-1 mb-6 text-sm text-muted">
        Save it as a draft while you work, then publish when it is ready.
      </p>

      <ProductForm action={action} submitLabel="Save product" />
    </div>
  );
}
