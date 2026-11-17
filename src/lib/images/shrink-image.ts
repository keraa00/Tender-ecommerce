import { MAX_THEME_IMAGE_BYTES, THEME_IMAGE_MAX_EDGE } from "@/lib/theme/uploads";

/**
 * A photo scaled down to fit through a Server Action: at most `maxEdge` on its
 * longest side, re-encoded, and smaller again until it is under `maxBytes`.
 * Browser-only. The defaults are the theme editor's; the product form passes
 * its own.
 *
 * A file already within both limits is sent as it is, so a small PNG keeps
 * its transparency and nothing is re-compressed for no reason.
 *
 * WebP where the browser can encode it; Safari cannot, and gets JPEG — on a
 * white background, because JPEG has no transparency and a cut-out product
 * shot would otherwise come out on black.
 */
export async function shrinkImage(
  source: File,
  {
    maxEdge = THEME_IMAGE_MAX_EDGE,
    maxBytes = MAX_THEME_IMAGE_BYTES,
    baseName = "theme-image",
  }: { maxEdge?: number; maxBytes?: number; baseName?: string } = {},
): Promise<File> {
  const bitmap = await createImageBitmap(source);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (source.size <= maxBytes && longest <= maxEdge) return source;

    let edge = Math.min(maxEdge, longest);

    for (let attempt = 0; attempt < 4; attempt++) {
      const scale = edge / longest;
      const blob = await encode(
        bitmap,
        Math.round(bitmap.width * scale),
        Math.round(bitmap.height * scale),
      );
      if (blob.size <= maxBytes) {
        const extension = blob.type === "image/webp" ? "webp" : "jpg";
        return new File([blob], `${baseName}.${extension}`, { type: blob.type });
      }
      edge = Math.round(edge * 0.75);
    }
  } finally {
    bitmap.close();
  }

  throw new ImageTooLargeError();
}

/**
 * Even the smallest size tried was over the limit. Its own class so the form
 * that called can say so in the seller's language; anything else thrown here
 * is a browser that could not decode or encode the file.
 */
export class ImageTooLargeError extends Error {
  constructor() {
    super("That image is too large. Try a smaller one.");
    this.name = "ImageTooLargeError";
  }
}

async function encode(bitmap: ImageBitmap, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);

  const webp = await toBlob(canvas, "image/webp");
  if (webp?.type === "image/webp") return webp;

  // Redraw over white: JPEG would turn transparent pixels black.
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = "source-over";

  const jpeg = await toBlob(canvas, "image/jpeg");
  if (!jpeg) throw new Error("Could not encode the image");
  return jpeg;
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
}
