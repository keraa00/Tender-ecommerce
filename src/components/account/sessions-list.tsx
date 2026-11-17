import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { revokeSessionAction } from "@/lib/account/actions";
import type { AccountSession } from "@/lib/account/sessions";
import { describeUserAgent } from "@/lib/account/user-agent";
import { formatDateTime } from "@/lib/dates";
import { format } from "@/lib/i18n/format";
import { getAdminI18n } from "@/lib/i18n/server";

/**
 * Every device signed in to the account. Each other one can be signed out on
 * its own; this one is signed out with the ordinary Sign out.
 */
export async function SessionsList({ sessions }: { sessions: readonly AccountSession[] }) {
  const { t: messages, locale } = await getAdminI18n();
  const t = messages.account.security;

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {sessions.map((session) => (
        <li key={session.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              {describeUserAgent(session.userAgent, t)}
              {session.current ? <Badge tone="success">{t.thisDevice}</Badge> : null}
            </p>
            <p className="mt-0.5 text-sm text-muted tabular">
              {format(t.sessionTimes, {
                active: formatDateTime(session.lastActiveAt, locale),
                created: formatDateTime(session.createdAt, locale),
              })}
            </p>
          </div>
          {session.current ? null : (
            <form action={revokeSessionAction.bind(null, session.id)}>
              <Button type="submit" variant="ghost" size="sm">
                {t.signOut}
              </Button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
