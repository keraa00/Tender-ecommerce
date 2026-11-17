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
import { formatRich } from "@/lib/i18n/rich";
import { getAdminI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAdminI18n();
  return { title: t.account.security.title };
}

export default async function AccountSecurityPage(
  props: PageProps<"/dashboard/account/security">,
) {
  const user = await requireUser(accountPath("security"));
  const [{ password }, { t: messages }] = await Promise.all([props.searchParams, getAdminI18n()]);
  const t = messages.account.security;

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
        <FormNotice>{t.passwordReset}</FormNotice>
      ) : null}

      <AccountSection
        title={t.password}
        description={formatRich(t.passwordHint, {
          link: (
            <Link href="/forgot-password" className="underline underline-offset-4">
              {t.resetByEmail}
            </Link>
          ),
        })}
      >
        <PasswordForm action={changePasswordAction} t={messages.account.forms} />
      </AccountSection>

      <AccountSection
        title={t.sessions}
        description={t.sessionsHint}
      >
        {sessions ? (
          <SessionsList sessions={sessions} />
        ) : (
          <FormError>{t.sessionsFailed}</FormError>
        )}
        <SignOutOthersForm
          action={signOutOtherSessionsAction}
          disabled={sessions !== null && others === 0}
          t={messages.account.forms}
        />
      </AccountSection>
    </div>
  );
}
