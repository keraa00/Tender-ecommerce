"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";

import {
  accountDeletionBlockers,
  describeAccountDeletionBlocker,
} from "@/lib/account/deletion";
import { authErrorMessage, isExpectedAuthError } from "@/lib/account/errors";
import {
  parseDeleteAccountForm,
  parseEmailChangeForm,
  parsePasswordChangeForm,
  parseProfileForm,
  type AccountFormState,
  type DeleteAccountField,
  type EmailChangeField,
  type PasswordChangeField,
  type ProfileField,
} from "@/lib/account/form";
import { listOwnedStores } from "@/lib/account/queries";
import { revokeSession } from "@/lib/account/sessions";
import { accountPath } from "@/lib/admin/nav";
import { verifyPassword, type PasswordCheck } from "@/lib/auth/password";
import { requireUser } from "@/lib/auth/session";
import { confirmRedirectUrl } from "@/lib/auth/urls";
import { rootDb } from "@/lib/db/root";
import { Prisma } from "@/lib/db/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProfileState = AccountFormState<ProfileField>;
export type EmailChangeState = AccountFormState<EmailChangeField> & {
  values?: { email: string };
};
export type PasswordChangeState = AccountFormState<PasswordChangeField>;
export type SessionsState = { notice?: string; formError?: string };
export type DeleteAccountState = AccountFormState<DeleteAccountField>;

const WRONG_PASSWORD = "That isn't your current password.";
const RATE_LIMITED = "Too many attempts. Wait a minute and try again.";

/** The outcome of `verifyPassword` as a field error, or null when it passed. */
function passwordCheckError(
  check: PasswordCheck,
): { fieldErrors: { currentPassword: string } } | { formError: string } | null {
  if (check === "ok") return null;
  if (check === "rate-limited") return { formError: RATE_LIMITED };
  return { fieldErrors: { currentPassword: WRONG_PASSWORD } };
}

function logUnexpected(where: string, error: { code?: string; status?: number }) {
  if (!isExpectedAuthError(error)) console.error(`${where} failed`, error);
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function updateProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await requireUser(accountPath());

  const parsed = parseProfileForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ data: { name: parsed.data.name } });
  if (error) {
    logUnexpected("updateProfileAction", error);
    return { formError: authErrorMessage(error, "Could not save your name. Please try again.") };
  }

  // `mirrorAuthUser` would catch up on the next read anyway; writing it now
  // means the header on the page this action re-renders already has it.
  await rootDb.user.update({ where: { id: user.id }, data: { name: parsed.data.name } });

  revalidatePath("/", "layout");
  return { notice: "Saved." };
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

/**
 * Starts an email change. Nothing changes until the emailed link is clicked —
 * with Supabase's "Secure email change" on, a link to each address, so a
 * session left open somewhere cannot move the account to an inbox its owner
 * has never seen. Until then the old address keeps working and the profile
 * page shows the pending one from `new_email`.
 */
export async function changeEmailAction(
  _prev: EmailChangeState,
  formData: FormData,
): Promise<EmailChangeState> {
  const user = await requireUser(accountPath());

  const parsed = parseEmailChangeForm(formData, user.email);
  const values = { email: String(formData.get("email") ?? "") };
  if (!parsed.ok) return { values, fieldErrors: parsed.fieldErrors };

  const failed = passwordCheckError(await verifyPassword(user.email, parsed.data.currentPassword));
  if (failed) return { values, ...failed };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data.email },
    { emailRedirectTo: confirmRedirectUrl(`${accountPath()}?email=confirmed`) },
  );
  if (error) {
    logUnexpected("changeEmailAction", error);
    return {
      values,
      ...(error.code === "email_exists" || error.code === "email_address_invalid"
        ? { fieldErrors: { email: authErrorMessage(error) } }
        : { formError: authErrorMessage(error, "Could not start the change. Please try again.") }),
    };
  }

  revalidatePath(accountPath());
  return {
    notice:
      `We've emailed a confirmation link to ${parsed.data.email}, and one to ` +
      `${user.email} too. Your address changes once the change is confirmed — ` +
      `until then, keep signing in with ${user.email}.`,
  };
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

export async function changePasswordAction(
  _prev: PasswordChangeState,
  formData: FormData,
): Promise<PasswordChangeState> {
  const user = await requireUser(accountPath("security"));

  const parsed = parsePasswordChangeForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const failed = passwordCheckError(await verifyPassword(user.email, parsed.data.currentPassword));
  if (failed) return failed;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) {
    logUnexpected("changePasswordAction", error);
    return error.code === "weak_password" || error.code === "same_password"
      ? { fieldErrors: { newPassword: authErrorMessage(error) } }
      : { formError: authErrorMessage(error, "Could not change your password. Please try again.") };
  }

  // A new password is usually a reaction to the old one being known. Whoever
  // knew it may already be signed in somewhere; this device stays signed in.
  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) console.error("changePasswordAction: signOut others failed", signOutError);

  revalidatePath(accountPath("security"));
  return {
    notice: signOutError
      ? "Password updated."
      : "Password updated. Every other device has been signed out.",
  };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function signOutOtherSessionsAction(
  _prev: SessionsState,
  _formData: FormData,
): Promise<SessionsState> {
  await requireUser(accountPath("security"));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) {
    console.error("signOutOtherSessionsAction failed", error);
    return { formError: "Could not sign out your other devices. Please try again." };
  }

  revalidatePath(accountPath("security"));
  return { notice: "Every other device has been signed out." };
}

const sessionIdSchema = z.uuid();

/** Ends one other session. Bound to the session's id by the sessions list. */
export async function revokeSessionAction(sessionId: string): Promise<void> {
  const user = await requireUser(accountPath("security"));

  const id = sessionIdSchema.safeParse(sessionId);
  if (id.success) {
    try {
      await revokeSession(user.id, id.data);
    } catch (error) {
      console.error("revokeSessionAction failed", error);
    }
  }

  revalidatePath(accountPath("security"));
}

// ---------------------------------------------------------------------------
// Delete account
// ---------------------------------------------------------------------------

/**
 * Deletes the signed-in account for good.
 *
 * The app's `users` row goes first, then the Supabase Auth user. In the other
 * order a failure halfway would strand a `users` row holding the unique email,
 * and `mirrorAuthUser` could never create one for whoever signs up with that
 * address next. This way round a failure leaves an Auth user with no row, which
 * the next `getCurrentUser()` simply re-mirrors — so trying again just works.
 *
 * Deleting the row cascades to store memberships and theme previews, and
 * unlinks orders, carts and discount redemptions (`SET NULL`): those are the
 * sellers' records of a sale, and keep their own copy of the email and address.
 */
export async function deleteAccountAction(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const user = await requireUser(accountPath("privacy"));

  const parsed = parseDeleteAccountForm(formData, user.email);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const blockers = accountDeletionBlockers({
    ownedStores: await listOwnedStores(user.id),
    platformRole: user.platformRole,
  });
  if (blockers.length > 0) {
    return { formError: describeAccountDeletionBlocker(blockers[0]) };
  }

  const failed = passwordCheckError(await verifyPassword(user.email, parsed.data.currentPassword));
  if (failed) return failed;

  try {
    await rootDb.user.delete({ where: { id: user.id } });
  } catch (error) {
    // A store created in another tab since the check above: the RESTRICT
    // foreign key is the backstop.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return { formError: "You own a store again. Delete it from its Settings first." };
    }
    console.error("deleteAccountAction: deleting the users row failed", error);
    return { formError: "Could not delete your account. Please try again." };
  }

  // A hard delete: Supabase removes the user's sessions and refresh tokens
  // with it, so no other device can carry on signed in.
  const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(user.id);
  if (error) {
    console.error("deleteAccountAction: deleting the Auth user failed", error);
    return { formError: "We couldn't finish deleting your account. Please try again." };
  }

  // The session is already gone server-side; this only clears its cookies.
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);

  revalidatePath("/", "layout");
  redirect("/account-deleted");
}
