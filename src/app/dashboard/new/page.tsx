import type { Metadata } from "next";
import Link from "next/link";

import { CreateStoreForm } from "@/components/stores/create-store-form";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "New store" };

export default async function NewStorePage() {
  await requireUser("/dashboard/new");

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6">
      <Link
        href="/dashboard"
        className="text-sm text-muted underline-offset-4 hover:underline"
      >
        ← Your stores
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Open a store
      </h1>
      <p className="mt-1.5 mb-8 text-sm text-muted text-pretty">
        Your storefront goes live immediately. You&rsquo;ll connect Stripe and
        add products next — buyers can&rsquo;t check out until payments are set
        up.
      </p>

      <CreateStoreForm />
    </div>
  );
}
