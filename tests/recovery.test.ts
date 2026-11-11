import { describe, expect, it } from "vitest";

import { isFreshRecovery, RECOVERY_WINDOW_SECONDS } from "@/lib/auth/recovery";

// Shapes as observed on the hosted project: a recovery link records an `otp`
// entry stamped when it was redeemed; `recovery_sent_at` carries microseconds.
const SENT_AT = "2026-11-11T12:49:56.890954Z";
const SENT = Math.floor(Date.parse(SENT_AT) / 1000);
const REDEEMED = SENT + 40;

describe("isFreshRecovery", () => {
  it("accepts a reset link redeemed after the email went out, within the window", () => {
    expect(
      isFreshRecovery({
        amr: [{ method: "otp", timestamp: REDEEMED }],
        recoverySentAt: SENT_AT,
        now: REDEEMED + 60,
      }),
    ).toBe(true);
  });

  it("accepts the same second the email was sent — the timestamps round differently", () => {
    expect(
      isFreshRecovery({
        amr: [{ method: "otp", timestamp: SENT }],
        recoverySentAt: SENT_AT,
        now: SENT + 5,
      }),
    ).toBe(true);
  });

  it("refuses an ordinary password session, even right after a reset email", () => {
    expect(
      isFreshRecovery({
        amr: [{ method: "password", timestamp: REDEEMED }],
        recoverySentAt: SENT_AT,
        now: REDEEMED + 1,
      }),
    ).toBe(false);
  });

  it("refuses once the window has passed", () => {
    expect(
      isFreshRecovery({
        amr: [{ method: "otp", timestamp: REDEEMED }],
        recoverySentAt: SENT_AT,
        now: REDEEMED + RECOVERY_WINDOW_SECONDS + 1,
      }),
    ).toBe(false);
  });

  it("refuses an older OTP session when a newer reset email was sent", () => {
    // Signed in by an emailed link yesterday; asked for a reset today.
    expect(
      isFreshRecovery({
        amr: [{ method: "otp", timestamp: SENT - 3600 }],
        recoverySentAt: SENT_AT,
        now: SENT + 30,
      }),
    ).toBe(false);
  });

  it("refuses when no reset was ever asked for", () => {
    expect(
      isFreshRecovery({
        amr: [{ method: "otp", timestamp: REDEEMED }],
        recoverySentAt: undefined,
        now: REDEEMED + 1,
      }),
    ).toBe(false);
    expect(isFreshRecovery({ amr: undefined, recoverySentAt: SENT_AT, now: REDEEMED })).toBe(false);
  });

  it("ignores the RFC 8176 string form, which carries no timestamp", () => {
    expect(isFreshRecovery({ amr: ["otp"], recoverySentAt: SENT_AT, now: REDEEMED })).toBe(false);
  });
});
