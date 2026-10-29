import "server-only";

import type Stripe from "stripe";

import { rootDb } from "@/lib/db/root";
import { isStripeTestMode } from "@/lib/stripe/server";
import { disconnectAccount, retrieveAccount, syncStoreFromAccount } from "./accounts";
import { accountReadiness, eventSignalsCardActive, ORDER_METADATA_KEY } from "./rules";
import { cancelUnpaidOrder, findOrderForIntent, markOrderPaid } from "./settle";

/**
 * Events from connected accounts — the only ones Tender acts on, since charges
 * are direct and every PaymentIntent lives on a seller's account.
 *
 * Every handler is safe to run twice: account syncs overwrite with Stripe's
 * current state, and order moves are conditional on the order still being
 * PENDING (see `settle.ts`). The `WebhookEvent` row is a record of what was
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

    default:
      return false;
  }
}

/**
 * Connect delivers every event on the seller's account, including payments
 * they take elsewhere. Only PaymentIntents Tender created carry an order id.
 */
function isTenderPayment(intent: Stripe.PaymentIntent): boolean {
  return typeof intent.metadata?.[ORDER_METADATA_KEY] === "string";
}
