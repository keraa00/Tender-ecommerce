import * as z from "zod";

/**
 * Field rules shared by sign-up, sign-in and account settings. They live here
 * rather than in `./actions.ts` because a `"use server"` module may only export
 * async functions.
 */

export const emailSchema = z.email("Enter a valid email address.");

/**
 * Supabase's own floor is 6 characters; 8 is ours. 72 is bcrypt's limit —
 * anything past it would be silently ignored when the password is checked.
 */
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Passwords are limited to 72 characters.");

export const NAME_MAX_LENGTH = 80;

export const nameSchema = z
  .string()
  .trim()
  .min(1, "Tell us your name.")
  .max(NAME_MAX_LENGTH, `Keep it to ${NAME_MAX_LENGTH} characters.`);
