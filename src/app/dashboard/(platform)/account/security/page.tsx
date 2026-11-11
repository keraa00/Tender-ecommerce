import type { Metadata } from "next";
import Link from "next/link";

import { AccountSection } from "@/components/account/account-section";
import { PasswordForm } from "@/components/account/password-form";
import { SessionsList } from "@/components/account/sessions-list";
import { SignOutOthersForm } from "@/components/account/sign-out-others-form";
import { FormError, FormNotice } from "@/components/ui/field";
import { changePasswordAction, signOutOtherSessionsAction } from "@/lib/account/actions";
import { currentSessionId, listSessions, type AccountSession } from "@/lib/account/sessions";
import { accountPath } from "@/lib/admin/nav";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Security" };

export default async function AccountSecurityPage(
  props: PageProps<"/dashboard/account/security">,
) {
  const user = await requireUser(accountPath("security"));
  const { password } = await props.searchParams;

  let sessions: AccountSession[] | null = null;
  try {
    sessions = await listSessions(user.id, await currentSessionId());
  } catch (error) {
    // Supabase-internal table — see `src/lib/account/sessions.ts`. Signing
    // out everywhere else still works without the list.
    console.error("listSessions failed", error);
  }

  const others = sessions?.filter((session) => !session.current).length ?? 0;

  return (
    <div className="space-y-6">
      {password === "reset" ? (
        <FormNotice>Your new password is set, and every other device has been signed out.</FormNotice>
      ) : null}

      <AccountSection
        title="Password"
        description={
          <>
            Changing it signs out every other device. Forgotten it?{" "}
            <Link href="/forgot-password" className="underline underline-offset-4">
              Reset it by email
            </Link>
            .
          </>
        }
      >
        <PasswordForm action={changePasswordAction} />
      </AccountSection>

      <AccountSection
        title="Where you're signed in"
        description="Browsers and devices with access to your account. Sign out any you don't recognise, then change your password."
      >
        {sessions ? (
          <SessionsList sessions={sessions} />
        ) : (
          <FormError>Could not load your sessions right now.</FormError>
        )}
        <SignOutOthersForm
          action={signOutOtherSessionsAction}
          disabled={sessions !== null && others === 0}
        />
      </AccountSection>
    </div>
  );
}
