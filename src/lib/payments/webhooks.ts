import "server-only";

import type Stripe from "stripe";

import { rootDb } from "@/lib/db/root";
import { isStripeTestMode } from "@/lib/stripe/server";
import { disconnectAccount, retrieveAccount, syncStoreFromAccount } from "./accounts";
import {
  accountReadiness,
  disputeStillOpen,
  eventSignalsCardActive,
  ORDER_METADATA_KEY,
} from "./rules";
import {
  cancelUnpaidOrder,
  findOrderForIntent,
  findOrderForPaymentIntentId,
  markOrderPaid,
  recordRefund,
  setOrderDisputed,
} from "./settle";

/**
 * Events from connected accounts — the only ones Tender acts on, since charges
 * are direct and every PaymentIntent lives on a seller's account.
 *
 * Every handler is safe to run twice: account syncs overwrite with Stripe's
 * current state, order moves are conditional on the order still being
 * PENDING (see `settle.ts`), and refunds and disputes are conditional on what
 * the order already records. The `WebhookEvent` row is a record of what was
 * handled and a cheap early exit for redeliveries — not the lock. It is
 * written after the handler succeeds, so an event that failed halfway is
 * retried by Stripe in full rather than skipped.
 */
export async function handleConnectEvent(event: Stripe.Event): Promise<void> {
  // A live-mode platform endpoint receives its test-mode events too.
  if (event.livemode === isStripeTestMode()) return;

  const seen = await rootDb.webhookEvent.findUnique({
    where: { stripeEventId: event.id },
    select: { id: true },
  });
  if (seen) return;

  const accountId = event.account ?? null;
  const handled = await dispatch(event, accountId);
  if (!handled) return;

  await rootDb.webhookEvent.createMany({
    data: [{ stripeEventId: event.id, type: event.type, accountId }],
    skipDuplicates: true,
  });
}

/** True when the event concerned Tender and was acted on. */
async function dispatch(event: Stripe.Event, accountId: string | null): Promise<boolean> {
  switch (event.type) {
    case "account.updated":
    case "capability.updated": {
      // Either can be the one that says card payments just switched on —
      // `capability.updated` is the one Stripe sends when a capability
      // becomes active. Events arrive out of order, so neither payload is
      // trusted: the account as it is now beats whichever event landed last.
      const id = accountId ?? (event.type === "account.updated" ? event.data.object.id : null);
      if (!id) return false;
      let account = await retrieveAccount(id);
      if (!account) return false;

      // The v2 read can trail the event by a few seconds. When the event says
      // card payments just went live, give the read a moment to catch up;
      // failing that, throw — a 500 makes Stripe deliver the event again
      // later, where marking it handled would leave the store closed.
      if (eventSignalsCardActive(event)) {
        for (let attempt = 0; attempt < 3 && !accountReadiness(account).chargesEnabled; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 2_000));
          account = (await retrieveAccount(id)) ?? account;
        }
        if (!accountReadiness(account).chargesEnabled) {
          throw new Error(`Account ${id} is not active in Accounts v2 yet; leaving ${event.id} for Stripe to redeliver.`);
        }
      }

      return (await syncStoreFromAccount(account)) !== null;
    }

    case "account.application.deauthorized": {
      if (!accountId) return false;
      await disconnectAccount(accountId);
      return true;
    }

    case "payment_intent.succeeded": {
      const intent = event.data.object;
      if (!isTenderPayment(intent)) return false;
      const result = await markOrderPaid(intent, accountId);
      return result === "settled" || result === "already";
    }

    case "payment_intent.canceled": {
      const intent = event.data.object;
      if (!isTenderPayment(intent)) return false;
      // Found the same way a success is, so a PaymentIntent cancelled before
      // the order learned its id still releases that order's discount uses.
      const order = await findOrderForIntent(intent);
      if (!order || !accountId || order.stripeAccountId !== accountId) return false;
      await rootDb.$transaction((tx) => cancelUnpaidOrder(tx, order));
      return true;
    }

    case "payment_intent.payment_failed": {
      // The order stays PENDING: the buyer is still on the checkout and can
      // try another card against the same PaymentIntent.
      return false;
    }

    case "charge.refunded": {
      // Refunds are made in the seller's Stripe Dashboard. The charge carries
      // its refunded total so far, which is all `recordRefund` needs — events
      // for two partial refunds can arrive in either order.
      const charge = event.data.object;
      const order = await orderForCharge(charge.payment_intent, accountId);
      if (!order) return false;
      await rootDb.$transaction((tx) => recordRefund(tx, order, charge.amount_refunded));
      return true;
    }

    case "charge.dispute.created":
    case "charge.dispute.closed": {
      const dispute = event.data.object;
      const order = await orderForCharge(dispute.payment_intent, accountId);
      if (!order) return false;
      const disputed =
        event.type === "charge.dispute.created" || disputeStillOpen(dispute.status);
      await rootDb.$transaction((tx) => setOrderDisputed(tx, order, disputed));
      return true;
    }

    default:
      return false;
  }
}

/**
 * The Tender order behind a charge or dispute on a connected account, by the
 * PaymentIntent it names. Payments the seller took elsewhere match none.
 */
async function orderForCharge(
  paymentIntent: string | Stripe.PaymentIntent | null,
  accountId: string | null,
) {
  const id = typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id;
  if (!id || !accountId) return null;
  return findOrderForPaymentIntentId(id, accountId);
}

/**
 * Connect delivers every event on the seller's account, including payments
 * they take elsewhere. Only PaymentIntents Tender created carry an order id.
 */
function isTenderPayment(intent: Stripe.PaymentIntent): boolean {
  return typeof intent.metadata?.[ORDER_METADATA_KEY] === "string";
}
