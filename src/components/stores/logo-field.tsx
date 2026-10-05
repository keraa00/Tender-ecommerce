"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { StoreMark } from "@/components/store-mark";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { IMAGE_ACCEPT_ATTRIBUTE } from "@/lib/products/constants";
import { LOGO_PIXELS, logoRejectionReason } from "@/lib/stores/logo";

/** What the seller has done to the logo since the form was loaded. */
export type LogoChoice =
  | { kind: "keep" }
  | { kind: "new"; file: File; url: string }
  | { kind: "remove" };

export const KEEP_LOGO: LogoChoice = { kind: "keep" };

/**
 * A store's logo, previewed exactly as it will be shown: the chosen image
 * cropped square, the current logo, or the store's initials.
 *
 * The browser does the crop. Logos only ever appear as small squares, so a
 * centre crop to 512px loses nothing anyone would see, keeps every upload far
 * below the server-action body limit, and makes the preview the saved result.
 *
 * Controlled, so the form that owns the choice re-renders when it changes —
 * which is when `SaveBar` looks again. The file input still carries the
 * upload, so the field posts like any other.
 */
export function LogoField({
  storeName,
  accentColor,
  current,
  value,
  onChange,
  error,
}: {
  storeName: string;
  accentColor: string | null;
  /** The saved logo, or null for none. */
  current: string | null;
  value: LogoChoice;
  onChange: (next: LogoChoice) => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  const [problem, setProblem] = useState<string | null>(null);
  // Only the latest choice may land; a slow crop of an earlier file must not.
  const latest = useRef(0);

  // The file input follows the choice. A layout effect, so the reset handler
  // below never reads a choice older than the one on screen.
  useLayoutEffect(() => {
    valueRef.current = value;
    if (inputRef.current) syncInput(inputRef.current, value);
  }, [value]);

  // Object URLs hold the image in memory until revoked.
  useEffect(
    () => () => {
      if (value.kind === "new") URL.revokeObjectURL(value.url);
    },
    [value],
  );

  // React empties the form after every submission. Once it has, put back
  // whatever is still chosen: the logo after an error, nothing after a save.
  useEffect(() => {
    const input = inputRef.current;
    const form = input?.form;
    if (!input || !form) return;
    const resync = () => setTimeout(() => syncInput(input, valueRef.current), 0);
    form.addEventListener("reset", resync);
    return () => form.removeEventListener("reset", resync);
  }, []);

  async function choose(input: HTMLInputElement) {
    const chosen = input.files?.[0];
    const ticket = ++latest.current;
    setProblem(null);
    // Nothing is submitted until the crop is ready: an uncropped photo could
    // be over the body limit. A cancelled picker restores the last choice.
    syncInput(input, chosen ? KEEP_LOGO : valueRef.current);
    if (!chosen) return;

    let file: File;
    try {
      file = await squareLogo(chosen);
    } catch {
      // Not something this browser can draw. Send it as it is if the server
      // would take it; the check below says so if not.
      file = chosen;
    }
    if (ticket !== latest.current) return;

    const reason = logoRejectionReason(file);
    if (reason) {
      setProblem(reason);
      syncInput(input, valueRef.current);
      return;
    }
    onChange({ kind: "new", file, url: URL.createObjectURL(file) });
  }

  function remove() {
    latest.current += 1;
    setProblem(null);
    onChange(current ? { kind: "remove" } : KEEP_LOGO);
  }

  const shown =
    value.kind === "new" ? value.url : value.kind === "remove" ? null : current;

  return (
    <Field
      label="Logo"
      htmlFor="logo"
      error={problem ?? error}
      hint="Cropped to a square — PNG, JPEG, WebP or AVIF. Without a logo, your store's initials are shown instead."
    >
      <div className="flex items-center gap-4">
        <StoreMark name={storeName} logoUrl={shown} accentColor={accentColor} size="lg" />
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            id="logo"
            name="logo"
            type="file"
            accept={IMAGE_ACCEPT_ATTRIBUTE}
            onChange={(event) => choose(event.currentTarget)}
            className="peer sr-only"
          />
          {value.kind === "remove" ? (
            <input type="hidden" name="removeLogo" value="1" />
          ) : null}
          {/* A label, not a button, so choosing a file works without JavaScript. */}
          <label
            htmlFor="logo"
            className={buttonClasses(
              "secondary",
              "sm",
              "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
            )}
          >
            {shown ? "Replace" : "Upload logo"}
          </label>
          {shown ? (
            <Button type="button" variant="ghost" size="sm" onClick={remove}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </Field>
  );
}

function syncInput(input: HTMLInputElement, value: LogoChoice) {
  if (value.kind !== "new") {
    input.value = "";
    return;
  }
  const transfer = new DataTransfer();
  transfer.items.add(value.file);
  input.files = transfer.files;
}

/** The image's centre square, at most `LOGO_PIXELS` wide. */
async function squareLogo(source: File): Promise<File> {
  const bitmap = await createImageBitmap(source);
  const side = Math.min(bitmap.width, bitmap.height);
  const size = Math.min(side, LOGO_PIXELS);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas");
  context.imageSmoothingQuality = "high";
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.9),
  );
  if (!blob) throw new Error("Could not encode the logo");
  // Safari cannot encode WebP and hands back a PNG; name the file for what it got.
  const extension = blob.type === "image/webp" ? "webp" : "png";
  return new File([blob], `logo.${extension}`, { type: blob.type });
}
