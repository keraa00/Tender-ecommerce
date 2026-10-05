"use client";

import { useActionState, useState } from "react";

import { SaveBar, useDiscard } from "@/components/admin/save-bar";
import { KEEP_LOGO, LogoField, type LogoChoice } from "@/components/stores/logo-field";
import { FormError } from "@/components/ui/field";
import type { StoreSettingsState } from "@/lib/stores/actions";

type StoreSettingsFormProps = {
  action: (state: StoreSettingsState, formData: FormData) => Promise<StoreSettingsState>;
  store: { name: string; logoUrl: string | null; accentColor: string | null };
};

export function StoreSettingsForm(props: StoreSettingsFormProps) {
  const { key, discard } = useDiscard();
  return <StoreSettingsFormBody key={key} {...props} onDiscard={discard} />;
}

function StoreSettingsFormBody({
  action,
  store,
  onDiscard,
}: StoreSettingsFormProps & { onDiscard: () => void }) {
  const [state, formAction, pending] = useActionState<StoreSettingsState, FormData>(
    action,
    {},
  );
  const [logo, setLogo] = useState<LogoChoice>(KEEP_LOGO);

  // A save re-renders the page with the stored logo as `store.logoUrl`, so the
  // choice that produced it is spent. An error keeps it, to try again.
  const [settled, setSettled] = useState(state);
  if (state !== settled) {
    setSettled(state);
    if (state.notice) setLogo(KEEP_LOGO);
  }

  return (
    <form action={formAction} className="space-y-8" noValidate>
      <SaveBar
        label="Save changes"
        pending={pending}
        onDiscard={onDiscard}
        savedKey={state.notice ? state : undefined}
      />

      <FormError>{state.formError}</FormError>

      {state.notice ? (
        <p
          role="status"
          className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success"
        >
          {state.notice}
        </p>
      ) : null}

      <LogoField
        storeName={store.name}
        accentColor={store.accentColor}
        current={store.logoUrl}
        value={logo}
        onChange={setLogo}
        error={state.fieldErrors?.logo}
      />
    </form>
  );
}
