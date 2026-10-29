"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as z from "zod";

import { platformHomeUrl } from "@/lib/admin/links";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "./redirect";

export type AuthState = {
  formError?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "name", string>>;
  notice?: string;
  values?: { email: string; name?: string };
};

const emailSchema = z.email("Enter a valid email address.");
const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Passwords are limited to 72 characters.");

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(80),
  email: emailSchema,
  password: passwordSchema,
});

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

const NOT_CONFIGURED =
  "Authentication isn't configured yet. Add your Supabase keys to .env — " +
  "see README → Local setup.";

/**
 * Where a confirmation link sends the user: `/auth/confirm`, carrying the path
 * they were headed for so confirming lands them there.
 */
function confirmRedirectUrl(next: string): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;
}

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

  if (error) return { values, formError: error.message };

  // With email confirmation enabled (Supabase's default) there is no session
  // yet — the user has to click the link first.
  if (!data.session) {
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
