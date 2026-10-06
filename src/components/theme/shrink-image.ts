import { MAX_THEME_IMAGE_BYTES, THEME_IMAGE_MAX_EDGE } from "@/lib/theme/uploads";

/**
 * A photo scaled down to fit through a Server Action: at most
 * `THEME_IMAGE_MAX_EDGE` on its longest side, re-encoded, and smaller again
 * until it is under `MAX_THEME_IMAGE_BYTES`. Browser-only.
 *
 * WebP where the browser can encode it; Safari cannot, and gets JPEG — a
 * photo is what these slots hold, and a PNG of one would rarely fit.
 */
export async function shrinkImage(source: File): Promise<File> {
  const bitmap = await createImageBitmap(source);
  try {
    let edge = Math.min(THEME_IMAGE_MAX_EDGE, Math.max(bitmap.width, bitmap.height));

    for (let attempt = 0; attempt < 4; attempt++) {
      const scale = edge / Math.max(bitmap.width, bitmap.height);
      const blob = await encode(
        bitmap,
        Math.round(bitmap.width * scale),
        Math.round(bitmap.height * scale),
      );
      if (blob.size <= MAX_THEME_IMAGE_BYTES) {
        const extension = blob.type === "image/webp" ? "webp" : "jpg";
        return new File([blob], `theme-image.${extension}`, { type: blob.type });
      }
      edge = Math.round(edge * 0.75);
    }
  } finally {
    bitmap.close();
  }

  throw new Error("That image is too large. Try a smaller one.");
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

  const jpeg = await toBlob(canvas, "image/jpeg");
  if (!jpeg) throw new Error("Could not encode the image");
  return jpeg;
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
}
