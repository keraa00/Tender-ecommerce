# Deploying

Tender deploys to Vercel as it is. The steps below are for a **public demo on
a `*.vercel.app` address**: Stripe in test mode, and the seller admin on the
same host at `/dashboard/<slug>` — single-host mode, exactly like local
development. A `vercel.app` address cannot have an `admin.` subdomain of its
own; [with a custom domain](#with-a-custom-domain) the admin moves to one.

`vercel.json` pins the functions to Paris (`cdg1`), next to a Supabase project
in `eu-west-3` — change it if your database lives elsewhere — and schedules the
daily cleanup (`/api/cron/sweep`).

1. [Database and storage](#1-database-and-storage)
2. [Vercel project](#2-vercel-project)
3. [Supabase Auth](#3-supabase-auth)
4. [Stripe webhooks](#4-stripe-webhooks)
5. [A platform admin](#5-a-platform-admin)
6. [Smoke test](#6-smoke-test)

---

## 1. Database and storage

From the repo root, with your local `.env` pointing at the production project
(the session pooler, port 5432):

```bash
npm run db:deploy      # apply migrations — never `migrate dev` or `reset` here
npm run storage:setup  # the public product-images bucket
```

Both are idempotent. The build does not migrate; run `db:deploy` again before
deploying code that ships a new migration. Seed only if you want the demo
stores (`npm run db:seed`), and set `SEED_PASSWORD` first — it is the password
of every demo account, and lives only in your `.env`.

## 2. Vercel project

Import the repository and deploy once to learn the address
(`<project>.vercel.app`). Then, under Settings → Environment Variables, set
these for **Production** and redeploy — `NEXT_PUBLIC_*` values are baked in at
build time:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase → Connect → **Transaction pooler** (port 6543). No `sslmode`/`sslrootcert` needed: the app verifies the connection with the bundled CA. Serverless runs many small instances, and the session pooler runs out of clients long before Postgres is busy |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | as in `.env` |
| `NEXT_PUBLIC_APP_URL` | `https://<project>.vercel.app` |
| `NEXT_PUBLIC_ADMIN_HOST` | `<project>.vercel.app` — the same host, which is what switches the admin subdomain off |
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | test-mode keys (`sk_test_…`, `pk_test_…`) |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | from [step 4](#4-stripe-webhooks) |
| `CRON_SECRET` | a long random string (`openssl rand -hex 32`); Vercel Cron sends it, anyone else gets a 401 |

Never paste `.env` wholesale — its `NEXT_PUBLIC_ADMIN_HOST="localhost:3000"`
would send every admin link to localhost — and do not set `NODE_ENV` or
`SEED_PASSWORD`. Without those variables a Preview build fails at
`DATABASE_URL`, which keeps previews from writing to the production database.

## 3. Supabase Auth

Supabase's built-in email sender only delivers to the members of your Supabase
organization, so on its own nobody else could confirm a sign-up or reset a
password. Give it an SMTP server: for a demo, a dedicated Gmail account works
without a domain of your own — turn on 2-Step Verification, create an App
Password, and under Authentication → SMTP enter `smtp.gmail.com`, port `465`,
the Gmail address as user and the app password. Then:

- Authentication → URL Configuration: Site URL `https://<project>.vercel.app`,
  and redirect URLs `https://<project>.vercel.app/auth/confirm` and
  `https://<project>.vercel.app/auth/callback`.
- The token-hash email templates from
  [setup.md](setup.md#email-templates), if this is a fresh project. They carry
  no host, so they need no change.
- Authentication → Rate Limits: raise "emails per hour" if the default is too
  tight for your visitors.
- Realtime → Settings: turn off public channel access. Live order alerts use
  private channels only.

## 4. Stripe webhooks

In test mode: Workbench → Webhooks → an endpoint at
`https://<project>.vercel.app/api/webhooks/stripe`, **Events from: Connected
accounts**, for `account.updated`, `capability.updated`,
`account.application.deauthorized`, `payment_intent.succeeded`,
`payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`,
`charge.dispute.created` and `charge.dispute.closed`. Its signing secret goes
in `STRIPE_CONNECT_WEBHOOK_SECRET`.

## 5. A platform admin

The moderation page at `/dashboard/platform` is for users whose
`platform_role` is `PLATFORM_ADMIN`. Sign up with your own address, then set
that column on your row in `users` (Prisma Studio, or the Supabase table
editor) rather than relying on the shared demo admin account.

## 6. Smoke test

- Sign up with an address outside your Supabase organization and confirm it
  from the email.
- Open a store, add a product with a photo and feature it from
  `/dashboard/platform`.
- Pay with `4242 4242 4242 4242` and see the order turn Paid; fulfil it,
  refund it in Stripe and see it come back.
- Place a cash-on-delivery order and mark it paid.
- Reset a password.
- Check `/terms`, `/privacy` and the demo notice.
- Confirm `curl https://<project>.vercel.app/api/cron/sweep` answers 401.

## Accepted for the demo

There is no rate limiting or CAPTCHA in the app
([SECURITY_AUDIT.md](../SECURITY_AUDIT.md) TND-07): a script can place
cash-on-delivery orders and run a demo store's stock down (TND-01). A Vercel
Firewall rate-limit rule on `POST`s to `/s/*/checkout*` blunts it, and a
reseed restocks. The remaining audit findings that matter only once real money
moves — discount eligibility keyed on a typed email (TND-04–06), a nonce-based
CSP (TND-16), staff roles (TND-17) and a least-privilege database role
(TND-21) — are open in the audit report.

---

## With a custom domain

| | |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://your-domain.com` — the apex, made the primary domain in Vercel, with `www` redirecting to it |
| `NEXT_PUBLIC_ADMIN_HOST` | empty, so the admin host is derived as `admin.your-domain.com` |
| Vercel → Domains | `your-domain.com` and `admin.your-domain.com` on the same project; no wildcard needed |
| Supabase → Authentication → URL Configuration | `https://your-domain.com/auth/confirm` and `/auth/callback` |
| Stripe webhook | the same endpoint on `https://your-domain.com` |
| Stripe keys | live `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, once Stripe has reviewed the platform profile — and only with a business in a country where Stripe takes platforms |

The auth cookie's `Domain` is derived from the host (`your-domain.com`), so one
session covers the platform and the admin. A real domain has a real parent, so
the public-suffix problem that rules out `localhost` does not arise. A custom
domain also lets you send auth email from your own address instead of Gmail.
