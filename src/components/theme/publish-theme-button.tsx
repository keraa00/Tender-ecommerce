"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { PublishThemeState } from "@/lib/theme/actions";

/**
 * Publishes the saved draft at `version` — the one on screen. If someone saved
 * a newer draft since, publishing is refused rather than putting changes live
 * that the seller has not seen.
 */
export function PublishThemeButton({
  action,
  version,
}: {
  action: (state: PublishThemeState, formData: FormData) => Promise<PublishThemeState>;
  version: number;
}) {
  const [state, formAction, pending] = useActionState<PublishThemeState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="baseVersion" value={version} />
      {state.formError ? (
        <p role="alert" className="me-auto max-w-md text-sm text-danger text-pretty">
          {state.formError}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Publishing…" : "Publish"}
      </Button>
    </form>
  );
}
