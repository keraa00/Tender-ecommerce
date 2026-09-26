"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/cn";

export function ProductGallery({
  images,
  title,
  noPhotoLabel,
}: {
  images: { url: string; alt: string }[];
  title: string;
  noPhotoLabel: string;
}) {
  const [index, setIndex] = useState(0);
  const current = images[index] ?? images[0];

  if (!current) {
    return (
      <div className="grid aspect-square place-items-center rounded-2xl bg-surface-subtle text-sm text-muted">
        {noPhotoLabel}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-surface-subtle">
        <Image
          src={current.url}
          alt={current.alt}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 55vw"
          className="object-cover"
        />
      </div>

      {images.length > 1 ? (
        <ul className="grid grid-cols-5 gap-2 sm:grid-cols-6">
          {images.map((image, position) => (
            <li key={image.url}>
              <button
                type="button"
                onClick={() => setIndex(position)}
                aria-label={`${title} — ${position + 1} / ${images.length}`}
                aria-current={position === index ? "true" : undefined}
                className={cn(
                  "relative block aspect-square w-full cursor-pointer overflow-hidden rounded-lg bg-surface-subtle ring-offset-2 ring-offset-background transition",
                  position === index
                    ? "ring-2 ring-foreground"
                    : "opacity-70 hover:opacity-100",
                )}
              >
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
