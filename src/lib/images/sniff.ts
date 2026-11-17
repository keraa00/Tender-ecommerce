/**
 * What an uploaded file actually is, read from its first bytes — never from
 * the type the browser declared, which is whatever the sender says it is.
 *
 * Only the four formats the storage bucket accepts (`scripts/setup-storage.ts`)
 * are recognised. Anything else is null and is refused, so a file posted as
 * `image/png` that is really HTML, a script or an SVG never reaches the public
 * bucket. Dependency-free and synchronous; it needs only the first 16 bytes.
 */

export type SniffedImageType = "image/jpeg" | "image/png" | "image/webp" | "image/avif";

/** How many leading bytes `sniffImageType` reads. */
export const SNIFF_BYTES = 16;

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  // JPEG: SOI marker followed by the start of another marker.
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: the fixed eight-byte signature.
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= png.length && png.every((byte, i) => bytes[i] === byte)) {
    return "image/png";
  }

  // WebP: a RIFF container whose form type is WEBP.
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "image/webp";
  }

  // AVIF: an ISO-BMFF `ftyp` box with an AVIF major brand. Image sequences
  // say `avis`.
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (brand === "avif" || brand === "avis") return "image/avif";
  }

  return null;
}

/** The refusal shown when a file's content is not one of the accepted images. */
export const UNRECOGNISED_IMAGE = "That file isn't a JPEG, PNG, WebP or AVIF image.";
