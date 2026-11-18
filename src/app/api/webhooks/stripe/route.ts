import type Stripe from "stripe";

import { handleConnectEvent } from "@/lib/payments/webhooks";
import { getStripe } from "@/lib/stripe/server";

/**
 * Stripe → Tender, for events from connected accounts. Registered in Stripe
 * with "Events from: Connected accounts"; locally, `stripe listen
 * --events-from @accounts --events … --forward-connect-to
 * localhost:3000/api/webhooks/stripe` (docs/setup.md → Payments).
 *
 * The body is read raw: the signature is over the exact bytes Stripe sent,
 * and parsing then re-serialising JSON would not reproduce them.
 *
 * A 500 makes Stripe retry with backoff, which is what a database blip should
 * get. A bad signature is a 400 — retrying a forgery will not fix it.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    return new Response("Stripe webhooks are not configured.", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing Stripe-Signature.", { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return new Response("Invalid signature.", { status: 400 });
  }

  try {
    await handleConnectEvent(event);
  } catch (error) {
    console.error(`Stripe webhook ${event.type} (${event.id}) failed`, error);
    return new Response("Handler failed.", { status: 500 });
  }

  return new Response(null, { status: 200 });
}
