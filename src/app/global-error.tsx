"use client";

import { useEffect } from "react";

/**
 * The last resort, when the root layout itself fails. It replaces the whole
 * document, so none of globals.css applies here: what it needs is inline,
 * and `color-scheme` lets it follow the system's light or dark mode.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;

  return (
    <html lang="en" style={{ colorScheme: "light dark" }}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "1rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <title>Something went wrong · Tender</title>
        <div style={{ maxWidth: "24rem" }}>
          <h1 style={{ fontSize: "1.25rem", margin: 0 }}>Something went wrong</h1>
          <p style={{ marginTop: "0.5rem", opacity: 0.7, fontSize: "0.875rem" }}>
            Tender couldn&rsquo;t load this page. Try again — if it keeps happening, the
            reference below will help track it down.
          </p>
          {digest ? (
            <p style={{ marginTop: "0.75rem", fontFamily: "monospace", fontSize: "0.75rem", opacity: 0.7 }}>
              {digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid currentColor",
              background: "transparent",
              color: "inherit",
              font: "inherit",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
