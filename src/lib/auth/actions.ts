"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as z from "zod";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

/**
 * Only ever redirect to a path on this origin. An open redirect here would let
 * a phishing link bounce a freshly authenticated user to an attacker's page.
 */
function safeRedirectPath(raw: FormDataEntryValue | null): string | null {
  const value = typeof raw === "string" ? raw : "";
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

const NOT_CONFIGURED =
  "Authentication isn't configured yet. Add your Supabase keys to .env — " +
  "see README → Local setup.";

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
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { name: parsed.data.name },
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
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

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Deliberately not distinguishing "no such account" from "wrong password":
    // that difference is a user-enumeration oracle.
    return { values, formError: "That email and password don't match." };
  }

  revalidatePath("/", "layout");
  redirect(safeRedirectPath(formData.get("next")) ?? "/dashboard");
}

export async function signOutAction() {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  revalidatePath("/", "layout");
  redirect("/");
}
