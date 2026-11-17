"use client";

import { useActionState, useEffect, useState } from "react";

import { KEEP_LOGO, LogoField, type LogoChoice } from "@/components/stores/logo-field";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Textarea } from "@/components/ui/field";
import { format } from "@/lib/i18n/format";
import { formatRich } from "@/lib/i18n/rich";
import type { AdminMessages } from "@/lib/i18n/admin";
import {
  checkStoreSlugAction,
  createStoreAction,
  type CreateStoreState,
  type SlugAvailability,
} from "@/lib/stores/actions";
import { SLUG_MIN_LENGTH, slugify } from "@/lib/slug";

// The answer is tagged with the slug it was asked about, so "are we still
// waiting?" is derived by comparing it to the current slug rather than tracked
// as its own state that has to be reset on every keystroke.
type CheckState = { slug: string; value: SlugAvailability } | null;

type CreateStoreCopy = {
  form: AdminMessages["platform"]["newStore"];
  logo: AdminMessages["stores"]["logo"];
  images: AdminMessages["validation"]["images"];
};

export function CreateStoreForm({ t: copy }: { t: CreateStoreCopy }) {
  const t = copy.form;
  const [state, formAction, pending] = useActionState<
    CreateStoreState,
    FormData
  >(createStoreAction, {});

  const [name, setName] = useState(state.values?.name ?? "");
  const [slug, setSlug] = useState(state.values?.slug ?? "");
  // Once the seller edits the address themselves, stop overwriting it from the
  // name — silently rewriting a field someone is typing into is infuriating.
  const [slugEdited, setSlugEdited] = useState(false);
  const [check, setCheck] = useState<CheckState>(null);
  const [logo, setLogo] = useState<LogoChoice>(KEEP_LOGO);

  const effectiveSlug = slugEdited ? slug : slugify(name);

  // Non-null only once an answer for the slug currently in the box has landed.
  const availability = check?.slug === effectiveSlug ? check.value : null;

  useEffect(() => {
    if (effectiveSlug.length < SLUG_MIN_LENGTH) return;

    let cancelled = false;

    const timer = setTimeout(async () => {
      const value = await checkStoreSlugAction(effectiveSlug);
      // A slower earlier request must not overwrite a newer answer.
      if (!cancelled) setCheck({ slug: effectiveSlug, value });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [effectiveSlug]);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormError>{state.formError}</FormError>

      <Field
        label={t.name}
        htmlFor="name"
        error={state.fieldErrors?.name}
        hint={t.nameHint}
      >
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t.namePlaceholder}
          autoComplete="off"
          required
          aria-invalid={Boolean(state.fieldErrors?.name)}
        />
      </Field>

      <Field
        label={t.address}
        htmlFor="slug"
        error={state.fieldErrors?.slug}
        hint={<SlugHint slug={effectiveSlug} availability={availability} t={t} />}
      >
        {/* A URL reads left to right in every language. */}
        <div
          dir="ltr"
          className="flex items-center rounded-lg border border-border-strong bg-surface focus-within:border-foreground"
        >
          <span className="ps-3 text-sm text-muted select-none">/s/</span>
          <Input
            id="slug"
            name="slug"
            value={effectiveSlug}
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(slugify(event.target.value));
            }}
            placeholder={t.addressPlaceholder}
            autoComplete="off"
            className="border-0 bg-transparent ps-1 focus-visible:outline-none"
            aria-invalid={Boolean(state.fieldErrors?.slug)}
          />
        </div>
      </Field>

      <Field
        label={t.description}
        htmlFor="description"
        error={state.fieldErrors?.description}
        hint={t.descriptionHint}
      >
        <Textarea
          id="description"
          name="description"
          rows={3}
          maxLength={280}
          defaultValue={state.values?.description}
          placeholder={t.descriptionPlaceholder}
        />
      </Field>

      <LogoField
        storeName={name}
        accentColor={null}
        current={null}
        value={logo}
        onChange={setLogo}
        error={state.fieldErrors?.logo}
        t={{ logo: copy.logo, images: copy.images }}
      />

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={
          pending || (availability !== null && availability.status !== "available")
        }
      >
        {pending ? t.creating : t.create}
      </Button>
    </form>
  );
}

function SlugHint({
  slug,
  availability,
  t,
}: {
  slug: string;
  availability: SlugAvailability | null;
  t: CreateStoreCopy["form"];
}) {
  if (slug.length < SLUG_MIN_LENGTH) {
    return <>{format(t.slugTooShort, { min: SLUG_MIN_LENGTH })}</>;
  }

  if (availability === null) {
    return <span className="text-muted">{t.checking}</span>;
  }

  // Isolated so the leading slash stays put inside a right-to-left sentence.
  const path = <bdi dir="ltr">/s/{slug}</bdi>;
  switch (availability.status) {
    case "available":
      return <span className="text-success">{formatRich(t.available, { path })}</span>;
    case "taken":
      return <span className="text-danger">{formatRich(t.taken, { path })}</span>;
    case "invalid":
      return <span className="text-danger">{availability.message}</span>;
  }
}
