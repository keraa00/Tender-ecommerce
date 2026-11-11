import { describe, expect, it } from "vitest";

import {
  parseDeleteAccountForm,
  parseEmailChangeForm,
  parseForgotPasswordForm,
  parsePasswordChangeForm,
  parsePasswordResetForm,
  parseProfileForm,
} from "@/lib/account/form";

function data(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(entries)) form.set(name, value);
  return form;
}

describe("parseProfileForm", () => {
  it("trims the name", () => {
    expect(parseProfileForm(data({ name: "  Amra Hodžić " }))).toEqual({
      ok: true,
      data: { name: "Amra Hodžić" },
    });
  });

  it("refuses an empty or overlong name", () => {
    expect(parseProfileForm(data({ name: "   " })).ok).toBe(false);
    expect(parseProfileForm(data({ name: "x".repeat(81) })).ok).toBe(false);
    expect(parseProfileForm(data({})).ok).toBe(false);
  });
});

describe("parseEmailChangeForm", () => {
  it("lower-cases and trims the new address", () => {
    expect(
      parseEmailChangeForm(
        data({ email: " New@Example.COM ", currentPassword: "hunter22" }),
        "old@example.com",
      ),
    ).toEqual({ ok: true, data: { email: "new@example.com", currentPassword: "hunter22" } });
  });

  it("refuses the address the account already has, whatever its case", () => {
    const result = parseEmailChangeForm(
      data({ email: "OLD@example.com", currentPassword: "hunter22" }),
      "old@example.com",
    );
    expect(result).toMatchObject({ ok: false, fieldErrors: { email: expect.any(String) } });
  });

  it("wants the current password, and reports both problems at once", () => {
    const result = parseEmailChangeForm(data({ email: "not-an-email" }), "old@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.email).toBeDefined();
      expect(result.fieldErrors.currentPassword).toBeDefined();
    }
  });
});

describe("parsePasswordChangeForm", () => {
  const valid = {
    currentPassword: "old-password",
    newPassword: "brand-new-password",
    confirmPassword: "brand-new-password",
  };

  it("accepts a new password that is confirmed and different", () => {
    expect(parsePasswordChangeForm(data(valid))).toEqual({
      ok: true,
      data: { currentPassword: "old-password", newPassword: "brand-new-password" },
    });
  });

  it("keeps passwords exactly as typed, spaces included", () => {
    const result = parsePasswordChangeForm(
      data({ ...valid, newPassword: " spaced out ", confirmPassword: " spaced out " }),
    );
    expect(result.ok && result.data.newPassword).toBe(" spaced out ");
  });

  it("refuses a mismatched confirmation", () => {
    expect(
      parsePasswordChangeForm(data({ ...valid, confirmPassword: "something-else" })),
    ).toMatchObject({ ok: false, fieldErrors: { confirmPassword: expect.any(String) } });
  });

  it("refuses a new password that is the current one", () => {
    expect(
      parsePasswordChangeForm(
        data({ currentPassword: "same-password", newPassword: "same-password", confirmPassword: "same-password" }),
      ),
    ).toMatchObject({ ok: false, fieldErrors: { newPassword: expect.any(String) } });
  });

  it("holds new passwords to the sign-up rules", () => {
    expect(
      parsePasswordChangeForm(data({ ...valid, newPassword: "short", confirmPassword: "short" })),
    ).toMatchObject({ ok: false, fieldErrors: { newPassword: expect.any(String) } });
    const long = "x".repeat(73);
    expect(
      parsePasswordChangeForm(data({ ...valid, newPassword: long, confirmPassword: long })).ok,
    ).toBe(false);
  });

  it("wants the current password", () => {
    expect(
      parsePasswordChangeForm(data({ ...valid, currentPassword: "" })),
    ).toMatchObject({ ok: false, fieldErrors: { currentPassword: expect.any(String) } });
  });
});

describe("parsePasswordResetForm", () => {
  it("needs no current password", () => {
    expect(
      parsePasswordResetForm(data({ newPassword: "fresh-password", confirmPassword: "fresh-password" })),
    ).toEqual({ ok: true, data: { newPassword: "fresh-password" } });
  });

  it("still checks the confirmation", () => {
    expect(
      parsePasswordResetForm(data({ newPassword: "fresh-password", confirmPassword: "fresh-passwork" })).ok,
    ).toBe(false);
  });
});

describe("parseForgotPasswordForm", () => {
  it("normalises the address", () => {
    expect(parseForgotPasswordForm(data({ email: " Me@Example.com" }))).toEqual({
      ok: true,
      data: { email: "me@example.com" },
    });
  });

  it("refuses something that is not an address", () => {
    expect(parseForgotPasswordForm(data({ email: "me" })).ok).toBe(false);
  });
});

describe("parseDeleteAccountForm", () => {
  it("wants the account's own email typed out, case aside", () => {
    expect(
      parseDeleteAccountForm(
        data({ confirmEmail: " Me@Example.com ", currentPassword: "pw" }),
        "me@example.com",
      ),
    ).toEqual({ ok: true, data: { currentPassword: "pw" } });
  });

  it("refuses any other address", () => {
    expect(
      parseDeleteAccountForm(
        data({ confirmEmail: "you@example.com", currentPassword: "pw" }),
        "me@example.com",
      ),
    ).toMatchObject({ ok: false, fieldErrors: { confirmEmail: expect.stringContaining("me@example.com") } });
  });

  it("wants the current password", () => {
    expect(
      parseDeleteAccountForm(data({ confirmEmail: "me@example.com" }), "me@example.com"),
    ).toMatchObject({ ok: false, fieldErrors: { currentPassword: expect.any(String) } });
  });
});
