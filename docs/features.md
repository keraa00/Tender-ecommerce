# Features

Everything Tender does today, surface by surface. The README has the
[short version](../README.md#features); how it is built is in
[architecture.md](architecture.md).

Paths below are as they run in single-host mode (local development and the
`*.vercel.app` demo). With a custom domain the seller admin moves from
`/dashboard/<slug>` to `admin.<host>/<slug>`.

- [Platform](#platform)
- [Accounts](#accounts)
- [Storefront](#storefront)
- [Cart and checkout](#cart-and-checkout)
- [Seller admin](#seller-admin)
- [Operations](#operations)
- [Seed data](#seed-data)

---

## Platform

| | |
|---|---|
| Landing | Lists the stores a platform admin has featured at `/` and `/stores` — a new store is not featured until one chooses it. `/terms` and `/privacy`, and a demo notice while `SITE.demo` is on (`src/lib/site.ts`). Light and dark mode |
| Store creation | `/dashboard/new` — slug validation with live availability checking |
| Platform admin | `/dashboard/platform`, platform admins only (404 for anyone else) — every store with its owner, status and counts; feature a store on the landing page, or suspend it (storefront and checkout offline, nothing deleted) and lift the suspension |
| Languages | Storefront and seller admin each in 12 languages — English, Arabic (right-to-left), Bosnian, Chinese, French, German, Italian, Japanese, Portuguese, Russian, Spanish and Turkish — chosen separately, so browsing a shop in German leaves the admin as it was. Only Tender's own copy is translated; product titles and descriptions are the seller's words and are shown as written (`src/lib/i18n/locales.ts`) |

## Accounts

| | |
|---|---|
| Auth | Email/password via Supabase Auth, with both email-confirmation callback shapes wired, and "Forgot your password?" — a reset link that signs you in for 15 minutes to choose a new one |
| Profile | `/dashboard/account` — name, and changing the sign-in email (confirmed by link before it takes effect) |
| Security | Change the password (current one required; every other device is signed out) and see where you're signed in — browser and system, last active — with sign-out per device or everywhere else |
| Data & privacy | Download everything kept about you as JSON, and delete the account (current password plus typing your email; blocked while you still own a store) |

Account settings are reached from the header's account menu, the store list,
and the email at the foot of the admin drawer.

## Storefront

| | |
|---|---|
| Storefronts | `/s/<slug>` — branded per store and priced in each store's own currency: home, catalogue, collections, search, product pages and a contact page |
| Themes | Each store's look is a theme of sections — header, hero, featured collections, product grid, image with text, rich text, footer — with its own accent colour and fonts, edited in the seller admin (see [Online store](#seller-admin)) |
| Buy it now | On every product page: checks out that one option and quantity from a cart of its own, so the buyer's cart is still there afterwards |

## Cart and checkout

| | |
|---|---|
| Discounts in the cart | Automatic discounts and codes priced live in the cart drawer, cart page and checkout |
| One-page checkout | Shopify-style, under its own pared-down header: contact (with the optional marketing opt-in), delivery — a country select of only the countries the store ships to, named in the buyer's language, then address fields that follow the country (labels, region lists, postal-code formats for 30+ countries) — shipping method, billing address, payment and the order summary, which folds into a bar on phones |
| Server-side pricing | Every change is saved on the cart and re-priced on the server, so a refresh loses nothing and the server's total is the only one |
| Card payments | Stripe's **Payment Element**, embedded in the page and themed to the store. "Pay now" places the order — line, discount, address and rate snapshots, commission on the discounted total, usage limits enforced and the rate re-checked in the order transaction — creates its PaymentIntent on the seller's Stripe account, and confirms it in place (3-D Secure included). The order turns **Paid** — stock taken, cart emptied — when the payment succeeds; a declined card leaves the cart and the order for another try. An order discounts bring to zero is placed paid without Stripe |
| Cash on delivery | Offered beside Stripe, or instead of it — a store with COD on can trade without a Stripe account, which is how a seller where Stripe takes no merchants sells at all. Its fee is priced on the server like everything else (a percentage is of goods and shipping after discounts), and the option explains itself when this order's country or total rules it out. Only for orders that are delivered. A COD order takes its stock and empties the cart when placed, alerts the seller at once, and stays **Payment on delivery** until the seller marks it paid — or cancels it, which restocks it and gives its discount uses back. Commission is recorded on each COD order and billed to the seller separately: no part of the cash passes through Stripe |
| Shipping | The chosen rate is charged; a free-shipping discount takes exactly that rate off. Rates are judged on the subtotal after item discounts and on the weight of what ships. A cart of digital products skips delivery entirely. A store that ships nowhere can still sell those, and says so for anything else |
| Saved details | "Save my information for next time" keeps the buyer's email, addresses and way of paying for that store in that browser (server-side, behind an httpOnly cookie), so their next checkout opens filled in and priced; unticking it forgets them at once |
| Confirmation | Placing an order dims the page under a spinner, then a green tick draws itself before the thank-you page. The confirmation page reads the payment from Stripe — paid, processing, or failed with a way back to try again — and shows the delivery details |

## Seller admin

`/dashboard/<slug>`, store members only (404 for anyone else), with a left
drawer.

| | |
|---|---|
| Home | Products, orders, revenue and the seller's earnings after commission, and a setup checklist of what is left before the store can take orders. A live count of new orders sits beside Orders in the drawer — paid orders arrive over Supabase Realtime without a reload |
| Orders | List, and a page per order with its lines, totals, commission, discounts, customer, shipping address and method, billing address, note and a link to the payment in the seller's Stripe Dashboard. **Mark as fulfilled** once a paid order is sent. Refunds and disputes are made in the seller's Stripe Dashboard and come back by webhook: a full refund of an order not yet sent cancels and restocks it, a partial one shows on the order and comes off analytics, and a dispute flags the order until it is won |
| Products | Create, edit and delete products with variants and uploaded photos; draft / published / archived; a weight per option (kg in, integer grams stored) and a "requires shipping" flag for digital products and services |
| Collections | Group products so buyers can browse by theme, each with a cover image |
| Customers | Everyone who has bought from the store, with what they have spent; search, sort and filter by the same segments discounts target (loyal, lapsed, signed in). Every filtered view is a shareable URL |
| Discounts | Codes and automatic discounts: percentage, fixed amount, buy X get Y, free shipping; whole order, products or collections; minimum spend or quantity; all customers, segments or named customers; total and per-customer limits; schedule; on/off; stacking. The pricing engine is pure and tested |
| Analytics | Settled orders over the last 30 days — revenue, orders, average order, the seller's earnings after commission — best sellers by revenue after discounts, and an all-time summary |
| Online store | The theme editor: add, reorder and configure sections, set the accent colour and fonts, preview the storefront live, undo and redo. Changes are saved as a draft and go live when published |
| Settings → General | Logo, the store's currency (two-decimal currencies only; locked once the store has an order) and a customer contact email — buyers see none until one is set; the email the owner signs in with is never shown |
| Settings → Payments | Pick the business's country and connect a Stripe account (Accounts v2) through Stripe-hosted onboarding, continue an unfinished setup, and see whether charges and payouts are enabled — read live from Stripe on every visit. **Cash on delivery**: on/off, the name buyers see, instructions, a fixed or percentage fee, an optional order-total range, the shipping countries it is offered for and whether it requires a phone number |
| Settings → Shipping | Zones of countries, optionally narrowed to states or provinces, one zone per country, an optional rest-of-world zone, and rates per zone — price, delivery estimate, and an optional order-price or weight range — with "You ship to N countries" |
| Settings → Checkout | Phone, company, first name, address line 2, marketing opt-in and order note |
| Closing a store | Settings → General, owner only: deletes the store with its products, orders and images after the slug is typed out and the owner's current password given. Blocked while a paid order is unfulfilled or cash on delivery is uncollected; unpaid Stripe checkouts are cancelled first. The seller's Stripe account is theirs and is left alone |

## Operations

| | |
|---|---|
| Housekeeping | A daily Vercel Cron sweep (`/api/cron/sweep`, behind `CRON_SECRET`) resolves card checkouts left unpaid for a day — cancelling them and giving their discount uses back, or settling them if the money did arrive — and deletes abandoned carts, stale saved checkouts, editor previews and old webhook records |
| Webhooks | One signature-verified endpoint for connected-account events (`/api/webhooks/stripe`): onboarding status, payment outcomes, refunds and disputes; replays are harmless |

## Seed data

`npm run db:seed` (idempotent) creates seven fully stocked demo stores, each in
its own currency (USD, EUR, GBP, AUD, CAD, BAM, CHF), and thirteen lighter
showcase stores — with variants, collections, discounts, shipping zones with
domestic and international rates, cash on delivery in five home countries, and
about a year of orders. Details and the demo accounts are in
[setup.md](setup.md#migrate-and-seed).
