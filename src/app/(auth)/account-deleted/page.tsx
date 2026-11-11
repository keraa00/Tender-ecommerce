import type { Metadata } from "next";

import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Account deleted" };

/** Where `deleteAccountAction` leaves the person it has just signed out. */
export default function AccountDeletedPage() {
  return (
    <div className="text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Your account is deleted</h1>
      <p className="mt-1.5 mb-6 text-sm text-muted text-pretty">
        You&rsquo;ve been signed out everywhere, and your sign-in and profile are gone. Thanks for
        trying Tender.
      </p>
      <ButtonLink href="/" variant="secondary">
        Back to Tender
      </ButtonLink>
    </div>
  );
}
