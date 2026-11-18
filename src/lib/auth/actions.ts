"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as z from "zod";

import { authErrorMessage, isExpectedAuthError } from "@/lib/account/errors";
import {
  parseForgotPasswordForm,
  parsePasswordResetForm,
  type AccountFormState,
  type ForgotPasswordField,
  type NewPasswordField,
} from "@/lib/account/form";
import { platformHomeUrl } from "@/lib/admin/links";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "./redirect";
import { getAuthUser, hasFreshRecoverySession } from "./session";
import { emailSchema, nameSchema, passwordSchema } from "./schemas";
import { confirmRedirectUrl } from "./urls";

export type AuthState = {
  formError?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "name", string>>;
  notice?: string;
  values?: { email: string; name?: string };
};

const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

const NOT_CONFIGURED =
  "Authentication isn't configured yet. Add your Supabase keys to .env — " +
  "see docs/setup.md.";

export async function signUpAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isSupabaseConfigured()) return { formError: NOT_CONFIGURED };

  const values = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
  };

  const parsed = signUpSchema.safeParse({
    name: values.name,
    email: values.email,
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      values,
      fieldErrors: {
        name: fieldErrors.name?.[0],
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
      },
    };
  }

  const next = safeRedirectPath(formData.get("next")) ?? "/dashboard";

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { name: parsed.data.name },
      emailRedirectTo: confirmRedirectUrl(next),
    },
  });

  // An address that already has an account gets the same answer as a new
  // one — which is what Supabase itself does while email confirmation is on.
  // Saying "already registered" would tell anyone which emails sign in here.
  const alreadyRegistered =
    error?.code === "user_already_exists" || error?.code === "email_exists";

  if (error && !alreadyRegistered) {
    if (!isExpectedAuthError(error)) console.error("signUpAction failed", error);
    return {
      values,
      formError: authErrorMessage(error, "We couldn't create your account. Please try again."),
    };
  }

  // With email confirmation enabled (Supabase's default) there is no session
  // yet — the user has to click the link first.
  if (alreadyRegistered || !data.session) {
    return {
      values,
      notice:
        `Check ${parsed.data.email} for a confirmation link to finish setting ` +
        "up your account.",
    };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signInAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isSupabaseConfigured()) return { formError: NOT_CONFIGURED };

  const values = { email: String(formData.get("email") ?? "") };

  const parsed = signInSchema.safeParse({
    email: values.email,
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return {
      values,
      fieldErrors: {
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
      },
    };
  }

  const next = safeRedirectPath(formData.get("next")) ?? "/dashboard";

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  // Supabase checks the password before whether the email is confirmed, so
  // this only ever reaches someone who already knows both — it says nothing
  // about which addresses have accounts. They are the person a fresh link is
  // for: the old one expired, or opened in another browser.
  if (error?.code === "email_not_confirmed") {
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: parsed.data.email,
      options: { emailRedirectTo: confirmRedirectUrl(next) },
    });
    if (resendError) console.warn("Could not resend the confirmation email", resendError);

    return {
      values,
      notice: resendError
        ? `Confirm your email first. Check ${parsed.data.email} for the link we sent, ` +
          "or try again in a minute for a new one."
        : `Confirm your email first. We've sent a new link to ${parsed.data.email}.`,
    };
  }

  if (error) {
    // Deliberately not distinguishing "no such account" from "wrong password":
    // that difference is a user-enumeration oracle.
    return { values, formError: "That email and password don't match." };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export type ForgotPasswordState = AccountFormState<ForgotPasswordField> & {
  values?: { email: string };
};

/**
 * Emails a password-reset link. The answer is the same whether or not the
 * address has an account — anything else would tell a stranger who signs in
 * here. The link lands on `/auth/confirm`, which signs the user in and sends
 * them on to `/reset-password`.
 */
export async function requestPasswordResetAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  if (!isSupabaseConfigured()) return { formError: NOT_CONFIGURED };

  const values = { email: String(formData.get("email") ?? "") };
  const parsed = parseForgotPasswordForm(formData);
  if (!parsed.ok) return { values, fieldErrors: parsed.fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: confirmRedirectUrl("/reset-password"),
  });

  // Every outcome gets the notice below. Supabase also throttles repeat
  // requests per address, and only for addresses that have an account — so
  // answering a 429 differently would tell a stranger which ones do.
  if (error && !isExpectedAuthError(error)) {
    console.error("requestPasswordResetAction failed", error);
  }

  return {
    notice:
      `If there's an account for ${parsed.data.email}, we've sent it a link to ` +
      "choose a new password. Open it on any device — it signs you in for 15 " +
      "minutes to set one. Nothing after a few minutes? Check your spam " +
      "folder, or try again later.",
  };
}

export type ResetPasswordState = AccountFormState<NewPasswordField>;

/**
 * Sets a new password from a fresh recovery session, without the old one —
 * the only place that is allowed (`hasFreshRecoverySession`).
 */
export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  if (!(await getAuthUser()) || !(await hasFreshRecoverySession())) {
    redirect("/forgot-password?error=reset-link-expired");
  }

  const parsed = parsePasswordResetForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) {
    if (!isExpectedAuthError(error)) console.error("resetPasswordAction failed", error);
    return error.code === "weak_password" || error.code === "same_password"
      ? { fieldErrors: { newPassword: authErrorMessage(error) } }
      : { formError: authErrorMessage(error, "Could not set your password. Please try again.") };
  }

  // Whoever the reset was a reaction to may still be signed in elsewhere.
  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) console.error("resetPasswordAction: signOut others failed", signOutError);

  revalidatePath("/", "layout");
  redirect("/dashboard/account/security?password=reset");
}

export async function signOutAction() {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  revalidatePath("/", "layout");
  // Absolute: this action also runs from the seller admin's own host, where
  // "/" is that store's admin and would just bounce back to the login form.
  redirect(platformHomeUrl());
}
