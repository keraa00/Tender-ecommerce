import * as z from "zod";

import { fieldSchemas } from "@/lib/auth/schemas";
import { format } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";

/**
 * The account forms' refusals in the seller's language: `t.account.errors`.
 * Optional, and English when left out — the sign-in and password-reset pages
 * share these parsers and are not translated.
 */
export type AccountErrors = AdminMessages["account"]["errors"];

const ENGLISH = {
  checkField: "Check this field.",
  sameEmail: "That's already your email address.",
  passwordRequired: "Enter your current password.",
  passwordsDiffer: "The two passwords don't match.",
  samePassword: "Your new password has to be different from the current one.",
  confirmEmail: "Type {email} to confirm.",
} satisfies Partial<AccountErrors>;

function copy(t: AccountErrors | undefined) {
  return t ?? ENGLISH;
}

/**
 * The account settings forms, parsed. Kept apart from the Server Actions — no
 * Supabase, no database — so the rules can be unit-tested on a plain
 * `FormData`, like `src/lib/stores/settings-form.ts`.
 */

export type FieldErrors<F extends string> = Partial<Record<F, string>>;

export type Parsed<T, F extends string> =
  | { ok: true; data: T }
  | { ok: false; fieldErrors: FieldErrors<F> };

/** What every account form's Server Action hands back to `useActionState`. */
export type AccountFormState<F extends string> = {
  formError?: string;
  fieldErrors?: FieldErrors<F>;
  notice?: string;
};

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Passwords are taken exactly as typed — a trailing space is a character. */
function requiredPassword(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

function firstIssue(
  result: { success: false; error: z.ZodError },
  t?: AccountErrors,
): string {
  return result.error.issues[0]?.message ?? copy(t).checkField;
}

function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export type ProfileField = "name";

export function parseProfileForm(
  formData: FormData,
  t?: AccountErrors,
): Parsed<{ name: string }, ProfileField> {
  const result = fieldSchemas(t).name.safeParse(text(formData, "name"));
  if (!result.success) {
    return { ok: false, fieldErrors: { name: firstIssue(result, t) } };
  }
  return { ok: true, data: { name: result.data } };
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export type EmailChangeField = "email" | "currentPassword";

export function parseEmailChangeForm(
  formData: FormData,
  currentEmail: string,
  t?: AccountErrors,
): Parsed<{ email: string; currentPassword: string }, EmailChangeField> {
  const fieldErrors: FieldErrors<EmailChangeField> = {};

  const email = text(formData, "email").trim().toLowerCase();
  const emailResult = fieldSchemas(t).email.safeParse(email);
  if (!emailResult.success) {
    fieldErrors.email = firstIssue(emailResult, t);
  } else if (sameEmail(email, currentEmail)) {
    fieldErrors.email = copy(t).sameEmail;
  }

  const currentPassword = requiredPassword(formData, "currentPassword");
  if (!currentPassword) {
    fieldErrors.currentPassword = copy(t).passwordRequired;
  }

  if (fieldErrors.email || fieldErrors.currentPassword || !currentPassword) {
    return { ok: false, fieldErrors };
  }
  return { ok: true, data: { email, currentPassword } };
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

export type NewPasswordField = "newPassword" | "confirmPassword";

/** A new password and its confirmation — shared by change and reset. */
function parseNewPassword(
  formData: FormData,
  t?: AccountErrors,
): { password: string | null; fieldErrors: FieldErrors<NewPasswordField> } {
  const fieldErrors: FieldErrors<NewPasswordField> = {};
  const newPassword = text(formData, "newPassword");
  const confirmPassword = text(formData, "confirmPassword");

  const result = fieldSchemas(t).password.safeParse(newPassword);
  if (!result.success) {
    fieldErrors.newPassword = firstIssue(result, t);
  } else if (confirmPassword !== newPassword) {
    fieldErrors.confirmPassword = copy(t).passwordsDiffer;
  }

  return {
    password: fieldErrors.newPassword || fieldErrors.confirmPassword ? null : newPassword,
    fieldErrors,
  };
}

export type PasswordChangeField = "currentPassword" | NewPasswordField;

export function parsePasswordChangeForm(
  formData: FormData,
  t?: AccountErrors,
): Parsed<{ currentPassword: string; newPassword: string }, PasswordChangeField> {
  const { password, fieldErrors: newErrors } = parseNewPassword(formData, t);
  const fieldErrors: FieldErrors<PasswordChangeField> = { ...newErrors };

  const currentPassword = requiredPassword(formData, "currentPassword");
  if (!currentPassword) {
    fieldErrors.currentPassword = copy(t).passwordRequired;
  } else if (password !== null && password === currentPassword) {
    fieldErrors.newPassword = copy(t).samePassword;
  }

  if (!currentPassword || password === null || fieldErrors.newPassword) {
    return { ok: false, fieldErrors };
  }
  return { ok: true, data: { currentPassword, newPassword: password } };
}

/** Setting a password from a recovery link: there is no current one to give. */
export function parsePasswordResetForm(
  formData: FormData,
): Parsed<{ newPassword: string }, NewPasswordField> {
  const { password, fieldErrors } = parseNewPassword(formData);
  if (password === null) return { ok: false, fieldErrors };
  return { ok: true, data: { newPassword: password } };
}

// ---------------------------------------------------------------------------
// Forgot password
// ---------------------------------------------------------------------------

export type ForgotPasswordField = "email";

export function parseForgotPasswordForm(
  formData: FormData,
): Parsed<{ email: string }, ForgotPasswordField> {
  const email = text(formData, "email").trim().toLowerCase();
  const result = fieldSchemas().email.safeParse(email);
  if (!result.success) {
    return { ok: false, fieldErrors: { email: firstIssue(result) } };
  }
  return { ok: true, data: { email } };
}

// ---------------------------------------------------------------------------
// Delete account
// ---------------------------------------------------------------------------

export type DeleteAccountField = "confirmEmail" | "currentPassword";

/**
 * Typing the address out is the "are you sure": it cannot be done by a
 * misclick, and it names exactly which account is about to go.
 */
export function parseDeleteAccountForm(
  formData: FormData,
  accountEmail: string,
  t?: AccountErrors,
): Parsed<{ currentPassword: string }, DeleteAccountField> {
  const fieldErrors: FieldErrors<DeleteAccountField> = {};

  if (!sameEmail(text(formData, "confirmEmail"), accountEmail)) {
    fieldErrors.confirmEmail = format(copy(t).confirmEmail, { email: accountEmail });
  }

  const currentPassword = requiredPassword(formData, "currentPassword");
  if (!currentPassword) {
    fieldErrors.currentPassword = copy(t).passwordRequired;
  }

  if (fieldErrors.confirmEmail || !currentPassword) {
    return { ok: false, fieldErrors };
  }
  return { ok: true, data: { currentPassword } };
}
