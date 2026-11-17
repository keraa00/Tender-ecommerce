import type { Metadata } from "next";
import Link from "next/link";

import { Arrow } from "@/components/admin/page-shell";
import { CreateStoreForm } from "@/components/stores/create-store-form";
import { requireUser } from "@/lib/auth/session";
import { getAdminI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAdminI18n();
  return { title: t.platform.newStore.title };
}

export default async function NewStorePage() {
  const [, { t: messages }] = await Promise.all([requireUser("/dashboard/new"), getAdminI18n()]);
  const t = messages.platform.newStore;

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6">
      <Link
        href="/dashboard"
        className="text-sm text-muted underline-offset-4 hover:underline"
      >
        <Arrow>←</Arrow> {t.back}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t.heading}</h1>
      <p className="mt-1.5 mb-8 text-sm text-muted text-pretty">{t.intro}</p>

      <CreateStoreForm
        t={{ form: t, logo: messages.stores.logo, images: messages.validation.images }}
      />
    </div>
  );
}
