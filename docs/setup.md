# Local setup

The full version of the README's [Getting started](../README.md#getting-started).
Deploying is in [deployment.md](deployment.md).

1. [Prerequisites](#prerequisites)
2. [Database](#database)
3. [Supabase](#supabase)
4. [Product image storage](#product-image-storage)
5. [Migrate and seed](#migrate-and-seed)
6. [Payments (Stripe test mode)](#payments-stripe-test-mode)
7. [Run](#run)
8. [Running the admin subdomain locally](#running-the-admin-subdomain-locally)

---

## Prerequisites

- Node.js 22 or newer
- A [Supabase](https://supabase.com) project (auth, image storage, Realtime)
- A [Stripe](https://stripe.com) account in test mode or a sandbox, with
  Connect turned on — only needed for card payments
- The [Stripe CLI](https://docs.stripe.com/stripe-cli), to forward webhooks
  locally

```bash
git clone https://github.com/keraa00/Tender-ecommerce.git
cd Tender-ecommerce
npm install
cp .env.example .env
```

Every command below is run from the repo root. `.env.example` documents each
variable in more depth than this guide does.

---

## Database

Either a local Postgres or a Supabase project.

```bash
npx prisma dev --name ecom
```

That prints `DATABASE_URL` and `SHADOW_DATABASE_URL`; paste them into `.env`.

If you point `DATABASE_URL` at Supabase rather than a local database, use the
**session pooler** (port 5432) and append
`?sslmode=verify-full&sslrootcert=./certs/supabase-ca.crt`. The pooler serves a
certificate signed by Supabase's own root CA, which the driver behind
`@prisma/adapter-pg` rejects when the system trust store is all it has. That
path is resolved against the process working directory, so the seed, the
scripts and the migration CLI have to be launched from the repo root. The app
itself never reads the file: `src/lib/db/root.ts` swaps it for the same CA
bundled as code (`src/lib/db/supabase-ca.ts`), because a serverless deployment
only carries the files its build traced. `.env.example` carries the long
version, including why the session pooler is the one to use for migrations.

---

## Supabase

Needed for auth, image uploads and live order alerts; storefronts browse
without it.

### API keys

From Project Settings → API Keys copy the project URL, the *publishable* key
(`sb_publishable_…`) and a *secret* key (`sb_secret_…`) into `.env`. Supabase
renamed these: publishable was the anon key, secret was the service-role key.
The variable names in `.env.example` keep the old spelling — only the values
changed.

### Redirect URLs

Under Authentication → URL Configuration:

```
http://localhost:3000/auth/confirm
http://localhost:3000/auth/callback
```

### Email templates

Under Authentication → Emails → Templates, change **Confirm signup** to send
the token hash:

```html
<h2>Confirm your signup</h2>
<p>
  <a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup"
    >Confirm your email</a
  >
</p>
```

This is worth doing even though `/auth/confirm` also accepts the stock
`{{ .ConfirmationURL }}` template. That default sends the user through
Supabase's own verify endpoint, which hands back a PKCE code redeemable only in
the browser that signed up — so confirming from a phone, or from webmail in a
second browser, fails. A token hash carries no such tie and works anywhere.

Appending to `{{ .RedirectTo }}` rather than rebuilding the URL from
`{{ .SiteURL }}` is what preserves the `next` path the app put on
`emailRedirectTo`, so a user confirming from a deep link still lands where they
were headed.

Do the same for the two templates account settings sends, for the same
reason — a reset link is very often opened on a phone:

- **Reset password**:
  `<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery">Choose a new password</a>`
- **Change email address**:
  `<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email_change">Confirm the change</a>`

### Email provider settings

Under Authentication → Providers → Email (Sign In / Providers in newer
dashboards):

- **Secure email change: on** — the default. Both the old and the new inbox
  have to confirm, so a session left open somewhere cannot move the account to
  an address its owner has never seen. Account settings shows the pending
  address until both links are clicked.
- **Secure password change: off** — the default. The app asks for the current
  password itself before changing it (`src/lib/auth/password.ts`), because
  Supabase's own "require current password" check is a setting this repo
  cannot see, and with it off a wrong `current_password` is quietly accepted.
  Turning it on makes password changes in sessions older than a day fail with
  "sign out and back in".
- Optional: turn on Supabase's security notification emails (password
  changed, email changed) in the Emails section, so a change made by someone
  else does not go unnoticed.

Supabase's built-in email sender allows only a couple of emails an hour, which
sign-up, reset and email-change links all share, and delivers only to members
of your Supabase organization. Set up custom SMTP before anyone else signs up —
[deployment.md](deployment.md#3-supabase-auth) shows a Gmail setup.

### What uses the secret key

Account deletion and store deletion use the secret key
(`SUPABASE_SERVICE_ROLE_KEY`) as image uploads do: the Auth user is deleted
through `auth.admin`. "Where you're signed in" reads and revokes rows of
Supabase's internal `auth.sessions` table directly — there is no public API for
listing one user's sessions — see `src/lib/account/sessions.ts` for what was
checked and what still works if Supabase ever closes that off.

---

## Product image storage

```bash
npm run storage:setup
```

Creates the public `product-images` bucket that seller uploads go to.
Idempotent, and safe to re-run after changing the limits in
`scripts/setup-storage.ts`.

---

## Migrate and seed

```bash
npm run db:migrate   # local `prisma dev` database
# or, against a hosted database:
npm run db:deploy
npm run db:seed
```

The seed is idempotent. It creates seven fully stocked demo stores, each in its
own currency, plus thirteen lighter showcase stores, with collections,
discounts, shipping zones and about a year of orders — so Customers, Orders and
Analytics have something to show. Order dates count back from when the seed
runs, so reseeding keeps recent customers recent. Product photos are openly
licensed (see [CREDITS.md](../CREDITS.md)); Wikimedia Commons photos are
copied into the `product-images` bucket rather than hotlinked, because
Wikimedia rate-limits `next/image`'s server-side fetches.

| Store | Currency | Owner account |
|---|---|---|
| `/s/nordhavn-supply` | USD | `nordhavn@example.com` |
| `/s/rosewater-ceramics` | EUR | `rosewater@example.com` |
| `/s/wildmoor-apothecary` | GBP | `wildmoor@example.com` |
| `/s/halden-coffee` | AUD | `halden@example.com` |
| `/s/marlowe-paper` | CAD | `marlowe@example.com` |
| `/s/bakar-atelier` | BAM | `bakar@example.com` |
| `/s/kehre-velo` | CHF | `kehre@example.com` |
| — | — | `admin@example.com` (platform admin) |

With `SUPABASE_SERVICE_ROLE_KEY` and `SEED_PASSWORD` set in `.env`, the seed
also provisions these accounts — and the owners of the showcase stores in
`prisma/seed-catalog-showcase.ts` — in Supabase Auth, so you can log in as
them. They all sign in with the `SEED_PASSWORD` you set in `.env`, which is
never committed: a password in the repo is a published password. Reseeding
moves accounts that already exist onto the current `SEED_PASSWORD`; to rotate
them without reseeding, change it and run `npm run seed:passwords`. These are
demo fixtures — never reuse the password anywhere real.

The demo stores start without a Stripe account, so their storefronts browse but
card checkout says payments aren't set up — the next step connects one. Wildmoor
(UK), Halden (Australia), Marlowe (Canada), Bakar (Bosnia and Herzegovina) and
Kehre (Switzerland and Liechtenstein) also offer cash on delivery in their home
countries, so they take orders there without Stripe, and their history mixes
cash still due, cash collected and parcels refused at the door with card orders
from abroad.

---

## Payments (Stripe test mode)

1. In a Stripe sandbox or test mode, copy the keys from Developers → API keys
   into `STRIPE_SECRET_KEY` (`sk_test_…`) and
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_…`).
2. Turn on Connect (Dashboard → Connect → Get started) and fill in the
   platform's branding under Connect settings — name, icon, colour.
   Stripe-hosted onboarding will not start without it.
3. Forward connected-account webhooks to the dev server with the
   [Stripe CLI](https://docs.stripe.com/stripe-cli), and keep it running while
   you test:

   ```bash
   stripe login
   npm run stripe:listen
   ```

   The script is `stripe listen --events-from @accounts --events …
   --forward-connect-to localhost:3000/api/webhooks/stripe`, with the nine
   event types the app handles.

   Recent CLI versions refuse to listen without an explicit event list. CLI
   1.50+ also needs **Settings → Team and security → MCP and CLI access**
   switched on before `stripe login` works. Put the `whsec_…` it prints (or
   `stripe listen --print-secret`) in `STRIPE_CONNECT_WEBHOOK_SECRET`. Without
   it the app still works — Settings → Payments and the confirmation page read
   Stripe directly — but stores and orders only update when someone looks.
4. Sign in as a store owner, open Settings → Payments, choose the country the
   business is based in (United States makes the test values below simplest),
   click **Connect with Stripe** and finish test onboarding: SMS code
   `000000`, date of birth `01/01/1901`, address line 1 `address_full_match`,
   ID / SSN `000000000` (or `0000` for the last four), website
   `https://accessible.stripe.com`, and the test bank account Stripe offers.
   Back in the admin the store shows **Under review**, then **Live** within a
   minute or two.
5. Check out with `4242 4242 4242 4242`, any future expiry and any CVC.
   `4000 0025 0000 3155` asks for 3-D Secure; `4000 0000 0000 9995` is
   declined.

---

## Run

```bash
npm run dev
```

Locally that is one host:

| | |
|---|---|
| `http://localhost:3000` | Everything — landing page, login, storefronts, your store list |
| `http://localhost:3000/dashboard/<slug>` | The seller admin |
| `http://localhost:3000/dashboard/platform` | Platform moderation (platform admins only) |

`.env.example` ships with `NEXT_PUBLIC_ADMIN_HOST="localhost:3000"`, which
keeps the seller admin on the same host. With a custom domain in production it
moves to `admin.<your-domain>` and `/dashboard/<slug>` redirects there — see
[architecture.md](architecture.md#the-admin-subdomain).

---

## Running the admin subdomain locally

Local development does not run the admin split because of the session, not the
routing. One session has to cover both hosts, which takes an auth cookie scoped
to the parent domain, and `localhost` cannot carry one: it is a public suffix,
so RFC 6265 §5.3 has the browser *downgrade* `Domain=localhost` to a host-only
cookie rather than honour it. `admin.localhost` never receives the session, and
a signed-in seller bounces between the login page and an admin that cannot see
them.

A hostname with a dot does carry it, so the split can be run locally by
clearing `NEXT_PUBLIC_ADMIN_HOST` and pointing `NEXT_PUBLIC_APP_URL` at one:

- **`http://lvh.me:3000`** — `lvh.me` and `*.lvh.me` are public DNS names
  resolving to 127.0.0.1, so nothing needs adding to `/etc/hosts`.
- **A name of your own** — `127.0.0.1  tender.test admin.tender.test` in
  `/etc/hosts`. `.test` is reserved for this (RFC 6761) and, unlike `.local`,
  does not collide with mDNS.

Either way the browser marks plain `http://` on a real hostname Not Secure —
only `localhost` is treated as a trustworthy origin. For a padlock, issue a
certificate covering both hosts with
[mkcert](https://github.com/FiloSottile/mkcert) (`mkcert lvh.me "*.lvh.me"`)
and pass it to `next dev --experimental-https-key` and
`--experimental-https-cert`. Changing the dev host also means adding its
`/auth/confirm` and `/auth/callback` URLs in Supabase.
