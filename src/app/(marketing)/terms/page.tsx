import type { Metadata } from "next";
import Link from "next/link";

import { LegalContact, LegalPage } from "@/components/legal-page";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms of using the Tender demo.",
};

const operator = SITE.legalName || "the Tender project";

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="16 November 2026">
      <section>
        <h2>A demo, not a shop</h2>
        <p>
          Tender is a demonstration of a multi-store e-commerce platform, run by{" "}
          {operator}. Nothing on it is for sale. Payments run in Stripe&apos;s
          test mode, so no money changes hands, and no order placed here is ever
          made, packed or delivered. Pay with the test card 4242 4242 4242 4242;
          a real card is declined.
        </p>
      </section>

      <section>
        <h2>Using it</h2>
        <p>Anyone can sign up, open a store and try the seller side. In return:</p>
        <ul>
          <li>Don&apos;t upload anything illegal, hateful, sexual or that you have no right to share.</li>
          <li>Don&apos;t pretend to be a real business or person you are not.</li>
          <li>Don&apos;t enter real card numbers, or other people&apos;s personal details.</li>
          <li>Don&apos;t try to break, overload or get around the security of the site.</li>
        </ul>
        <p>
          Stores and accounts that don&apos;t keep to this can be hidden,
          suspended or deleted without notice.
        </p>
      </section>

      <section>
        <h2>No guarantees</h2>
        <p>
          The demo is provided as it is. It can change, go offline or be reset at
          any time, and what you create on it can be lost. Don&apos;t keep anything
          here you would mind losing. To the extent the law allows, {operator}{" "}
          accepts no liability for any loss from using it.
        </p>
      </section>

      <section>
        <h2>Your data</h2>
        <p>
          The <Link href="/privacy">privacy page</Link> says what is kept and how
          to delete it. Questions go to <LegalContact email={SITE.supportEmail} />.
        </p>
      </section>
    </LegalPage>
  );
}
