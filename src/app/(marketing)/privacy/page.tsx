import type { Metadata } from "next";
import Link from "next/link";

import { LegalContact, LegalPage } from "@/components/legal-page";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Tender keeps about you, why, and how to take it with you or delete it.",
};

const operator = SITE.legalName || "the Tender project";

/**
 * Kept in step with the code: the cookies are the ones the app sets (names in
 * `src/lib/cart/session.ts`, `checkout/orders.ts`, `checkout/saved.ts`,
 * `i18n/locales.ts`, `appearance.ts`), and the retention periods are the ones
 * `/api/cron/sweep` enforces. Change one, change the other.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="16 November 2026">
      <section>
        <h2>The short version</h2>
        <p>
          Tender is a demo of a multi-store e-commerce platform, run by {operator}.
          It keeps what it needs to sign you in and to run the stores on it, sets
          no advertising or analytics cookies, and never sees a card number. You
          can download or delete your account from its settings at any time.
          Please don&apos;t enter real addresses or phone numbers: no order placed
          here is ever delivered.
        </p>
      </section>

      <section>
        <h2>What is kept</h2>
        <ul>
          <li>
            <strong>Your account:</strong> your name and email address, and the
            sessions you are signed in with — browser, system and when each was
            last used, so you can sign them out. Passwords are kept by Supabase
            Auth as hashes, never in readable form.
          </li>
          <li>
            <strong>Stores:</strong> what sellers create — store details,
            products, photos, discounts, shipping settings and themes.
          </li>
          <li>
            <strong>Orders placed in a store:</strong> the email, name, delivery
            and billing addresses, phone number and note given at checkout, and
            what was bought. That store&apos;s owner sees them in their admin.
          </li>
          <li>
            <strong>&quot;Save my information&quot;:</strong> only when you tick it
            at checkout, your email, addresses and way of paying for that store,
            so the next checkout opens filled in. Unticking it forgets them at once.
          </li>
        </ul>
      </section>

      <section>
        <h2>Payments</h2>
        <p>
          Card payments are taken by Stripe, in test mode, on the seller&apos;s
          own Stripe account. Card details go from your browser straight to
          Stripe; Tender only learns whether a payment succeeded.
        </p>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>Every cookie here is needed for the part of the site that sets it:</p>
        <ul>
          <li><code>sb-…-auth-token</code> — keeps you signed in.</li>
          <li><code>tender_cart</code> — your cart in a store, for 30 days.</li>
          <li><code>tender_last_order</code> — shows your order&apos;s confirmation page, for an hour.</li>
          <li><code>tender_saved_checkout</code> — only if you chose to save your information, for a year.</li>
          <li><code>tender_locale</code> — the language you picked, for a year.</li>
          <li><code>tender-appearance</code> — light or dark mode, for a year.</li>
        </ul>
      </section>

      <section>
        <h2>Who processes it</h2>
        <ul>
          <li>Supabase — the database, sign-in and photo storage, in the EU (Paris).</li>
          <li>Vercel — hosting.</li>
          <li>Stripe — payments, in test mode.</li>
          <li>Google (Gmail) — sends sign-in emails: confirmations, password resets and email changes.</li>
        </ul>
      </section>

      <section>
        <h2>How long it is kept</h2>
        <ul>
          <li>Checkouts left unpaid are cancelled after a day.</li>
          <li>Carts nobody has touched for 30 days are deleted.</li>
          <li>Your account, until you delete it.</li>
          <li>
            Orders, with the store they were placed in. A store&apos;s owner
            deleting it deletes its orders.
          </li>
        </ul>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>
          Signed in, <Link href="/dashboard/account/privacy">Account → Data &amp; privacy</Link>{" "}
          downloads everything kept about you as a file, and deletes your account.
          Questions go to <LegalContact email={SITE.supportEmail} />.
        </p>
      </section>
    </LegalPage>
  );
}
