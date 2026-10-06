import { describe, expect, it } from "vitest";

import {
  field,
  fieldDefault,
  fieldSchema,
  settingsDefaults,
  textOr,
} from "@/lib/theme/fields";

const UUID = "0192f1a4-7c3e-7b4d-8a1f-2c3d4e5f6a7b";
const OTHER_UUID = "0192f1a4-7c3e-7b4d-8a1f-2c3d4e5f6a7c";
const THIRD_UUID = "0192f1a4-7c3e-7b4d-8a1f-2c3d4e5f6a7d";

const ok = (schema: ReturnType<typeof fieldSchema>, value: unknown) => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};
const rejects = (schema: ReturnType<typeof fieldSchema>, value: unknown) =>
  !schema.safeParse(value).success;

describe("field builders", () => {
  it("fill in the defaults a section leaves out", () => {
    expect(field.text({ label: "Heading" })).toMatchObject({
      kind: "text",
      default: "",
      maxLength: 120,
    });
    expect(field.range({ label: "Limit", min: 1, max: 9, default: 3 }).step).toBe(1);
    expect(field.color({ label: "Accent" }).default).toBeNull();
    expect(field.link({ label: "Link" }).default).toEqual({ kind: "catalog" });
  });

  it("hand out defaults that are safe to mutate", () => {
    const list = field.collectionList({ label: "Collections", max: 3 });
    const first = settingsDefaults({ list });
    first.list.push(UUID);
    expect(settingsDefaults({ list }).list).toEqual([]);
    expect(fieldDefault(list)).toEqual([]);
  });
});

describe("fieldSchema", () => {
  it("trims text and holds it to its length", () => {
    const schema = fieldSchema(field.text({ label: "Heading", maxLength: 5 }));
    expect(ok(schema, "  hey  ")).toBe("hey");
    expect(rejects(schema, "too long")).toBe(true);
    expect(rejects(schema, 42)).toBe(true);
  });

  it("accepts only a select's own options", () => {
    const schema = fieldSchema(
      field.select({
        label: "Alignment",
        options: [
          { value: "start", label: "Left" },
          { value: "center", label: "Centre" },
        ],
        default: "start",
      }),
    );
    expect(ok(schema, "center")).toBe("center");
    expect(rejects(schema, "right")).toBe(true);
  });

  it("keeps a range inside its bounds and on its step", () => {
    const schema = fieldSchema(field.range({ label: "Limit", min: 2, max: 24, default: 8 }));
    expect(ok(schema, 2)).toBe(2);
    expect(ok(schema, 24)).toBe(24);
    expect(rejects(schema, 1)).toBe(true);
    expect(rejects(schema, 25)).toBe(true);
    expect(rejects(schema, 2.5)).toBe(true);
    expect(rejects(schema, "8")).toBe(true);
  });

  it("stores colours as lower-case hex, or null for inherit", () => {
    const schema = fieldSchema(field.color({ label: "Accent" }));
    expect(ok(schema, "#14504F")).toBe("#14504f");
    expect(ok(schema, null)).toBeNull();
    expect(rejects(schema, "red")).toBe(true);
    expect(rejects(schema, "#fff")).toBe(true);
    expect(rejects(schema, "url(javascript:alert(1))")).toBe(true);
  });

  it("takes only https image URLs", () => {
    const schema = fieldSchema(field.image({ label: "Image" }));
    expect(ok(schema, "https://example.supabase.co/a.png")).toBe(
      "https://example.supabase.co/a.png",
    );
    expect(ok(schema, null)).toBeNull();
    expect(rejects(schema, "http://example.com/a.png")).toBe(true);
    expect(rejects(schema, "javascript:alert(1)")).toBe(true);
    expect(rejects(schema, "/relative.png")).toBe(true);
  });

  it("takes collection ids only as uuids, de-duplicated, up to the limit", () => {
    const one = fieldSchema(field.collection({ label: "Collection" }));
    expect(ok(one, UUID)).toBe(UUID);
    expect(ok(one, null)).toBeNull();
    expect(rejects(one, "outerwear")).toBe(true);

    const many = fieldSchema(field.collectionList({ label: "Collections", max: 2 }));
    expect(ok(many, [UUID, OTHER_UUID, UUID])).toEqual([UUID, OTHER_UUID]);
    expect(rejects(many, ["not-a-uuid"])).toBe(true);
    expect(rejects(many, [UUID, OTHER_UUID, THIRD_UUID])).toBe(true);
  });

  it("accepts storefront pages and http(s) addresses as links, nothing else", () => {
    const schema = fieldSchema(field.link({ label: "Link" }));
    expect(ok(schema, { kind: "contact" })).toEqual({ kind: "contact" });
    expect(ok(schema, { kind: "collection", collectionId: UUID })).toEqual({
      kind: "collection",
      collectionId: UUID,
    });
    expect(ok(schema, { kind: "url", url: "https://example.com" })).toEqual({
      kind: "url",
      url: "https://example.com",
    });
    expect(rejects(schema, { kind: "url", url: "javascript:alert(1)" })).toBe(true);
    expect(rejects(schema, { kind: "url", url: "data:text/html,hi" })).toBe(true);
    expect(rejects(schema, { kind: "collection", collectionId: "outerwear" })).toBe(true);
    expect(rejects(schema, { kind: "path", path: "/s/other-store" })).toBe(true);
  });
});

describe("textOr", () => {
  it("uses the fallback only for empty or blank copy", () => {
    expect(textOr("", "Shop all")).toBe("Shop all");
    expect(textOr("   ", "Shop all")).toBe("Shop all");
    expect(textOr("Browse", "Shop all")).toBe("Browse");
  });
});
