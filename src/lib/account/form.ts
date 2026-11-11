import * as z from "zod";

import { emailSchema, nameSchema, passwordSchema } from "@/lib/auth/schemas";

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

function firstIssue(result: { success: false; error: z.ZodError }): string {
  return result.error.issues[0]?.message ?? "Check this field.";
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
): Parsed<{ name: string }, ProfileField> {
  const result = nameSchema.safeParse(text(formData, "name"));
  if (!result.success) {
    return { ok: false, fieldErrors: { name: firstIssue(result) } };
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
): Parsed<{ email: string; currentPassword: string }, EmailChangeField> {
  const fieldErrors: FieldErrors<EmailChangeField> = {};

  const email = text(formData, "email").trim().toLowerCase();
  const emailResult = emailSchema.safeParse(email);
  if (!emailResult.success) {
    fieldErrors.email = firstIssue(emailResult);
  } else if (sameEmail(email, currentEmail)) {
    fieldErrors.email = "That's already your email address.";
  }

  const currentPassword = requiredPassword(formData, "currentPassword");
  if (!currentPassword) {
    fieldErrors.currentPassword = "Enter your current password.";
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
): { password: string | null; fieldErrors: FieldErrors<NewPasswordField> } {
  const fieldErrors: FieldErrors<NewPasswordField> = {};
  const newPassword = text(formData, "newPassword");
  const confirmPassword = text(formData, "confirmPassword");

  const result = passwordSchema.safeParse(newPassword);
  if (!result.success) {
    fieldErrors.newPassword = firstIssue(result);
  } else if (confirmPassword !== newPassword) {
    fieldErrors.confirmPassword = "The two passwords don't match.";
  }

  return {
    password: fieldErrors.newPassword || fieldErrors.confirmPassword ? null : newPassword,
    fieldErrors,
  };
}

export type PasswordChangeField = "currentPassword" | NewPasswordField;

export function parsePasswordChangeForm(
  formData: FormData,
): Parsed<{ currentPassword: string; newPassword: string }, PasswordChangeField> {
  const { password, fieldErrors: newErrors } = parseNewPassword(formData);
  const fieldErrors: FieldErrors<PasswordChangeField> = { ...newErrors };

  const currentPassword = requiredPassword(formData, "currentPassword");
  if (!currentPassword) {
    fieldErrors.currentPassword = "Enter your current password.";
  } else if (password !== null && password === currentPassword) {
    fieldErrors.newPassword = "Your new password has to be different from the current one.";
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
  const result = emailSchema.safeParse(email);
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
): Parsed<{ currentPassword: string }, DeleteAccountField> {
  const fieldErrors: FieldErrors<DeleteAccountField> = {};

  if (!sameEmail(text(formData, "confirmEmail"), accountEmail)) {
    fieldErrors.confirmEmail = `Type ${accountEmail} to confirm.`;
  }

  const currentPassword = requiredPassword(formData, "currentPassword");
  if (!currentPassword) {
    fieldErrors.currentPassword = "Enter your current password.";
  }

  if (fieldErrors.confirmEmail || !currentPassword) {
    return { ok: false, fieldErrors };
  }
  return { ok: true, data: { currentPassword } };
}
