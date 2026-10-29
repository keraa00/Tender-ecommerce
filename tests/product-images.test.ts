import { describe, expect, it } from "vitest";

import {
  imageRejectionReason,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_UPLOAD,
  sourceImageRejectionReason,
  storagePathFromPublicUrl,
} from "@/lib/products/constants";

const SUPABASE = "https://project.supabase.co";
const PUBLIC = `${SUPABASE}/storage/v1/object/public/product-images`;

describe("imageRejectionReason", () => {
  it("accepts the supported formats", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/avif"]) {
      expect(imageRejectionReason({ size: 1_000, type }), type).toBeNull();
    }
  });

  it("rejects an unsupported type", () => {
    expect(imageRejectionReason({ size: 1_000, type: "image/gif" })).toBeTruthy();
    expect(
      imageRejectionReason({ size: 1_000, type: "application/pdf" }),
    ).toBeTruthy();
  });

  it("rejects an empty file", () => {
    expect(imageRejectionReason({ size: 0, type: "image/png" })).toBeTruthy();
  });

  it("rejects a file over the size limit", () => {
    expect(
      imageRejectionReason({ size: 6 * 1024 * 1024, type: "image/png" }),
    ).toBeTruthy();
    expect(imageRejectionReason({ size: MAX_IMAGE_BYTES + 1, type: "image/webp" })).toBeTruthy();
    expect(imageRejectionReason({ size: MAX_IMAGE_BYTES, type: "image/webp" })).toBeNull();
  });

  it("lets a full batch fit in the 4MB Server Action body set in next.config.ts", () => {
    // Leaves room for the form's other fields and the multipart framing.
    expect(MAX_IMAGES_PER_UPLOAD * MAX_IMAGE_BYTES).toBeLessThan(3.75 * 1024 * 1024);
  });
});

describe("sourceImageRejectionReason", () => {
  it("accepts a phone photo far larger than what is uploaded", () => {
    expect(sourceImageRejectionReason({ size: 12 * 1024 * 1024, type: "image/jpeg" })).toBeNull();
  });

  it("still rejects empty, oversized and unsupported files", () => {
    expect(sourceImageRejectionReason({ size: 0, type: "image/jpeg" })).toBeTruthy();
    expect(sourceImageRejectionReason({ size: 21 * 1024 * 1024, type: "image/jpeg" })).toBeTruthy();
    expect(sourceImageRejectionReason({ size: 1_000, type: "image/gif" })).toBeTruthy();
  });
});

describe("storagePathFromPublicUrl", () => {
  it("extracts the object path from a URL this app produced", () => {
    expect(
      storagePathFromPublicUrl(`${PUBLIC}/store-1/abc.jpg`, SUPABASE),
    ).toBe("store-1/abc.jpg");
  });

  it("decodes a percent-encoded path", () => {
    expect(
      storagePathFromPublicUrl(`${PUBLIC}/store-1/a%20b.jpg`, SUPABASE),
    ).toBe("store-1/a b.jpg");
  });

  it("refuses a URL from another origin, so we never delete someone else's object", () => {
    expect(
      storagePathFromPublicUrl(
        "https://evil.example/storage/v1/object/public/product-images/x.jpg",
        SUPABASE,
      ),
    ).toBeNull();
  });

  it("refuses another bucket in the same project", () => {
    expect(
      storagePathFromPublicUrl(
        `${SUPABASE}/storage/v1/object/public/avatars/x.jpg`,
        SUPABASE,
      ),
    ).toBeNull();
  });

  it("refuses the seed catalogue's remote photography", () => {
    expect(
      storagePathFromPublicUrl(
        "https://live.staticflickr.com/1234/photo.jpg",
        SUPABASE,
      ),
    ).toBeNull();
  });

  it("refuses a malformed URL and an empty path", () => {
    expect(storagePathFromPublicUrl("not a url", SUPABASE)).toBeNull();
    expect(storagePathFromPublicUrl(`${PUBLIC}/`, SUPABASE)).toBeNull();
  });
});
