"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  retry,
}: {
  error: unknown;
  /** Re-fetches and re-renders the segment, which is what "Try again" means. */
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // Server errors arrive as an `Error` with a digest; a client one is
  // whatever was thrown.
  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;

  return (
    <div className="grid flex-1 place-items-center px-4 py-24 text-center">
      <div className="max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-muted text-pretty">
          This one&rsquo;s on us. Try again — if it keeps happening, the error
          reference below will help us track it down.
        </p>
        {digest && (
          <p className="mt-3 font-mono text-xs text-muted">{digest}</p>
        )}
        <Button onClick={retry} className="mt-6">
          Try again
        </Button>
      </div>
    </div>
  );
}
