import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MailIcon } from "@/components/storefront/icons";
import { format } from "@/lib/i18n/messages";
import { getStorefrontI18n } from "@/lib/i18n/server";
import { storefrontPaths } from "@/lib/storefront/links";
import { getStoreBySlug, getStoreContactEmail } from "@/lib/stores/queries";

export async function generateMetadata(
  props: PageProps<"/s/[storeSlug]/contact">,
): Promise<Metadata> {
  const { storeSlug } = await props.params;
  const [store, { t }] = await Promise.all([
    getStoreBySlug(storeSlug),
    getStorefrontI18n(),
  ]);
  return { title: store ? `${t.contact.title} · ${store.name}` : t.contact.title };
}

export default async function ContactPage(
  props: PageProps<"/s/[storeSlug]/contact">,
) {
  const { storeSlug } = await props.params;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();

  const [{ t }, email] = await Promise.all([
    getStorefrontI18n(),
    getStoreContactEmail(store.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t.contact.title}</h1>
      <p className="mt-3 text-lg text-muted text-pretty">
        {format(t.contact.intro, { store: store.name })}
      </p>

      {email ? (
        <a
          href={`mailto:${email}?subject=${encodeURIComponent(store.name)}`}
          className="mt-8 flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 transition-colors hover:bg-surface-hover"
        >
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white"
            style={{ backgroundColor: "var(--store-accent)" }}
          >
            <MailIcon className="h-6 w-6" />
          </span>
          <span className="min-w-0">
            <span className="block font-medium">{t.contact.emailUs}</span>
            <span className="block truncate text-sm text-muted">{email}</span>
          </span>
        </a>
      ) : null}

      {store.description ? (
        <section className="mt-12 border-t border-border pt-8">
          <h2 className="text-sm font-medium">
            {format(t.contact.about, { store: store.name })}
          </h2>
          <p className="mt-2 text-muted text-pretty">{store.description}</p>
        </section>
      ) : null}

      <Link
        href={storefrontPaths(store.slug).catalog}
        className="mt-10 inline-block text-sm font-medium underline underline-offset-4"
      >
        {t.contact.browse}{" "}
        <span aria-hidden className="inline-block rtl:-scale-x-100">
          →
        </span>
      </Link>
    </div>
  );
}
