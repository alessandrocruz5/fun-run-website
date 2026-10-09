import { render } from "@react-email/render";
import { createElement } from "react";
import { z } from "zod";
import { getEmailEnv, resendApiKeySchema } from "./env";
import {
  RegistrationConfirmed,
  type RegistrationConfirmedProps,
  registrationConfirmedSubject,
} from "./templates/registration-confirmed";

/**
 * Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). Errors carry an
 * HTTP status and Resend's error name only, never a message, recipient or body, so no personal data
 * can reach a log (RA 10173).
 */

const API_URL = "https://api.resend.com/emails";
// The webhook must answer PayMongo within 30 s, database calls included.
const TIMEOUT_MS = 10_000;

export class EmailError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when no usable response arrived. */
    public readonly status = 0,
    /** Resend's error name, such as `validation_error`. The message is dropped. */
    public readonly code?: string,
  ) {
    super(message);
    this.name = "EmailError";
  }
}

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Resend sends one email per key within 24 hours, however often the request repeats. */
  idempotencyKey: string;
};

export type SendResult =
  /** Resend accepted the email, or answered a repeat of an accepted request with the same ID. */
  | { status: "sent"; id: string }
  /**
   * The key was already used with a different payload (e.g. the template changed between two
   * attempts): an email for this key went out before, so this one must not.
   */
  | { status: "duplicate" };

export type EmailClient = {
  send(message: EmailMessage): Promise<SendResult>;
};

const errorBody = z.object({ name: z.string().regex(/^[a-z_]+$/) });
const successBody = z.object({ id: z.string() });

export function createEmailClient(options: {
  apiKey: string;
  from: string;
  fetch?: typeof fetch;
}): EmailClient {
  if (!resendApiKeySchema.safeParse(options.apiKey).success) {
    throw new Error("The email client needs a Resend API key (re_…)");
  }
  const post = options.fetch ?? fetch;

  return {
    async send(message) {
      let response: Response;
      try {
        response = await post(API_URL, {
          method: "POST",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
            "idempotency-key": message.idempotencyKey,
          },
          body: JSON.stringify({
            from: options.from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        throw new EmailError("Resend request failed");
      }
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code = errorBody.safeParse(json).data?.name;
        if (response.status === 409 && code === "invalid_idempotent_request") {
          return { status: "duplicate" };
        }
        throw new EmailError(`Resend responded ${response.status}`, response.status, code);
      }
      const parsed = successBody.safeParse(json);
      if (!parsed.success) throw new EmailError("Unexpected Resend response", response.status);
      return { status: "sent", id: parsed.data.id };
    },
  };
}

export type SendRegistrationConfirmedInput = {
  /** Resend's idempotency key: one email per registration, whoever sends it. */
  registrationId: string;
  to: string;
  details: RegistrationConfirmedProps;
};

/** Render the confirmation (HTML and plain text) and send it. Throws `EmailError` on failure. */
export async function sendRegistrationConfirmed(
  input: SendRegistrationConfirmedInput,
  client?: EmailClient,
): Promise<SendResult> {
  const sender =
    client ??
    (() => {
      const env = getEmailEnv();
      return createEmailClient({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
    })();
  const email = createElement(RegistrationConfirmed, input.details);
  const [html, text] = await Promise.all([render(email), render(email, { plainText: true })]);
  return sender.send({
    to: input.to,
    subject: registrationConfirmedSubject(input.details),
    html,
    text,
    idempotencyKey: input.registrationId,
  });
}
