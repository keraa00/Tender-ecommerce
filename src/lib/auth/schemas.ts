import * as z from "zod";

/**
 * Field rules shared by sign-up, sign-in and account settings. They live here
 * rather than in `./actions.ts` because a `"use server"` module may only export
 * async functions.
 */

/**
 * The rules' refusals. English by default — sign-up and sign-in are not
 * translated — and in the seller's language when account settings pass
 * theirs (`t.account.errors`).
 */
export type FieldRuleMessages = {
  email: string;
  passwordMin: string;
  passwordMax: string;
  nameRequired: string;
  nameMax: string;
};

const ENGLISH: FieldRuleMessages = {
  email: "Enter a valid email address.",
  passwordMin: "Use at least 8 characters.",
  passwordMax: "Passwords are limited to 72 characters.",
  nameRequired: "Tell us your name.",
  nameMax: "Keep it to {max} characters.",
};

export const NAME_MAX_LENGTH = 80;

/**
 * Supabase's own floor is 6 characters; 8 is ours. 72 is bcrypt's limit —
 * anything past it would be silently ignored when the password is checked.
 */
export function fieldSchemas(t: FieldRuleMessages = ENGLISH) {
  return {
    email: z.email(t.email),
    password: z.string().min(8, t.passwordMin).max(72, t.passwordMax),
    name: z
      .string()
      .trim()
      .min(1, t.nameRequired)
      .max(NAME_MAX_LENGTH, t.nameMax.replace("{max}", String(NAME_MAX_LENGTH))),
  };
}

const english = fieldSchemas();

export const emailSchema = english.email;
export const passwordSchema = english.password;
export const nameSchema = english.name;
