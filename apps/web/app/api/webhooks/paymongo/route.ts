import { getDb } from "@rr/db";
import {
  type CheckoutSession,
  CHECKOUT_SESSION_PAID,
  getWebhookEnv,
  parseCheckoutSession,
  parseWebhookEvent,
  SIGNATURE_HEADER,
  verifyWebhookSignature,
  type WebhookEvent,
} from "@rr/payments";
import { confirmPayment, logError } from "@/lib/registration/confirm";

/**
 * PayMongo's signed webhook (test mode). It records a paid checkout session through the same
 * `confirmPayment()` as the success page, so a runner who closes the tab before the redirect is
 * still confirmed. Nothing is trusted before the signature on the raw body checks out, and an
 * unsigned request never reaches the database.
 *
 * PayMongo retries any non-2xx. A verified delivery that can never succeed (another event type, a
 * repeat, a session from another environment, a rejected amount) gets 200 so it isn't retried;
 * only failures a retry can fix get 5xx.
 */
export const runtime = "nodejs";

function reply(status: number, body: Record<string, string>) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  let secret: string;
  try {
    secret = getWebhookEnv().PAYMONGO_WEBHOOK_SECRET;
  } catch (error) {
    logError("webhook.env_failed", error);
    return reply(500, { error: "unavailable" });
  }

  const rawBody = await request.text();
  const check = verifyWebhookSignature({
    header: request.headers.get(SIGNATURE_HEADER),
    rawBody,
    secret,
  });
  if (!check.ok) {
    console.warn("webhook.unauthorized", { reason: check.reason });
    return reply(401, { error: "invalid_signature" });
  }

  let event: WebhookEvent;
  try {
    event = parseWebhookEvent(rawBody);
  } catch (error) {
    logError("webhook.invalid_event", error);
    return reply(400, { error: "invalid_event" });
  }

  // Only a live-mode webhook sends these, and none may point here: fail loudly in PayMongo's log.
  if (event.livemode) {
    console.warn("webhook.rejected", { eventId: event.id, reason: "livemode" });
    return reply(400, { error: "livemode" });
  }

  if (event.type !== CHECKOUT_SESSION_PAID) return reply(200, { outcome: "ignored" });

  let session: CheckoutSession;
  try {
    session = parseCheckoutSession(event.data);
  } catch (error) {
    logError("webhook.invalid_event", error, { eventId: event.id });
    return reply(400, { error: "invalid_event" });
  }

  try {
    const result = await confirmPayment(getDb(), session);
    if (result.status === "unpaid") {
      console.warn("webhook.unpaid", { eventId: event.id, checkoutSessionId: session.id });
    }
    return reply(200, { outcome: result.status });
  } catch (error) {
    logError("webhook.confirm_failed", error, { eventId: event.id, checkoutSessionId: session.id });
    return reply(500, { error: "unavailable" });
  }
}
