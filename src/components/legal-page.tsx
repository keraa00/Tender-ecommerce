import type { ReactNode } from "react";

/** The shared frame of /terms and /privacy: a title, its date, and prose. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  /** When the text last changed, as shown to the reader. */
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="flex-1">
      <article className="mx-auto w-full max-w-3xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
        <div className="mt-10 space-y-8 text-pretty [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-accent [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_li]:mt-1.5 [&_p]:mt-3 [&_p]:text-muted [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-muted">
          {children}
        </div>
      </article>
    </main>
  );
}

/** Who to ask: the support address once there is one, the account pages until then. */
export function LegalContact({ email }: { email: string }) {
  return email ? (
    <a href={`mailto:${email}`}>{email}</a>
  ) : (
    <>the settings of your account</>
  );
}
