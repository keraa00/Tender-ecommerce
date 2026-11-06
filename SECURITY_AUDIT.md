# Tender — Security Audit Report

**Target:** Tender multi-tenant e-commerce platform (Next.js 16.3 App Router, React 19.2, Prisma 7 / PostgreSQL on Supabase, Supabase Auth + Storage + Realtime, Stripe Connect)
**Revision:** working tree of `main` on 2026-11-06 (HEAD `09f404f` + uncommitted changes)
**Type:** White-box source review (no live exploitation against the hosted environment)

---

## 1. Scope and methodology

### Files covered

| Area | Files |
|---|---|
| Config / infra | `next.config.ts`, `src/proxy.ts`, `package.json`, `prisma.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts`, `.env.example`, `.gitignore`, `.claude/*`, `skills-lock.json`, `certs/` |
| Database | `prisma/schema.prisma`, all 12 migrations in `prisma/migrations/` (grants, RLS, CHECK constraints, Realtime trigger and policy) |
| Server logic | every file in `src/lib/**` (auth, supabase, db, admin routing, stores, products, cart, checkout, payments, discounts, shipping, orders, customers, collections, analytics, theme, i18n, address, money, storefront helpers) |
| Routes | every `page.tsx`, `layout.tsx` and `route.ts` under `src/app/**` (marketing, auth, `/auth/*` handlers, `/api/*`, dashboard platform and store admin, theme editor and preview, storefront shop and checkout) |
| Components | full reads of the security-relevant client components (checkout form/view, payment section, Realtime new-orders, theme editor and preview bridge); sink sweeps across all of `src/components/**` |
| Scripts / seeds | `prisma/seed*.ts`, `prisma/seed-images.json`, `scripts/setup-storage.ts`, `scripts/fetch-seed-images.ts` |
| Other | `README.md`, `CREDITS.md`, `tests/**` (not shipped; reviewed for fixtures and secrets); git history scanned for committed secrets |

### Passes
1. **Per-file scan:** every file was read for injection sinks, authentication and authorization checks, secret handling, unsafe APIs, and trust in client data.
2. **Cross-file data-flow tracing:** each untrusted input (form fields, Server Action bound arguments, URL params, cookies, headers, Stripe events, uploaded files, theme JSON) was followed from its source to the DB write, render, redirect or external call it reaches. The traces that turned out safe are in §5.
3. **Logic review:** looked for denial of service, resource exhaustion, privilege escalation, business-logic abuse (stock, discounts, payments), and cross-tenant leakage.

### Severity
CVSS v3.1 base scores, mapped to bands: **Critical** 9.0–10, **High** 7.0–8.9, **Medium** 4.0–6.9, **Low** 0.1–3.9, **Informational** 0.0 (hardening or latent issues with no exploitable impact today).

---

## 2. Executive summary

The core security architecture is strong:

- **Tenancy:** the tenant is resolved from slug + session in one place (`getStoreContext`), and every query is scoped by `storeId`.
- **Client ids:** every id the browser sends is re-checked against the store before it is used.
- **Pricing:** done server-side, then re-validated inside the order transaction.
- **Payments:** Stripe webhooks are signature-verified, and order state moves only through conditional, idempotent updates.
- **Database exposure:** the Supabase Data API is fully revoked, with deny-all RLS behind it.
- **Theme documents:** validated strictly.
- **Rendering and queries:** no raw HTML sinks, no unsafe SQL, and a safe redirect helper.

No SQL injection, XSS, IDOR, open redirect or webhook-forgery path held up after the data-flow tracing.

The material risks are **business-logic and abuse issues on unauthenticated checkout endpoints**, plus one **credential-hygiene** problem:

- **TND-01 (High):** anyone can drain a COD-enabled store's entire inventory with scripted fake cash-on-delivery orders.
- **TND-03 (High):** the seed script provisions real, pre-confirmed Supabase Auth accounts with a password that is committed and published. Anyone can take over the seeded stores and attach their own Stripe account.
- **TND-02, TND-07, TND-09:** no rate limiting, bot protection, reservation expiry or cleanup jobs. Discount campaigns, order lists and database tables can be exhausted or flooded.
- **TND-04, TND-05, TND-06:** discount eligibility is keyed by an unverified, self-typed email. That enables discount abuse and a customer and purchase-history oracle.
- **TND-08, TND-10:** privacy leaks of sellers' private login emails and of platform-account existence and names.

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 2 |
| Medium | 10 |
| Low | 3 |
| Informational | 6 |

---

## 3. Findings summary

| ID | Bug Type | Short Description | Severity | CVSS 3.1 | Location |
|---|---|---|---|---|---|
| TND-01 | Business logic / Resource exhaustion | Unauthenticated COD orders decrement stock immediately. Scripted fake orders sell out the store | High | 8.2 | `src/lib/checkout/orders.ts:302`, `src/lib/payments/settle.ts:152` |
| TND-02 | Business logic / DoS | Unpaid Stripe orders hold discount redemptions forever (no expiry or sweep). Limited codes can be exhausted without paying | Medium | 6.5 | `src/lib/checkout/orders.ts:291-334`, `src/lib/checkout/payment.ts:51-59` |
| TND-03 | Use of hard-coded credentials | Seed creates pre-confirmed seller and `PLATFORM_ADMIN` Auth accounts with a public password | High | 8.2 | `prisma/seed-catalog.ts:138-143`, `prisma/seed.ts:256-299`, `README.md:435` |
| TND-04 | Broken access control (business logic) | Customer-, segment- and per-customer-limited discounts trust an unverified checkout email | Medium | 5.3 | `src/lib/discounts/engine.ts:141-170`, `src/lib/checkout/actions.ts:75-99` |
| TND-05 | Information disclosure (oracle) | Discount status messages reveal whether an email is a customer, is on a private list, or has redeemed a code | Medium | 5.3 | `src/lib/checkout/totals.ts:91-100`, `src/lib/storefront/discount-messages.ts:13-49` |
| TND-06 | Enumeration / Missing anti-automation | The apply-code action distinguishes existing (incl. inactive, expired, private) codes from non-existent ones, with no throttling | Medium | 5.3 | `src/lib/cart/actions.ts:223-261` |
| TND-07 | Missing rate limiting | No throttling or CAPTCHA on auth, cart, discount, checkout or search endpoints; server-side Supabase calls share one IP bucket | Medium | 5.3 | `src/lib/auth/actions.ts:49-165`, `src/proxy.ts`, public Server Actions |
| TND-08 | Sensitive data exposure (PII) | Seller's private login email is shown publicly on storefront contact and checkout pages by default | Medium | 5.3 | `src/lib/stores/queries.ts:65-75`, `src/app/s/[storeSlug]/(shop)/contact/page.tsx:29-56` |
| TND-09 | Uncontrolled resource consumption | Unbounded anonymous carts, PENDING orders, saved checkouts and previews; no TTL or cleanup | Medium | 5.3 | `src/lib/cart/actions.ts:82-90`, `src/lib/cart/session.ts:30-44` |
| TND-10 | Cross-tenant information disclosure | Customers page joins the platform-wide `users` table by email and reveals account existence and name for any email | Medium | 4.3 | `src/lib/customers/queries.ts:83-87` |
| TND-11 | Unrestricted file upload (content) | Uploads trust the client-declared MIME type; no magic-byte check or re-encode before public hosting | Medium | 4.3 | `src/lib/products/images.ts:54-61`, `src/lib/products/constants.ts:94-109` |
| TND-12 | Login CSRF / Session fixation | GET `/auth/confirm` and `/auth/callback` establish a session from any attacker-supplied `token_hash` | Medium | 4.2 | `src/lib/auth/confirmation.ts:50-121`, `src/app/auth/confirm/route.ts` |
| TND-13 | Payment integrity | Settlement does not verify the application fee or PaymentIntent provenance, so a seller can race a fee-less PI | Low | 3.1 | `src/lib/payments/rules.ts:274-283`, `src/lib/payments/settle.ts:207-226` |
| TND-14 | Account enumeration | Sign-up returns raw Supabase error messages | Low | 3.7 | `src/lib/auth/actions.ts:90` |
| TND-15 | Resource abuse (image proxy) | `next/image` allowlist covers whole third-party hosts and every public Supabase bucket | Low | 3.7 | `next.config.ts:65-85` |
| TND-16 | Security misconfiguration | No CSP `script-src`/`object-src`/`base-uri`; HSTS lacks `includeSubDomains` | Informational | 0.0 | `next.config.ts:39-49` |
| TND-17 | Latent privilege escalation | STAFF role can change payment-adjacent settings (COD activation, currency) | Informational | 0.0 (4.3 once staff exist) | `src/lib/stores/actions.ts:159-292`, `src/lib/stores/policy.ts:100-128` |
| TND-18 | Improper input validation | Non-UUID product id reaches Prisma and returns 500 instead of 404 | Informational | 0.0 | `src/app/dashboard/[storeSlug]/(admin)/products/[productId]/page.tsx:21,36` |
| TND-19 | Host header trust | Stripe return URLs built from `X-Forwarded-Host` when `NEXT_PUBLIC_APP_URL` is unset | Informational | 0.0 | `src/lib/payments/accounts.ts:200-211` |
| TND-20 | Input handling | Search passes unescaped `%` / `_` into ILIKE | Informational | 0.0 | `src/lib/products/queries.ts:92-101` |
| TND-21 | Defense in depth | App connects as table owner (bypasses RLS); isolation lives only in app code | Informational | 0.0 | `src/lib/db/root.ts` |

---

## 4. Detailed findings

### TND-01 — Unauthenticated inventory exhaustion through cash-on-delivery orders

- **Bug Type:** Business logic flaw / Uncontrolled resource consumption (CWE-840, CWE-770)
- **Short Description:** A COD order takes stock and empties the cart the moment it is placed. It needs no payment, verification, rate limit or per-buyer cap, so a script can sell out every variant with fake orders.
- **Severity:** High
- **CVSS 3.1:** **8.2** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:H`
- **Affected code:**
  - `src/lib/checkout/actions.ts:124-201` (`placeOrderAction`): public Server Action, no authentication or throttling.
  - `src/lib/checkout/orders.ts:302-304`: `confirmCodOrder(tx, created, cartRow.id)` runs inside the order-creation transaction.
  - `src/lib/payments/settle.ts:47-73, 152-155`: `takeStock(..., "fail")` decrements `inventoryQty` immediately.
  - Stock returns only when the seller manually cancels each order (`cancelCodOrderAction`, `src/lib/orders/actions.ts:100`).

**Description.**
A Stripe order holds no stock until the payment succeeds. A COD order is "real from the moment it is placed", by design. The only checks are a well-formed address, a phone (if `codRequirePhone`), and the COD country and total limits. None of these is verified; the email and phone are self-asserted. Nothing limits orders per IP, cookie, email, phone or address, and each order can take up to 99 units per line (`MAX_LINE_QUANTITY`). The seller's `codMaxTotalCents` cap is bypassed by splitting the attack into many orders.

What one attacker can do with no account:
- Drive every variant to `inventoryQty = 0`, showing "Sold out" to real buyers. This is a storefront-wide denial of sales.
- Flood the seller's Orders list and the live "new orders" badge (the Realtime trigger fires on every COD insert) with fake parcels to ship.
- Consume discount usage limits (see TND-02), because COD orders redeem discounts too.

The seller has to cancel each fake order by hand to restock.

**Steps to reproduce.**
1. Pick a store with *Settings → Payments → Cash on delivery* enabled (several seed stores ship with COD).
2. In a fresh browser profile (no `tender_cart` cookie), open a product and add 99 units (or the remaining stock) to the cart.
3. Open `/s/<slug>/checkout`, enter any name, address and phone, choose **Cash on delivery**, and submit. The order is created as `PENDING / CASH_ON_DELIVERY`, and the variant's stock drops by 99 at once.
4. Capture the two Server Action POSTs from DevTools: add-to-cart (`Next-Action` header) and `placeOrderAction`. The second includes `expectedTotal`, which is the total shown on the page.
5. Replay them in a loop, each iteration without cookies (a new `tender_cart` is minted on the first add). After N iterations every variant reads 0.
6. In the seller admin, *Orders* shows N new COD orders and the new-orders badge reads "99+".

**Suggested fix.**
- Do not take stock at COD placement. Reserve it with a short TTL (`reservedUntil`) that the seller confirms, or take it only when the seller marks the order as shipped. Auto-expire unconfirmed reservations with a cron job.
- Require buyer verification for COD: an email or SMS OTP to the given address or phone before the order counts.
- Rate-limit `placeOrderAction` and `addToCartAction` per IP and per device (e.g. Upstash/Redis sliding window in `proxy.ts` or inside the actions). Add a bot challenge (Cloudflare Turnstile / hCaptcha) on COD checkout.
- Cap open COD orders per email, phone and IP (e.g. 3 per 24h per store) and cap units per COD order. Add a seller-side "bulk cancel and restock" tool and anomaly alerting.

---

### TND-02 — Discount-usage exhaustion and order/PaymentIntent spam through unpaid card orders

- **Bug Type:** Business logic flaw / Denial of service (CWE-840, CWE-400)
- **Short Description:** Every card checkout attempt creates a PENDING order, increments discount `usageCount` and creates a PaymentIntent on the seller's account. The redemptions are released only when the same browser retries, or when Stripe sends `payment_intent.canceled`, which never happens for abandoned PIs. There is no expiry sweep.
- **Severity:** Medium
- **CVSS 3.1:** **6.5** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:L`
- **Affected code:**
  - `src/lib/checkout/orders.ts:291-297`: `redeemDiscounts()` runs when the order is placed, not when it is paid.
  - `src/lib/checkout/orders.ts:317-334`: a PaymentIntent is created on the connected account for every attempt.
  - `src/lib/checkout/payment.ts:51-59`: `supersedePlacedOrder` cancels the previous attempt only if the `tender_last_order` cookie is present.
  - `src/lib/payments/webhooks.ts:86-95`: redemptions are released only on `payment_intent.canceled`.
  - `README.md:570` confirms "a sweep for abandoned unpaid orders still to come".

**Description.**
`redeemDiscounts` correctly enforces `usageLimit` atomically, but it consumes a use for an order that may never be paid. An attacker who discards cookies between attempts is never superseded, so each attempt permanently holds one use of every applied discount.

Consequences:
- A "first 100 customers" or other limited campaign can be burned for the cost of 100 unauthenticated requests.
- Thousands of PENDING orders inflate the seller's order numbers and lists.
- Each attempt is a Stripe API write on the seller's connected account. That is rate-limit pressure, and the seller's Stripe Dashboard fills with incomplete PaymentIntents.

The confirmation page (`/checkout/complete`) also calls Stripe's retrieve API on every visit for a PENDING order, which amplifies the load.

**Steps to reproduce.**
1. As a seller, create code `LAUNCH` (10% off, *Usage limit = 20*).
2. As an anonymous buyer: add an item, apply `LAUNCH`, fill checkout with card payment selected. `placeOrderAction` returns a `clientSecret`; do not confirm the payment.
3. Clear cookies and repeat step 2 nineteen more times (scriptable by replaying the Server Action requests).
4. The discount now shows 20/20 used. A real buyer entering `LAUNCH` gets "no longer available". The seller sees 20 PENDING orders and 20 incomplete PaymentIntents in Stripe.

**Suggested fix.**
- Add a scheduled sweep (Vercel Cron, pg_cron or a Supabase scheduled function). Every 15 minutes, take PENDING Stripe orders older than e.g. 30–60 minutes, cancel their PaymentIntent and call `cancelUnpaidOrder` (which already releases redemptions). Apply the same idea to TND-01's COD reservations.
- Alternatively, treat redemptions as reservations (`reservedUntil`) that count against the limit only until they expire, and convert them to final in `settleOrder`.
- Rate-limit `placeOrderAction` per IP and device (TND-07) and add bot protection.
- Optionally bind supersession to the cart (cancel any PENDING order whose PI metadata names the same `cart_id`), not only to the cookie.

---

### TND-03 — Seed script provisions real Auth accounts with a committed, published password

- **Bug Type:** Use of hard-coded credentials (CWE-798) / Insecure default configuration
- **Short Description:** `npm run db:seed` with `SUPABASE_SERVICE_ROLE_KEY` set creates pre-confirmed Supabase Auth users for every seed store owner (about 20) and a `PLATFORM_ADMIN`, all with the password `tender-demo-2026`. The password is in the repository and the README, and the script has no environment guard.
- **Severity:** High
- **CVSS 3.1:** **8.2** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:H/A:N`. This assumes the seed has been run against the hosted Supabase project; if those stores hold real data, treat it as Critical.
- **Affected code:**
  - `prisma/seed-catalog.ts:138-143`: `SEED_PASSWORD = "tender-demo-2026"` and `PLATFORM_ADMIN = admin@example.com`.
  - `prisma/seed.ts:256-280`: `admin.auth.admin.createUser({ password: SEED_PASSWORD, email_confirm: true })`.
  - `prisma/seed.ts:283-299, 993`: `upsertUser(..., "PLATFORM_ADMIN")`.
  - `prisma/seed.ts:1008` prints the password; `README.md:435` publishes it.
  - Owner emails: `prisma/seed-catalog.ts` (`nordhavn@`, `rosewater@`, `wildmoor@`, `halden@`, `marlowe@`, `bakar@`, `kehre@example.com`) and `prisma/seed-catalog-showcase.ts` (13 more `@example.com` owners).

**Description.**
The project runs against a hosted Supabase project, and the seed is documented as the way to populate it. Once it has run with the service-role key, every seeded seller account can be logged into by anyone who reads the README. Each such account is the **OWNER** of its store, which includes `canManagePayments`. An attacker can therefore:
- edit or delete the catalogue, change prices, and publish theme changes on those storefronts;
- read order and customer data;
- go to *Settings → Payments* and connect their **own** Stripe account, redirecting all future card payments for that store.

The `admin@example.com` account carries `platformRole = PLATFORM_ADMIN`. No route checks that role today (`requirePlatformAdmin` is unused), but the first `/admin` feature to ship would be open to the public password immediately.

**Steps to reproduce.**
1. Run `npm run db:seed` with `SUPABASE_SERVICE_ROLE_KEY` set, as the README describes. The console prints the demo accounts and `password: tender-demo-2026`.
2. From any browser, open `/login` and sign in as `nordhavn@example.com` / `tender-demo-2026`.
3. You land in the Nordhavn Supply admin with full owner rights. *Settings → Payments* lets you start Stripe onboarding for a new connected account.

**Suggested fix.**
- **Immediately:** delete or rotate all seeded Auth users on the hosted Supabase project (Auth → Users), or set random passwords on them. Remove the password from `README.md`.
- Gate Auth provisioning behind an explicit opt-in (`SEED_CREATE_AUTH_USERS=1`), and refuse to run when `NODE_ENV=production` or when the Supabase project ref is not on an allowlist of dev projects.
- Generate a random password per run (`crypto.randomBytes`) and print it once, or read it from an env var that is never committed.
- Never seed a `PLATFORM_ADMIN` with a password; promote real admins manually.
- Consider seeding demo stores with owners that have no credentials (the existing `FALLBACK_USER_IDS` path) whenever the target is shared.

---

### TND-04 — Customer-restricted discounts trust an unverified, self-typed email

- **Bug Type:** Broken access control / Business logic flaw (CWE-284, CWE-840)
- **Short Description:** These discounts all decide eligibility from the email the buyer types at checkout, which is never verified:
  - "Specific customers" discounts (`eligibility = CUSTOMERS`),
  - segment discounts (`LOYAL`, `RETURNING`, `LAPSED`, `FIRST_TIME`),
  - per-customer limits.

  So they can be claimed by impersonating another buyer's email, or by using fresh emails.
- **Severity:** Medium
- **CVSS 3.1:** **5.3** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:N`
- **Affected code:**
  - `src/lib/checkout/actions.ts:75-99`: `saveCheckoutAction` stores any well-formed email on the cart.
  - `src/lib/checkout/orders.ts:105-107`: the order email is the typed email.
  - `src/lib/discounts/queries.ts:223-271`: `loadCustomerProfile` builds the profile from orders matching that email.
  - `src/lib/discounts/engine.ts:141-170`: `checkConditions` checks segment, `customerEmails.includes(email)` and the per-customer limit against it.
  - `src/lib/discounts/redemption.ts:74-85`: the per-customer limit is counted by email (or `userId` only when signed in).

**Description.**
Guest checkout is allowed, so the email is the buyer's identity, but it is never proven.

- **VIP / CUSTOMERS discounts:** knowing a VIP's email, e.g. from social media, a referral or TND-05, is enough to get their private price.
- **LOYAL / RETURNING / LAPSED segments:** typing the email of any existing good customer qualifies.
- **FIRST_TIME and per-customer limits:** a new throwaway email every time (e.g. `me+1@gmail.com`) resets the count.

The order and the Stripe receipt (`receipt_email`) then go to, and are attributed in the victim's customer history under, the impersonated address.

**Steps to reproduce.**
1. As the seller, create an automatic or coded discount with *Eligibility: Specific customers = vip@example.org* for 30% off.
2. As an anonymous buyer, add an item and type `vip@example.org` in the checkout email field (blur triggers `saveCheckoutAction`).
3. The summary applies the 30% discount. Pay or place the order: it succeeds under the VIP's email.
4. For per-customer limits: with a "1 per customer" code, use `a+1@x.com`, `a+2@x.com`, … and each order gets the discount.

**Suggested fix.**
- For CUSTOMERS, LOYAL, RETURNING and LAPSED eligibility, require proof of the email: a signed-in account whose verified email matches, or a one-time code sent to the address before the discount applies. Alternatively, restrict these discounts to `ACCOUNT_HOLDERS`, matching on `userId` and the verified `auth.users.email`.
- Base per-customer limits on stronger signals (account id, payment fingerprint from Stripe `payment_method.card.fingerprint`, normalised email without `+tags`/dots for common providers, and shipping address) and enforce them in `redeemDiscounts`.
- Document for sellers that guest-email eligibility is a soft control.

---

### TND-05 — Discount status messages act as a customer and purchase-history oracle

- **Bug Type:** Information disclosure (CWE-203 observable discrepancy, CWE-359)
- **Short Description:** Each entered code's status is re-computed for whatever email is on the cart and shown to the buyer. Toggling the email reveals whether that address bought from the store before, is on a seller's private VIP list, or has already redeemed a code.
- **Severity:** Medium
- **CVSS 3.1:** **5.3** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`
- **Affected code:**
  - `src/lib/checkout/totals.ts:91-100`: per-code status including the rejection reason.
  - `src/lib/storefront/discount-messages.ts:33-36`: `not-eligible` → `notEligible`, `customer-limit` → `alreadyUsed`, both shown to the buyer.
  - `src/lib/discounts/queries.ts:223-271`: segment and redemption data loaded for the typed email.

**Description.**
Pick a store discount restricted to a segment or list:
- A `RETURNING` or `FIRST_TIME` discount tells you whether `victim@x.com` has a paid order at this store, i.e. whether that person shops here.
- A `CUSTOMERS` discount tells you whether the email is on the private list.
- A "one per customer" code tells you whether the victim has used it ("already used").

An attacker can test any number of emails, since nothing is rate-limited (TND-07). This leaks buyers' purchase relationships with specific shops, which is personal data under GDPR. The existing coarsening of messages in `discount-messages.ts` (disabled and used-up merged) does not cover these reasons.

**Steps to reproduce.**
1. Find a store with an automatic or coded discount restricted to *Returning customers* (or create one as the seller).
2. As an anonymous buyer, add an item and enter the code. Type `known-customer@x.com` in the checkout email and tab out: the discount **applies**.
3. Change the email to `random-123@x.com`: the message becomes *"not eligible"*. The difference reveals that the first address is a paying customer of this store.

**Suggested fix.**
- Don't evaluate identity-dependent eligibility for unverified emails (see TND-04). Show a single generic message such as "This code can't be applied to this order" for `not-eligible`, `customer-limit` and `customer-required` until the buyer is verified.
- Rate-limit email changes and code evaluations per cart and IP.

---

### TND-06 — Discount-code enumeration (existence oracle, no throttling)

- **Bug Type:** Enumeration / Missing anti-automation (CWE-204, CWE-799)
- **Short Description:** `applyDiscountCodeAction` returns `not-found` only when no discount with that code exists in the store. Inactive, expired, not-yet-started, usage-exhausted and customer-restricted codes are all accepted onto the cart, and their distinct status messages (`expired`, `notActive`, `notEligible`, …) then describe them.
- **Severity:** Medium
- **CVSS 3.1:** **5.3** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`
- **Affected code:** `src/lib/cart/actions.ts:223-261` (lines 243-247 look up by `storeId_code` regardless of state); `src/lib/discounts/constants.ts:18` (minimum code length 3); `src/lib/storefront/discount-messages.ts:27-36`.

**Description.**
Seller codes are human-chosen and short (3–32 characters, e.g. `VIP20`, `STAFF50`, `BF2026`). An attacker can brute-force or dictionary-attack the endpoint with no limit and learn which codes exist, including codes meant for staff, influencers or future campaigns that are scheduled but not yet live. Combined with TND-04, discovered customer-restricted codes can then be redeemed.

**Steps to reproduce.**
1. As an anonymous buyer with one item in the cart, capture the `applyDiscountCodeAction` Server Action POST.
2. Replay it with a wordlist (`WELCOME10`, `STAFF`, `VIP20`, `BLACKFRIDAY`, …). Responses `{error:"not-found"}` versus `{appliedAt:…}` separate non-existent codes from existing ones.
3. For each hit, the cart's status line shows whether it is expired, not yet active, customer-only, and so on. Remove it with `removeDiscountCodeAction` to keep testing (the cart holds at most 5).

**Suggested fix.**
- Answer identically for "not found" and "exists but not usable now" (disabled, expired, scheduled), and don't keep such codes on the cart.
- Rate-limit code attempts per cart, session and IP (e.g. 10 per 10 minutes) with exponential back-off, and alert on bursts.
- Encourage longer, random codes for private or staff discounts in the admin UI (show a strength hint).

---

### TND-07 — No rate limiting or bot protection on any unauthenticated endpoint

- **Bug Type:** Missing rate limiting / Improper restriction of excessive authentication attempts (CWE-770, CWE-307)
- **Short Description:** None of these have application-level throttling, CAPTCHA or account lockout: `signInAction`, `signUpAction`, the confirmation-email resend inside `signInAction`, `addToCartAction`, `buyNowAction`, `applyDiscountCodeAction`, `saveCheckoutAction`, `placeOrderAction`, and `/s/[slug]/search/suggestions`.
- **Severity:** Medium
- **CVSS 3.1:** **5.3** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L`
- **Affected code:** `src/lib/auth/actions.ts:49-165`; `src/proxy.ts` (no limiter); `src/lib/cart/actions.ts`; `src/lib/checkout/actions.ts`; `src/app/s/[storeSlug]/(shop)/search/suggestions/route.ts`.

**Description.**
- **Credential stuffing and brute force** against seller accounts. Seller login emails are harvestable through TND-08.
- **Shared Supabase limits.** Supabase Auth is called from the Next.js server (`@supabase/ssr`), so Supabase's per-IP limits (sign-in, sign-up, OTP and email-send) are probably all counted against the **server's** IP, not the attacker's. Two effects:
  1. Supabase's per-attacker brute-force protection no longer applies per attacker.
  2. One attacker can use up the shared bucket and lock **everyone** out of sign-in or sign-up. This applies especially to the project-wide email-send limit, which `signUpAction` and the resend path consume.

  This depends on the project's rate-limit configuration and whether a client IP is forwarded, and should be verified in the Supabase dashboard.
- **Amplification.** Unthrottled cart, checkout and search calls drive TND-01, TND-02, TND-05, TND-06 and TND-09. Each `placeOrderAction` also costs a Stripe API write, and each `/checkout/complete` visit a Stripe read.
- **Shared body limit.** `serverActions.bodySizeLimit: "4mb"` (`next.config.ts:59`) applies to every action, the anonymous ones included.

**Steps to reproduce.**
1. Capture the `signInAction` Server Action POST from `/login`.
2. Send 1,000 requests with a password list for `owner@store.com`. Every request is processed with no delay, lockout or CAPTCHA, and the response only says "don't match".
3. Watch Supabase *Auth → Rate limits / Logs*: the requests are attributed to the app server's egress IP. Once the per-IP limit trips, legitimate users get errors as well.

**Suggested fix.**
- Add a central rate limiter (e.g. `@upstash/ratelimit` + Redis, or Vercel WAF / Cloudflare rate-limiting rules) keyed on client IP (from a trusted proxy header) and on target identifier (email, cart, store). Apply it in `proxy.ts` for route handlers and at the top of each public Server Action.
- Add Cloudflare Turnstile or hCaptcha to sign-up, to sign-in after N failures, and to checkout (especially COD).
- Add progressive delays and temporary lockout per account on failed logins.
- In Supabase, review *Auth → Rate Limits*, configure a custom SMTP with its own quotas, and forward the real client IP if supported.
- Lower `bodySizeLimit` for non-upload actions (route uploads through a dedicated, authenticated route handler).

---

### TND-08 — Seller's private login email published on every storefront by default

- **Bug Type:** Exposure of sensitive information to an unauthorised actor (CWE-200, CWE-359)
- **Short Description:** `getStoreContactEmail()` falls back to the **owner's account email** when the store has no `contactEmail`, which is the default for every new store. That address is rendered publicly on `/s/<slug>/contact` and in the checkout header.
- **Severity:** Medium
- **CVSS 3.1:** **5.3** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`
- **Affected code:** `src/lib/stores/queries.ts:60-75`; `src/app/s/[storeSlug]/(shop)/contact/page.tsx:29-56`; `src/app/s/[storeSlug]/(checkout)/layout.tsx:33`; store creation (`src/lib/stores/actions.ts:80-94`) sets no contact email.

**Description.**
The seller's account email is their **login identifier** for the platform. Publishing it without explicit consent:
- leaks personal data (often a private address for small sellers);
- gives attackers a list of valid login usernames for credential stuffing and phishing (TND-07);
- is harvestable at scale, because every non-suspended store is listed on the landing page and `/stores` (`listPublicStores`).

**Steps to reproduce.**
1. Sign up, create a store, and leave *Settings → General → Contact email* empty.
2. Signed out, visit `/s/<new-slug>/contact`. The "Email us" card shows the seller's login email.
3. Repeat across `/stores` to collect the login emails of all sellers who never set a contact address.

**Suggested fix.**
- Remove the fallback: show no email (or a platform-relayed contact form) when `contactEmail` is null.
- Prompt the seller for a public contact email during onboarding and pre-fill it only with their explicit confirmation.
- If a fallback is kept, use a platform relay address (e.g. `store-<id>@reply.tender…`) rather than the account email.

---

### TND-09 — Unbounded anonymous data growth (carts, orders, saved checkouts, previews)

- **Bug Type:** Uncontrolled resource consumption (CWE-400, CWE-770)
- **Short Description:** These rows are created without authentication and nothing ever deletes them, so an attacker can grow the database without bound:
  - every cookie-less add-to-cart or buy-now creates a `carts` row;
  - every checkout attempt creates an `orders` row and a PaymentIntent;
  - saved checkouts live a year;
  - theme previews persist.
- **Severity:** Medium
- **CVSS 3.1:** **5.3** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L`
- **Affected code:** `src/lib/cart/session.ts:30-44` (new UUID per cookie-less request); `src/lib/cart/actions.ts:82-90, 144-162` (cart upsert); `src/lib/checkout/saved.ts:54-73`; `src/lib/theme/drafts.ts:185-189`; no cleanup job exists anywhere in the repo.

**Description.**
Sending add-to-cart without cookies in a loop inserts one cart row and one cart line per request. Over time this:
- grows storage (Supabase plan limits, backup size);
- slows the `carts` indexes on the hot path of every storefront page (`getCart` runs on every render);
- adds to the PENDING-order spam of TND-02.

**Steps to reproduce.**
1. Capture the `addToCartAction` POST for any active product.
2. Replay it 100,000 times without a `Cookie` header.
3. `SELECT count(*) FROM carts;` grows by 100,000 (and `cart_lines` likewise), and nothing ever removes the rows.

**Suggested fix.**
- Add a scheduled cleanup:
  - delete carts not updated in 30 days (matching the cookie's 30-day `maxAge`);
  - delete `theme_previews` older than a day;
  - delete `saved_checkouts` past their year;
  - cancel stale PENDING orders (TND-02).
- Rate-limit cart creation per IP (TND-07). Optionally, create the cart row only on a second interaction, or on a POST that carries a proof-of-work or Turnstile token.

---

### TND-10 — Cross-tenant disclosure of platform accounts through the Customers page

- **Bug Type:** Cross-tenant information disclosure (CWE-200, CWE-639)
- **Short Description:** `rollUpCustomers` LEFT JOINs the **platform-wide** `users` table on `lower(email)`. A seller can record a settled order under any email in their own store, and the Customers page then shows whether that email has a Tender account (`Signed in` badge) and the account holder's display name.
- **Severity:** Medium
- **CVSS 3.1:** **4.3** `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N`
- **Affected code:** `src/lib/customers/queries.ts:59-101` (join at lines 83-87); rendered in `src/app/dashboard/[storeSlug]/(admin)/customers/page.tsx` and `customers/[email]/page.tsx` (`hasAccount`, `name`).

**Description.**
The join is by email, not by the `orders.user_id` that checkout actually recorded. So the name and "has account" flag of whichever platform user owns that address are attached to any order carrying it, even a guest order the account holder never placed. A malicious seller can turn their store into an oracle:
1. Place a COD order on their own store as a guest, typing the target email.
2. Mark it paid with *Mark cash received*, which makes it settled.
3. Open *Customers*. The row shows the target's real name and whether the address is registered with Tender.

This exposes other tenants' data (sellers and buyers with accounts) and helps account-enumeration and phishing.

**Steps to reproduce.**
1. As seller A, enable COD on store A.
2. As a guest buyer on store A, check out with email `seller-b@example.com` (store B's owner) using COD.
3. As seller A, open the order and click *Mark cash received*.
4. Open *Customers*. The entry for `seller-b@example.com` is badged **Signed in** and titled with seller B's account name.

**Suggested fix.**
- Join users on the order's `user_id` (`JOIN users u ON u.id = o.user_id`) and derive `hasAccount` from `orders.user_id IS NOT NULL` within this store. Never match platform accounts by email.
- Show names only from data the buyer gave **this** store (the checkout address name), not from the global `users` row.

---

### TND-11 — Uploaded images are not content-validated before public hosting

- **Bug Type:** Unrestricted upload of file with dangerous type / Improper input validation (CWE-434, CWE-20)
- **Short Description:** Product, logo and theme uploads accept any bytes whose **client-declared** `File.type` is in `{jpeg, png, webp, avif}`. The type is stored as the object's `contentType` and the extension is derived from it. Neither the magic bytes nor a decode is checked, and the bucket is public.
- **Severity:** Medium
- **CVSS 3.1:** **4.3** `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:L/A:N`
- **Affected code:** `src/lib/products/images.ts:54-61`; `src/lib/products/constants.ts:94-109` (`imageRejectionReason`); `src/lib/stores/logo.ts:25-32`; `src/lib/theme/uploads.ts:23-30`; `scripts/setup-storage.ts:43-47` (public bucket, MIME allowlist only).

**Description.**
Any signed-in seller (anyone can sign up and create a store) can upload up to 450 KB–950 KB of arbitrary content, such as an HTML or JS polyglot, a ZIP, or malware, labelled `image/png`. It is then served from the project's Supabase Storage origin. Browsers won't render it as HTML while it carries an `image/*` type, so this is not XSS as it stands. It does enable:
- hosting malicious payloads on a trusted domain;
- image-parser attack surface in `next/image` / `sharp` and in buyers' browsers;
- content-type confusion if the storage configuration or a CDN in front ever sniffs or rewrites types.

**Steps to reproduce.**
1. As a seller, intercept the product-form Server Action and replace an image part's bytes with `<html><script>alert(1)</script></html>`, keeping `Content-Type: image/png`.
2. The upload succeeds and the public URL `…/storage/v1/object/public/product-images/<storeId>/<uuid>.png` serves the HTML bytes.

**Suggested fix.**
- On the server, check magic bytes with `file-type` and reject mismatches. Better, decode and re-encode every upload with `sharp` (strips metadata, normalises format, bounds dimensions).
- Serve user uploads from a separate cookieless domain or bucket host, and make sure `X-Content-Type-Options: nosniff` and `Content-Disposition` are set by Storage or the CDN.
- Optionally scan uploads (e.g. ClamAV) in a background job.

---

### TND-12 — Login CSRF / session fixation through token-hash confirmation links

- **Bug Type:** Cross-site request forgery on login / Session fixation (CWE-352, CWE-384)
- **Short Description:** `GET /auth/confirm` and `GET /auth/callback` call `verifyOtp({ token_hash, type })` for any `token_hash` and `type` in the URL (`signup`, `magiclink`, `email`, `recovery`, `invite`, `email_change`) and set the session cookies. An attacker can send a victim a link that silently signs them into the **attacker's** account.
- **Severity:** Medium
- **CVSS 3.1:** **4.2** `CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:L/A:N`
- **Affected code:** `src/lib/auth/confirmation.ts:50-70, 97-121`; `src/app/auth/confirm/route.ts:11-20`; `src/app/auth/callback/route.ts:11-20`.

**Description.**
The attacker obtains a valid `token_hash` for their own account: a magic link if OTP sign-in is enabled on the project, a signup confirmation for a fresh attacker account when the email template uses `{{ .TokenHash }}`, or a recovery link. They send `https://<app>/auth/confirm?token_hash=<x>&type=magiclink&next=/dashboard/new` to a victim. Opening it logs the victim into the attacker's account with no prompt, and the victim may then:
- create a store, add products, or start Stripe onboarding with their identity or bank details under an account the attacker controls;
- save checkout details that the attacker can later read.

AC is High because the token must be fresh (short expiry) and the project must issue token-hash links.

**Steps to reproduce.**
1. Configure the project's magic-link or confirmation template to use `{{ .TokenHash }}` (the code explicitly supports this shape).
2. As the attacker, request a magic link or OTP for `attacker@x.com` and copy the `token_hash` from the email.
3. Send the victim `/auth/confirm?token_hash=<hash>&type=magiclink&next=/dashboard`.
4. The victim opens it and is now signed in as `attacker@x.com` on the dashboard.

**Suggested fix.**
- Don't verify on GET. Render an interstitial ("Continue as attacker@x.com?") that POSTs the token_hash with a CSRF token, and show which account is being signed into.
- If the browser already holds a different session, refuse or ask for explicit confirmation.
- Prefer the PKCE `code` flow, which is bound to the originating browser's code-verifier cookie, for magic links and recovery. Narrow `EMAIL_OTP_TYPES` to the types the app actually uses (likely just `signup` and `email`).

---

### TND-13 — Settlement does not verify the application fee or PaymentIntent provenance

- **Bug Type:** Payment integrity / Improper verification (CWE-345)
- **Short Description:** `markOrderPaid` locates the order by `stripePaymentIntentId`, or by `metadata.tender_order_id` while the order's PI id is still null. `paymentMismatch` then checks only account, amount and currency. It does not check `application_fee_amount` or that the PaymentIntent is the one the platform created.
- **Severity:** Low
- **CVSS 3.1:** **3.1** `CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:N/I:L/A:N`
- **Affected code:** `src/lib/payments/settle.ts:207-226` (metadata fallback), `231-280`; `src/lib/payments/rules.ts:274-283`; `src/lib/payments/webhooks.ts:79-84`.

**Description.**
Sellers have full-dashboard Standard connected accounts and can create their own PaymentIntents. During the window between the order row being inserted (`orders.ts:246`) and its PI id being stored (`orders.ts:331-334`), a seller acting as their own buyer could do the following:
1. Create a PI on their account for the same amount and currency with `metadata.tender_order_id = <order id>` (readable from their own `tender_last_order` cookie) and **no `application_fee_amount`**.
2. Pay it.

The signed webhook settles the order and the platform collects no commission. The window is short, so the attack is a race (AC:H). The cross-store case is correctly blocked by the account check.

Related business-model gap (not a vulnerability as such): COD orders record `platformFeeCents` as "owed by the seller", but nothing enforces collection, so commission can be avoided by steering buyers to COD.

**Steps to reproduce.**
1. As a seller with a connected Stripe account, act as a buyer on your own store and start a card checkout; read the order id from your `tender_last_order` cookie.
2. Before `placeOrder` stores the PI id (or by stalling the request, e.g. by dropping the response of the first PI create so the order row keeps `stripe_payment_intent_id = NULL`), create a PaymentIntent on your account with `amount` and `currency` equal to the order total, `metadata[tender_order_id]=<order id>`, and no `application_fee_amount`, then confirm it with a test card.
3. The `payment_intent.succeeded` webhook finds the order through the metadata fallback, `paymentMismatch` passes, and the order becomes PAID with no application fee collected.

**Suggested fix.**
- In `paymentMismatch`, also compare `intent.application_fee_amount` with `order.platformFeeCents`. Require `order.stripePaymentIntentId === intent.id`, and drop the metadata-only fallback, or allow it only for a PI id the platform recorded when it created the intent (e.g. persist the id from the idempotent create before returning, inside the same request).
- Reconcile platform fees periodically against `application_fees` in Stripe.

---

### TND-14 — Sign-up returns raw Supabase error messages (account enumeration)

- **Bug Type:** Observable discrepancy / Account enumeration (CWE-204)
- **Short Description:** `signUpAction` returns `error.message` verbatim. Depending on project settings (email confirmation off, or certain error paths), that can be "User already registered", which reveals that an address has an account.
- **Severity:** Low
- **CVSS 3.1:** **3.7** `CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N`
- **Affected code:** `src/lib/auth/actions.ts:90`.

**Description.**
`signInAction` deliberately avoids enumeration (line 158-160), but sign-up passes Supabase's message through unchanged. With confirmation disabled, or for some error codes such as weak-password or rate-limit wording, the response distinguishes existing accounts and leaks internal configuration.

**Steps to reproduce.**
1. On a project with *Confirm email* disabled, submit `/signup` with an email that already has an account.
2. The form shows Supabase's "User already registered".

**Suggested fix.** Map Supabase error codes to generic messages, e.g. "If this email can be used, we've sent a link". Keep specific wording only for validation errors the user must fix, such as password policy, and log the original error server-side.

---

### TND-15 — `next/image` optimizer allowlist is broader than needed

- **Bug Type:** Resource abuse / SSRF-adjacent proxying (CWE-400)
- **Short Description:** `images.remotePatterns` allows every path on `upload.wikimedia.org`, `live.staticflickr.com` and `pd.w.org`, plus every **public bucket** under the Supabase project (`/storage/v1/object/public/**`). `/_next/image` can be used to fetch, resize and cache arbitrary large images from those hosts at the platform's expense.
- **Severity:** Low
- **CVSS 3.1:** **3.7** `CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:L`
- **Affected code:** `next.config.ts:65-85`.

**Description.**
Seed photos from Wikimedia are mirrored into Supabase Storage (`prisma/seed.ts:104`), so the Wikimedia entry (and possibly Flickr and pd.w.org) may no longer be needed at runtime. Each unique `url` × `w` × `q` combination costs a fetch plus a `sharp` resize and fills the image cache. An attacker iterating many distinct, multi-megabyte Wikimedia originals can drive CPU and bandwidth cost. AC is High because results are cached, so the attack needs many distinct sources.

**Steps to reproduce.** Request `/_next/image?url=https%3A%2F%2Fupload.wikimedia.org%2F<any large original>&w=3840&q=75` for many different originals and observe server CPU and egress.

**Suggested fix.**
- Remove hosts no longer used at runtime, or narrow them with `pathname` patterns.
- Restrict the Supabase pattern to `/storage/v1/object/public/product-images/**`.
- Set `images.qualities` and `images.deviceSizes` to the minimum needed, and consider `minimumCacheTTL`.
- Rate-limit `/_next/image` at the CDN/WAF.

---

### TND-16 — Incomplete security headers (CSP, HSTS)

- **Bug Type:** Security misconfiguration / Missing defense in depth (CWE-693, CWE-1021)
- **Short Description:** The CSP contains only `frame-ancestors 'self'`. It has no `script-src`, `object-src`, `base-uri` or `form-action`, and HSTS (`max-age=63072000`) lacks `includeSubDomains` / `preload`.
- **Severity:** Informational
- **CVSS 3.1:** **0.0** (hardening; no exploitable XSS was found)
- **Affected code:** `next.config.ts:39-49`.

**Description.** Seller-controlled content is rendered on the same origin as authentication and the admin. React escaping currently prevents XSS, but a strict CSP is the safety net for any future sink, dependency bug or misconfiguration. Without `includeSubDomains`, the `admin.` subdomain relies on its own HSTS response.

**Steps to reproduce.** `curl -sI https://<app>/ | grep -i -E "content-security|strict-transport"`.

**Suggested fix.**
- Add a nonce-based CSP from `proxy.ts`: `script-src 'nonce-…' 'strict-dynamic' https://js.stripe.com`; `frame-src https://js.stripe.com https://hooks.stripe.com`; `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com`; `object-src 'none'; base-uri 'none'; form-action 'self'`.
- Start in `Content-Security-Policy-Report-Only`.
- Set HSTS to `max-age=63072000; includeSubDomains; preload` once every subdomain is HTTPS.

---

### TND-17 — Latent privilege escalation: STAFF can change payment-adjacent settings

- **Bug Type:** Improper authorization (latent) (CWE-285)
- **Short Description:** Stripe onboarding is OWNER-only (`canManagePayments`). The other payment-adjacent settings only require membership, so a STAFF member can:
  - enable cash on delivery, which also promotes a PENDING store to ACTIVE;
  - change COD fees and limits;
  - change the store currency and the public contact email;
  - edit checkout settings;
  - publish the theme.
- **Severity:** Informational (today); **4.3** `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:L/A:N` once staff membership can be created.
- **CVSS 3.1:** **0.0** today, because no code path creates STAFF members. Only the seed writes `store_members`.
- **Affected code:** `src/lib/stores/actions.ts:159-292` (`updateStoreSettingsAction`, `updateCheckoutSettingsAction`, `updateCodSettingsAction`: `getStoreContext` only); `src/lib/stores/policy.ts:100-128`; also all product, discount, shipping and order actions.

**Description.** The `StoreMemberRole.STAFF` value and role predicates exist, so a staff-invite feature is clearly planned. When it ships, staff would be able to open a store for trading, change how and where buyers pay (COD), and redirect buyer contact, without owner approval.

**Steps to reproduce.** Not reproducible without a staff membership. Insert a `store_members` row with `role = 'STAFF'`, sign in as that user, and POST to Settings → Payments → Cash on delivery: the store's `cod_enabled` flips and `status` moves PENDING → ACTIVE.

**Suggested fix.** Before shipping staff invites, introduce explicit permission predicates (e.g. `canManageStoreSettings`, `canManagePaymentsSettings` = OWNER) and enforce them in every settings action and page. Add tests that assert STAFF is refused.

---

### TND-18 — Unvalidated UUID route params cause unhandled database errors

- **Bug Type:** Improper input validation / Improper error handling (CWE-20, CWE-755)
- **Short Description:** `products/[productId]` passes the raw path segment to `getStoreProduct`, as do `updateProductAction` and `deleteProductAction` through bound args, without `isUuid`. Postgres raises `invalid input syntax for type uuid`, so the request returns a 500 instead of a 404.
- **Severity:** Informational
- **CVSS 3.1:** **0.0**
- **Affected code:** `src/app/dashboard/[storeSlug]/(admin)/products/[productId]/page.tsx:21,36`; `src/lib/products/queries.ts:213-222`; `src/lib/products/actions.ts:227,437`.

**Description.** Other id-bearing routes guard with `isUuid` (orders, discounts, collections, shipping). This one doesn't. The impact is noisy 500s and error-log pollution for members; production hides the message (`error.tsx` shows only the digest).

**Steps to reproduce.** Signed in as a member, open `/dashboard/<slug>/products/not-a-uuid`: you get the "Something went wrong" page rather than 404.

**Suggested fix.** Add `if (!isUuid(productId)) return null;` in `getStoreProduct`, matching `getStoreOrder`.

---

### TND-19 — Host-header-derived Stripe onboarding URLs when `NEXT_PUBLIC_APP_URL` is unset

- **Bug Type:** Host header trust (CWE-644)
- **Short Description:** `adminAbsoluteUrl` falls back to `x-forwarded-proto` and `x-forwarded-host`/`host` to build Stripe's `refresh_url`/`return_url` when `NEXT_PUBLIC_APP_URL` is not set.
- **Severity:** Informational
- **CVSS 3.1:** **0.0** (only reachable with the env var missing, and only by the owner's own request)
- **Affected code:** `src/lib/payments/accounts.ts:200-211`; `src/lib/admin/host.ts:125-131`.

**Description.** In a misconfigured deployment, a request with a spoofed `X-Forwarded-Host` would make Stripe send the owner back to an attacker host after onboarding. Exploitation needs the owner's browser to send the spoofed header, which is not practical, but it is a fragile default.

**Steps to reproduce.** With `NEXT_PUBLIC_APP_URL` unset and the subdomain split off, send the owner's authenticated `GET /dashboard/<slug>/settings/payments/refresh` with `X-Forwarded-Host: evil.example`. The Account Link Stripe returns has `return_url`/`refresh_url` on `http://evil.example/…`.

**Suggested fix.** Require `NEXT_PUBLIC_APP_URL` in production (fail at startup) and never build absolute URLs from request headers. Make sure the hosting proxy overwrites `X-Forwarded-Host`.

---

### TND-20 — Search wildcards are not escaped

- **Bug Type:** Improper neutralisation of wildcards (CWE-155)
- **Short Description:** Search terms go into Prisma `contains` with `mode: "insensitive"`, which compiles to `ILIKE '%term%'` without escaping `%` and `_`.
- **Severity:** Informational
- **CVSS 3.1:** **0.0**
- **Affected code:** `src/lib/products/queries.ts:84-128`; `src/lib/products/search.ts:8-26`.

**Description.** `q=%` or `_` matches every product. Only ACTIVE products of one store are searched, and cost is bounded (100 characters, 8 terms, 120 candidate rows; Postgres LIKE is non-exponential), so this is a correctness issue that adds to unthrottled load (TND-07) rather than a vulnerability.

**Steps to reproduce.** Request `/s/<slug>/search?q=%25` (or `/s/<slug>/search/suggestions?q=_`). Every published product is returned, although no title contains a literal `%` or `_`.

**Suggested fix.** Escape `\`, `%` and `_` in each term before passing it to `contains`, or move to Postgres full-text search with `websearch_to_tsquery`.

---

### TND-21 — Tenant isolation relies solely on application code running as the DB owner

- **Bug Type:** Defense in depth / Least privilege (CWE-250)
- **Short Description:** Prisma connects with `DATABASE_URL` as `postgres`, the table owner, which bypasses RLS. Every module uses the unscoped `rootDb`, so isolation depends on every query remembering `storeId`.
- **Severity:** Informational
- **CVSS 3.1:** **0.0**
- **Affected code:** `src/lib/db/root.ts`; `src/lib/stores/context.ts:18-20` (planned scoped-client extension not yet implemented); `prisma/migrations/20260827080543_revoke_data_api_access/migration.sql:56-60`.

**Description.** The review found every query correctly scoped. But a single future omission, or any injection bug, would expose all tenants' data with owner privileges (DDL included).

**Steps to reproduce.** Not exploitable today. To demonstrate the missing backstop, remove the `storeId` filter from any query (e.g. `getStoreOrder`) in a local build: another store's order opens in the admin, and the database does not block it, because the owner role bypasses RLS.

**Suggested fix.**
- Run the app as a dedicated non-owner role with only DML grants, and keep `postgres` for migrations.
- Implement the planned Prisma client extension that injects `storeId` into queries on tenant-scoped models.
- Optionally add RLS policies keyed on `current_setting('app.store_id')` with `FORCE ROW LEVEL SECURITY`.
- Add an ESLint rule forbidding `rootDb` imports outside approved modules.

---

## 5. Data flows traced and verified safe (cross-file analysis)

| # | Source → Sink | Controls verified |
|---|---|---|
| 1 | `variantId` (form) → `cart_lines` → `orders` | `isUuid`. `purchasableVariant` filters `{ id, storeId, product.status: ACTIVE }` (`cart/actions.ts:44-67`). Line ops are scoped `cart: { storeId, sessionId }` (`:306-309`). `getCart` re-filters `variant.storeId` (`cart/queries.ts:111`). `placeOrder` re-reads variants by `storeId` in the transaction and rejects price, status or stock changes (`checkout/orders.ts:181-213`). |
| 2 | Prices / totals → Stripe amount | Totals are computed only server-side (`quoteCheckout`). The client's `expectedTotal` is only compared (`orders.ts:167`). PI amount = `order.totalCents`. Fee clamped (`money.ts:52-60`). |
| 3 | Shipping rate id (form) → order | `isUuid`. `findFirst({ id, storeId })` (`checkout/actions.ts:82-87`). Quote re-validates zone and eligibility. Transaction re-checks `{id, storeId, zoneId, priceCents}` (`orders.ts:230-236`). |
| 4 | Discount ids / codes → redemption | Code lookup by `storeId_code`. `redeemDiscounts` is conditional on `usageCount < usageLimit` under a row lock, in a fixed lock order (`redemption.ts:52-91`). Admin target ids are filtered to the store (`discounts/actions.ts:28-78`). |
| 5 | Theme JSON (editor) → DB → storefront HTML | Size cap. Strict zod envelope. Settings: hex colours, select enums, `http(s)` links, `https` images restricted to `<storeId>/` with `..` rejected (`theme/validate.ts:55-63`). Foreign collection ids rejected (`theme/drafts.ts:221-253`). Rendered with React escaping. `next/image` allowlist. External buttons get `rel="noopener noreferrer"`. No `dangerouslySetInnerHTML` anywhere in `src/`. |
| 6 | Stripe webhook body → order state | Raw-body signature verification (`api/webhooks/stripe/route.ts:24-32`). Livemode check. Dedup table. `paymentMismatch` account check prevents cross-store settlement. All transitions are conditional `updateMany` on status and method (`settle.ts`). |
| 7 | Return from Stripe (`payment_intent`, `client_secret`) → confirmation page | `pi_` regex. Order scoped by store. Client secret compared with `timingSafeEqual` (`checkout/payment.ts:99-132`). Only order number and status shown. |
| 8 | Raw SQL | Only tagged-template `$queryRaw` with bound parameters and `Prisma.join`/`Prisma.sql` fragments (`discounts/queries.ts:241-248`, `customers/queries.ts:63-90, 204-207`). No `$queryRawUnsafe`/`$executeRawUnsafe` in app code. |
| 9 | `next` (query / form) → redirect | `safeRedirectPath` rejects non-`/`, `//`, `\`, control characters, and anything that resolves off-origin (`auth/redirect.ts`). |
| 10 | `Host` / `X-Forwarded-Host` → cross-host redirect | Only selects the routing branch. Targets come from env-derived origins (`admin/host-redirect.ts:50-62`). |
| 11 | Cookies `tender_cart`, `tender_last_order`, `tender_saved_checkout`, `tender_locale`, `tender-appearance` | UUID / allowlist validation. Cart, order and saved-checkout lookups are always scoped by `storeId`. httpOnly, `SameSite=Lax`, `Secure` in production. |
| 12 | Admin Server Action bound args (`storeSlug`, ids) | Bound args are client-tamperable. Every action re-resolves `getStoreContext(slug)` (membership) and scopes ids by `storeId`. Every `/dashboard/[storeSlug]` page and layout calls `getStoreContext`. |
| 13 | Uploads → Storage paths | Path = `<verified storeId>/<server UUID>.<ext from allowlisted MIME>`. Deletion uses only URLs from DB rows, and `storagePathFromPublicUrl` enforces origin and bucket (`products/constants.ts:119-140`). |
| 14 | `postMessage` editor ⇄ preview | Both sides check `event.origin === location.origin` and `event.source` and validate the message shape (`theme/preview-bridge.tsx:36-38`, `lib/theme/preview.ts:46-60`). |
| 15 | Supabase Data API / Realtime | Grants revoked from `anon`/`authenticated` plus deny-all RLS on every table. The Realtime broadcast policy allows SELECT only for store members through a SECURITY DEFINER function with `search_path=''`. The trigger payload has no PII. |
| 16 | Secrets | Only `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and app-URL vars are public. The service-role and Stripe secret are server-only (`server-only` imports). `.env` is gitignored, and a git-history scan for Stripe, Supabase, Resend and DB secrets found nothing. |
| 17 | Auth session | `getUser()` (JWT verified with Supabase) used for authorization; never `getSession()`. The proxy is explicitly not an auth boundary. |
| 18 | Framework versions | `next@16.3.0`, `react@19.2.8`: past the React Server Components RCE fixes (React ≥ 19.2.1 / Next ≥ 16.0.7) and the middleware-bypass (CVE-2025-29927) range. Authorization doesn't rely on `proxy.ts` anyway. |

## 6. Positive controls observed

- **Tenancy:** the tenant is resolved from slug + session in one function, non-members get 404s, and every write carries `storeId` in its `where` as well.
- **Defensive coding:** ids echoed back by forms are re-checked against owned rows before use (products, variants, images, collections, discounts).
- **Database backstops:** CHECK constraints enforce money, discount and theme invariants at the database level, and checkout drafts are size-capped (16 KB).
- **Idempotency:** settlement and cancellation are conditional moves; Stripe calls use idempotency keys.
- **Platform defaults:** `server-only` guards on privileged modules; no XSS sinks; strict theme schema; `next/image` host allowlist; clickjacking protection (`frame-ancestors 'self'`, `X-Frame-Options`); `nosniff`; Referrer-Policy; Permissions-Policy.
- **Auth:** sign-in avoids user enumeration, and confirmation types are narrowed against an allowlist.

## 7. Recommended next steps (priority order)

1. **TND-03:** rotate or delete the seeded Auth users on the hosted Supabase project now, and remove the password from the README.
2. **TND-01 / TND-02 / TND-09:** add a rate limiter and Turnstile to checkout and cart, a stale-order and cart cleanup cron, and COD verification or reservation.
3. **TND-08 / TND-10:** stop publishing owner emails, and stop joining `users` by email.
4. **TND-04 / TND-05 / TND-06:** require verified identity for customer-restricted discounts, and make code responses uniform.
5. **TND-07 / TND-12 / TND-14:** auth throttling, a POST-confirm interstitial, and generic sign-up errors. Review Supabase *Auth → Rate Limits* and use a custom SMTP.
6. **TND-11 / TND-13 / TND-15 / TND-16:** upload re-encoding, a fee check in `paymentMismatch`, a narrower image allowlist, and a nonce CSP.
7. **TND-17 / TND-18 / TND-21:** owner-only predicates before staff invites, a UUID guard, and a least-privilege DB role.
8. Run `npm audit --omit=dev` (or Dependabot / `osv-scanner`) in CI. Dependency CVEs beyond the framework checks in §5 were not assessed offline.
