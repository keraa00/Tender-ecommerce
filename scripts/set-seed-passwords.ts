/**
 * Moves every seeded demo account onto SEED_PASSWORD, and does nothing else —
 * no rows, no images, no orders. For rotating the demo logins on a database
 * that is already seeded, without running the whole seed against it.
 *
 *   npm run seed:passwords
 *
 * The accounts are the ones `prisma/seed.ts` provisions: the platform admin
 * and every store owner in the seed catalogue. Accounts that do not exist in
 * Supabase Auth are reported and skipped, never created.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SEED_PASSWORD
 * in `.env`. The password stays there: never commit it.
 */

import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

import { PLATFORM_ADMIN, SEED_STORES } from "../prisma/seed-catalog";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.SEED_PASSWORD?.trim();

  if (!url || !serviceRoleKey || !password) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SEED_PASSWORD must be set in .env.",
    );
    process.exit(1);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const emails = [
    PLATFORM_ADMIN.email,
    ...new Set(SEED_STORES.map((store) => store.owner.email)),
  ];

  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const idByEmail = new Map(data.users.map((user) => [user.email?.toLowerCase(), user.id]));

  let updated = 0;
  const missing: string[] = [];
  const failed: string[] = [];

  for (const email of emails) {
    const id = idByEmail.get(email.toLowerCase());
    if (!id) {
      missing.push(email);
      continue;
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(id, { password });
    if (updateError) {
      failed.push(`${email}: ${updateError.message}`);
    } else {
      updated += 1;
    }
  }

  console.log(`Updated ${updated} of ${emails.length} demo accounts.`);
  if (missing.length > 0) console.log(`Not in Supabase Auth (skipped): ${missing.join(", ")}`);
  if (failed.length > 0) {
    console.error(`Failed:\n  ${failed.join("\n  ")}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
