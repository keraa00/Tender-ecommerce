import { describe, expect, it } from "vitest";

import {
  confirmationErrorCode,
  parseConfirmationRequest,
} from "@/lib/auth/confirmation";

const parse = (query: string) =>
  parseConfirmationRequest(new URLSearchParams(query));

describe("parseConfirmationRequest", () => {
  it("reads the token_hash shape emitted by a {{ .TokenHash }} template", () => {
    expect(parse("token_hash=abc123&type=signup&next=%2Fdashboard")).toEqual({
      kind: "token-hash",
      tokenHash: "abc123",
      type: "signup",
      next: "/dashboard",
    });
  });

  it("reads the PKCE code shape the stock template bounces back", () => {
    // The regression: this used to be reported as a malformed link, because
    // /auth/confirm only ever looked for token_hash.
    expect(parse("code=pkce-code&next=%2Fdashboard")).toEqual({
      kind: "code",
      code: "pkce-code",
      next: "/dashboard",
    });
  });

  it("prefers token_hash when a link somehow carries both", () => {
    expect(parse("token_hash=abc&type=email&code=xyz")).toMatchObject({
      kind: "token-hash",
    });
  });

  it("is invalid when neither shape is present", () => {
    expect(parse("")).toEqual({ kind: "invalid" });
    expect(parse("next=%2Fdashboard")).toEqual({ kind: "invalid" });
  });

  it("rejects a token_hash carrying an unknown type rather than passing it on", () => {
    expect(parse("token_hash=abc&type=not-a-real-type")).toEqual({
      kind: "invalid",
    });
    expect(parse("token_hash=abc")).toEqual({ kind: "invalid" });
  });

  it("accepts the reset and email-change links the account pages send", () => {
    expect(
      parse("token_hash=abc&type=recovery&next=%2Freset-password"),
    ).toEqual({
      kind: "token-hash",
      tokenHash: "abc",
      type: "recovery",
      next: "/reset-password",
    });
    expect(parse("token_hash=abc&type=email_change")).toMatchObject({
      kind: "token-hash",
      type: "email_change",
    });
  });

  it("refuses link types the app never sends", () => {
    // Each would be one more way to plant a session (TND-12).
    expect(parse("token_hash=abc&type=magiclink")).toEqual({ kind: "invalid" });
    expect(parse("token_hash=abc&type=invite")).toEqual({ kind: "invalid" });
  });

  it("falls back to /dashboard for an off-origin next", () => {
    expect(parse("code=abc&next=%2F%2Fevil.com")).toMatchObject({
      next: "/dashboard",
    });
    expect(parse("code=abc&next=https%3A%2F%2Fevil.com")).toMatchObject({
      next: "/dashboard",
    });
  });

  it("keeps a same-origin next", () => {
    expect(parse("code=abc&next=%2Fdashboard%2Facme")).toMatchObject({
      next: "/dashboard/acme",
    });
  });
});

describe("confirmationErrorCode", () => {
  it("separates a link opened in another browser from an expired one", () => {
    expect(confirmationErrorCode({ code: "pkce_code_verifier_not_found" })).toBe(
      "confirmation-link-other-browser",
    );
  });

  it("treats anything else as expired", () => {
    expect(confirmationErrorCode({ code: "otp_expired" })).toBe(
      "confirmation-link-expired",
    );
    expect(confirmationErrorCode({})).toBe("confirmation-link-expired");
  });
});
