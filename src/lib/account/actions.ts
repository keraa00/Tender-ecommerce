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
import { format } from "@/lib/i18n/format";
import type { AdminMessages } from "@/lib/i18n/admin";
import { getAdminI18n } from "@/lib/i18n/server";
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

/** The outcome of `verifyPassword` as a field error, or null when it passed. */
function passwordCheckError(
  check: PasswordCheck,
  t: AdminMessages["account"]["errors"],
): { fieldErrors: { currentPassword: string } } | { formError: string } | null {
  if (check === "ok") return null;
  if (check === "rate-limited") return { formError: t.rateLimited };
  return { fieldErrors: { currentPassword: t.wrongPassword } };
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
  const [user, { t: messages }] = await Promise.all([requireUser(accountPath()), getAdminI18n()]);
  const t = messages.account;

  const parsed = parseProfileForm(formData, t.errors);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ data: { name: parsed.data.name } });
  if (error) {
    logUnexpected("updateProfileAction", error);
    return { formError: authErrorMessage(error, t.errors.nameFailed, t.authErrors) };
  }

  // `mirrorAuthUser` would catch up on the next read anyway; writing it now
  // means the header on the page this action re-renders already has it.
  await rootDb.user.update({ where: { id: user.id }, data: { name: parsed.data.name } });

  revalidatePath("/", "layout");
  return { notice: t.notices.saved };
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
  const [user, { t: messages }] = await Promise.all([requireUser(accountPath()), getAdminI18n()]);
  const t = messages.account;

  const parsed = parseEmailChangeForm(formData, user.email, t.errors);
  const values = { email: String(formData.get("email") ?? "") };
  if (!parsed.ok) return { values, fieldErrors: parsed.fieldErrors };

  const failed = passwordCheckError(
    await verifyPassword(user.email, parsed.data.currentPassword),
    t.errors,
  );
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
        ? { fieldErrors: { email: authErrorMessage(error, t.errors.generic, t.authErrors) } }
        : { formError: authErrorMessage(error, t.errors.emailFailed, t.authErrors) }),
    };
  }

  revalidatePath(accountPath());
  return {
    notice: format(t.notices.emailSent, { email: parsed.data.email, current: user.email }),
  };
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

export async function changePasswordAction(
  _prev: PasswordChangeState,
  formData: FormData,
): Promise<PasswordChangeState> {
  const [user, { t: messages }] = await Promise.all([
    requireUser(accountPath("security")),
    getAdminI18n(),
  ]);
  const t = messages.account;

  const parsed = parsePasswordChangeForm(formData, t.errors);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const failed = passwordCheckError(
    await verifyPassword(user.email, parsed.data.currentPassword),
    t.errors,
  );
  if (failed) return failed;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) {
    logUnexpected("changePasswordAction", error);
    return error.code === "weak_password" || error.code === "same_password"
      ? { fieldErrors: { newPassword: authErrorMessage(error, t.errors.generic, t.authErrors) } }
      : { formError: authErrorMessage(error, t.errors.passwordFailed, t.authErrors) };
  }

  // A new password is usually a reaction to the old one being known. Whoever
  // knew it may already be signed in somewhere; this device stays signed in.
  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) console.error("changePasswordAction: signOut others failed", signOutError);

  revalidatePath(accountPath("security"));
  return {
    notice: signOutError ? t.notices.passwordUpdated : t.notices.passwordUpdatedSignedOut,
  };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function signOutOtherSessionsAction(
  _prev: SessionsState,
  _formData: FormData,
): Promise<SessionsState> {
  const [, { t }] = await Promise.all([requireUser(accountPath("security")), getAdminI18n()]);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) {
    console.error("signOutOtherSessionsAction failed", error);
    return { formError: t.account.errors.signOutFailed };
  }

  revalidatePath(accountPath("security"));
  return { notice: t.account.notices.signedOutOthers };
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
  const [user, { t: messages }] = await Promise.all([
    requireUser(accountPath("privacy")),
    getAdminI18n(),
  ]);
  const t = messages.account;

  const parsed = parseDeleteAccountForm(formData, user.email, t.errors);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const blockers = accountDeletionBlockers({
    ownedStores: await listOwnedStores(user.id),
    platformRole: user.platformRole,
  });
  if (blockers.length > 0) {
    return { formError: describeAccountDeletionBlocker(blockers[0], t.privacy) };
  }

  const failed = passwordCheckError(
    await verifyPassword(user.email, parsed.data.currentPassword),
    t.errors,
  );
  if (failed) return failed;

  try {
    await rootDb.user.delete({ where: { id: user.id } });
  } catch (error) {
    // A store created in another tab since the check above: the RESTRICT
    // foreign key is the backstop.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return { formError: t.errors.ownsStoreAgain };
    }
    console.error("deleteAccountAction: deleting the users row failed", error);
    return { formError: t.errors.deleteFailed };
  }

  // A hard delete: Supabase removes the user's sessions and refresh tokens
  // with it, so no other device can carry on signed in.
  const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(user.id);
  if (error) {
    console.error("deleteAccountAction: deleting the Auth user failed", error);
    return { formError: t.errors.deleteUnfinished };
  }

  // The session is already gone server-side; this only clears its cookies.
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);

  revalidatePath("/", "layout");
  redirect("/account-deleted");
}
