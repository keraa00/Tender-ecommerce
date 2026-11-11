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

export const metadata: Metadata = { title: "Account settings" };

export default async function AccountProfilePage(props: PageProps<"/dashboard/account">) {
  const user = await requireUser(accountPath());
  const [authUser, ownedStores, searchParams] = await Promise.all([
    getAuthUser(),
    listOwnedStores(user.id),
    props.searchParams,
  ]);

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
            ? `That's one confirmed. Open the link we sent to the other address to finish moving to ${pendingEmail}.`
            : `Your email address is now ${user.email}.`}
        </FormNotice>
      ) : null}

      <AccountSection title="Profile" description="How you appear across Tender.">
        <ProfileForm action={updateProfileAction} name={user.name ?? ""} />
      </AccountSection>

      <AccountSection
        title="Email address"
        description={
          <>
            You sign in with <span className="font-medium text-foreground">{user.email}</span>.
            Account emails, like password resets, go there too.
          </>
        }
      >
        {pendingEmail ? (
          <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning text-pretty">
            Waiting for you to confirm <span className="font-medium">{pendingEmail}</span>. Check
            both inboxes for a link — until it&rsquo;s confirmed, keep signing in with{" "}
            {user.email}. Asking again below replaces this request.
          </p>
        ) : null}

        {storesShowingEmail.length > 0 ? (
          <p className="text-sm text-muted text-pretty">
            {storesShowingEmail.length === 1
              ? `${storesShowingEmail[0].name} shows`
              : `${storesShowingEmail.map((store) => store.name).join(", ")} show`}{" "}
            this address to buyers, because no separate contact email is set in Settings. A new
            address will show there instead.
          </p>
        ) : null}

        <EmailForm action={changeEmailAction} />
      </AccountSection>

      <AccountSection title="Account">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Member since</dt>
            <dd className="mt-0.5 tabular">{formatDate(user.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-muted">Last sign-in</dt>
            <dd className="mt-0.5 tabular">
              {lastSignIn ? `${formatDateTime(lastSignIn)} UTC` : "—"}
            </dd>
          </div>
        </dl>
      </AccountSection>
    </div>
  );
}
