import { describe, expect, it } from "vitest";

import { sniffImageType } from "@/lib/images/sniff";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((value) =>
      typeof value === "string" ? [...value].map((char) => char.charCodeAt(0)) : [value],
    ),
  );

describe("sniffImageType", () => {
  it("recognises the four accepted formats by their signatures", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, "JFIF"))).toBe("image/jpeg");
    expect(sniffImageType(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d))).toBe(
      "image/png",
    );
    expect(sniffImageType(bytes("RIFF", 0x24, 0, 0, 0, "WEBPVP8 "))).toBe("image/webp");
    expect(sniffImageType(bytes(0, 0, 0, 0x20, "ftypavif", 0, 0, 0, 0))).toBe("image/avif");
    expect(sniffImageType(bytes(0, 0, 0, 0x20, "ftypavis", 0, 0, 0, 0))).toBe("image/avif");
  });

  it("refuses what is not one of them, whatever it claims to be", () => {
    expect(sniffImageType(bytes("<!DOCTYPE html><html>"))).toBeNull();
    expect(sniffImageType(bytes('<svg xmlns="http://'))).toBeNull();
    expect(sniffImageType(bytes("GIF89a", 0, 0, 0, 0, 0, 0))).toBeNull();
    expect(sniffImageType(bytes("RIFF", 0, 0, 0, 0, "WAVEfmt "))).toBeNull();
    expect(sniffImageType(bytes(0, 0, 0, 0x18, "ftypmp42", 0, 0, 0, 0))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
    expect(sniffImageType(bytes(0x89, "PN"))).toBeNull();
  });
});
