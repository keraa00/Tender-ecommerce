import type { Metadata } from "next";

import { AccountSection } from "@/components/account/account-section";
import { EmailForm } from "@/components/account/email-form";
import { ProfileForm } from "@/components/account/profile-form";
import { FormNotice } from "@/components/ui/field";
import { changeEmailAction, updateProfileAction } from "@/lib/account/actions";
import { listOwnedStores } from "@/lib/account/queries";
import { accountPath } from "@/lib/admin/nav";
import { getAuthUser, requireUser } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/dates";
import { format, plural } from "@/lib/i18n/format";
import { formatRich } from "@/lib/i18n/rich";
import { getAdminI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAdminI18n();
  return { title: t.account.profile.title };
}

export default async function AccountProfilePage(props: PageProps<"/dashboard/account">) {
  const user = await requireUser(accountPath());
  const [authUser, ownedStores, searchParams, { t: messages, locale }] = await Promise.all([
    getAuthUser(),
    listOwnedStores(user.id),
    props.searchParams,
    getAdminI18n(),
  ]);
  const t = messages.account.profile;

  const pendingEmail = authUser?.new_email ?? null;
  // Stores that fall back to the account email for buyers (TND-08): changing
  // the address changes what their checkout and contact page show.
  const storesShowingEmail = ownedStores.filter((store) => !store.contactEmail);
  const lastSignIn = authUser?.last_sign_in_at ? new Date(authUser.last_sign_in_at) : null;

  return (
    <div className="space-y-6">
      {searchParams.email === "confirmed" ? (
        <FormNotice>
          {pendingEmail
            ? format(t.emailConfirmedPending, { email: pendingEmail })
            : format(t.emailConfirmed, { email: user.email })}
        </FormNotice>
      ) : null}

      <AccountSection title={t.profile} description={t.profileHint}>
        <ProfileForm
          action={updateProfileAction}
          name={user.name ?? ""}
          t={messages.account.forms}
        />
      </AccountSection>

      <AccountSection
        title={t.email}
        description={formatRich(t.emailHint, {
          email: <span className="font-medium text-foreground">{user.email}</span>,
        })}
      >
        {pendingEmail ? (
          <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning text-pretty">
            {formatRich(t.pendingEmail, {
              email: <span className="font-medium">{pendingEmail}</span>,
              current: user.email,
            })}
          </p>
        ) : null}

        {storesShowingEmail.length > 0 ? (
          <p className="text-sm text-muted text-pretty">
            {plural(locale, storesShowingEmail.length, t.storesShowEmail, {
              stores: storesShowingEmail.map((store) => store.name).join(", "),
            })}
          </p>
        ) : null}

        <EmailForm action={changeEmailAction} t={messages.account.forms} />
      </AccountSection>

      <AccountSection title={t.account}>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">{t.memberSince}</dt>
            <dd className="mt-0.5 tabular">{formatDate(user.createdAt, locale)}</dd>
          </div>
          <div>
            <dt className="text-muted">{t.lastSignIn}</dt>
            <dd className="mt-0.5 tabular">
              {lastSignIn ? format(t.utc, { date: formatDateTime(lastSignIn, locale) }) : "—"}
            </dd>
          </div>
        </dl>
      </AccountSection>
    </div>
  );
}
