import { EnvValidationError } from "@rr/env";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getEmailEnv } from "../env";
import {
  createEmailClient,
  EmailError,
  type EmailMessage,
  sendRegistrationConfirmed,
} from "../send";
import type { RegistrationConfirmedProps } from "../templates/registration-confirmed";

const API_KEY = "re_test_abc123";
const FROM = "Riverline Run <race@mail.riverline.test>";
const REGISTRATION_ID = "0b9f6c1e-1111-4222-8333-444455556666";

const DETAILS: RegistrationConfirmedProps = {
  eventName: "Riverline Run 2027",
  organizer: "Clearwater Collective",
  firstName: "Juana",
  fullName: "Juana Dela Cruz",
  raceLabel: "10K Run",
  reference: "RR-TEST0001",
  amount: "₱1,000",
  raceDay: "Sun · Apr 18, 2027",
  venue: "Port Meridian Waterfront",
  assemblyTime: "4:30 AM",
  gunTime: "5:00 AM",
  privacyUrl: "https://riverline.test/privacy",
  retentionDays: 7,
};

const MESSAGE: EmailMessage = {
  to: "juana@example.test",
  subject: "You're in",
  html: "<p>hi</p>",
  text: "hi",
  idempotencyKey: REGISTRATION_ID,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientReturning(response: Response | Error) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  return { fetch, client: createEmailClient({ apiKey: API_KEY, from: FROM, fetch }) };
}

function sentRequest(fetch: ReturnType<typeof clientReturning>["fetch"]) {
  const [url, init] = fetch.mock.calls[0] ?? [];
  return {
    url: String(url),
    method: init?.method,
    headers: new Headers(init?.headers),
    body: JSON.parse(String(init?.body)) as Record<string, unknown>,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getEmailEnv", () => {
  it("accepts a Resend key and a sender with or without a name", () => {
    expect(getEmailEnv({ RESEND_API_KEY: API_KEY, EMAIL_FROM: FROM })).toMatchObject({
      RESEND_API_KEY: API_KEY,
      EMAIL_FROM: FROM,
    });
    expect(
      getEmailEnv({ RESEND_API_KEY: API_KEY, EMAIL_FROM: "race@mail.riverline.test" }).EMAIL_FROM,
    ).toBe("race@mail.riverline.test");
  });

  it.each(["", "sk_test_abc123", "re_", " re_abc", "re_abc\n"])("rejects the key %j", (key) => {
    expect(() => getEmailEnv({ RESEND_API_KEY: key, EMAIL_FROM: FROM })).toThrow(
      EnvValidationError,
    );
  });

  it.each(["", "riverline", "Riverline Run", "Riverline <nope>", "a@b.test\nBcc: x@y.test"])(
    "rejects the sender %j",
    (from) => {
      expect(() => getEmailEnv({ RESEND_API_KEY: API_KEY, EMAIL_FROM: from })).toThrow(
        /EMAIL_FROM/,
      );
    },
  );

  it("names missing keys and never repeats a rejected value", () => {
    expect(() => getEmailEnv({})).toThrow(/RESEND_API_KEY[\s\S]*EMAIL_FROM/);
    expect(() => getEmailEnv({ RESEND_API_KEY: "sk_live_s3cr3tvalue", EMAIL_FROM: FROM })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("s3cr3tvalue") }),
    );
  });
});

describe("createEmailClient", () => {
  it("refuses anything but a Resend API key", () => {
    expect(() => createEmailClient({ apiKey: "sk_test_abc123", from: FROM })).toThrow(/re_/);
  });

  it("posts the message to Resend with the idempotency key", async () => {
    const { fetch, client } = clientReturning(jsonResponse({ id: "email_1" }));

    expect(await client.send(MESSAGE)).toEqual({ status: "sent", id: "email_1" });

    const request = sentRequest(fetch);
    expect(request.url).toBe("https://api.resend.com/emails");
    expect(request.method).toBe("POST");
    expect(request.headers.get("authorization")).toBe(`Bearer ${API_KEY}`);
    expect(request.headers.get("idempotency-key")).toBe(REGISTRATION_ID);
    expect(request.body).toEqual({
      from: FROM,
      to: ["juana@example.test"],
      subject: "You're in",
      html: "<p>hi</p>",
      text: "hi",
    });
  });

  it("treats a key already used with another payload as sent before", async () => {
    const { client } = clientReturning(
      jsonResponse({ statusCode: 409, name: "invalid_idempotent_request", message: "…" }, 409),
    );
    expect(await client.send(MESSAGE)).toEqual({ status: "duplicate" });
  });

  it.each([
    [409, "concurrent_idempotent_requests"],
    [422, "validation_error"],
    [429, "rate_limit_exceeded"],
    [500, "application_error"],
  ])("throws on %i %s with the status and name only", async (status, name) => {
    const { client } = clientReturning(
      jsonResponse(
        { statusCode: status, name, message: "Invalid `to`: juana@example.test" },
        status,
      ),
    );
    const error = await client.send(MESSAGE).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailError);
    expect(error).toMatchObject({ status, code: name });
    expect(JSON.stringify({ ...(error as object), message: (error as Error).message })).not.toMatch(
      /juana/,
    );
  });

  it("throws when Resend can't be reached", async () => {
    const { client } = clientReturning(new TypeError("fetch failed"));
    await expect(client.send(MESSAGE)).rejects.toMatchObject({ name: "EmailError", status: 0 });
  });

  it("throws on a success without an email ID", async () => {
    const { client } = clientReturning(jsonResponse({}));
    await expect(client.send(MESSAGE)).rejects.toBeInstanceOf(EmailError);
  });

  it("gives up after a timeout rather than holding the webhook open", async () => {
    const { fetch, client } = clientReturning(jsonResponse({ id: "email_1" }));
    await client.send(MESSAGE);
    expect(fetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("sendRegistrationConfirmed", () => {
  it("sends HTML and plain text, keyed by the registration ID", async () => {
    const { fetch, client } = clientReturning(jsonResponse({ id: "email_1" }));

    await sendRegistrationConfirmed(
      { registrationId: REGISTRATION_ID, to: "juana@example.test", details: DETAILS },
      client,
    );

    const { headers, body } = sentRequest(fetch);
    expect(headers.get("idempotency-key")).toBe(REGISTRATION_ID);
    expect(body.to).toEqual(["juana@example.test"]);
    expect(body.subject).toBe("You're in: 10K Run, Riverline Run 2027 · RR-TEST0001 [TEST]");
    expect(body.html).toMatch(/^<!DOCTYPE html/);
    expect(body.html).toContain("RR-TEST0001");
    expect(body.text).toContain("RR-TEST0001");
    expect(body.text).not.toMatch(/<[a-z]/i);
  });

  it("renders the same request every time, so a retry matches Resend's stored payload", async () => {
    const first = clientReturning(jsonResponse({ id: "email_1" }));
    const second = clientReturning(jsonResponse({ id: "email_1" }));
    const input = { registrationId: REGISTRATION_ID, to: "juana@example.test", details: DETAILS };

    await sendRegistrationConfirmed(input, first.client);
    await sendRegistrationConfirmed(input, second.client);

    expect(second.fetch.mock.calls[0]?.[1]?.body).toBe(first.fetch.mock.calls[0]?.[1]?.body);
  });

  it("reads the key and sender from the environment when no client is given", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => jsonResponse({ id: "email_1" }));
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("RESEND_API_KEY", API_KEY);
    vi.stubEnv("EMAIL_FROM", FROM);

    await sendRegistrationConfirmed({
      registrationId: REGISTRATION_ID,
      to: "juana@example.test",
      details: DETAILS,
    });
    expect(sentRequest(fetch).body.from).toBe(FROM);
  });

  it("fails before calling Resend when the environment is missing", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(
      sendRegistrationConfirmed({
        registrationId: REGISTRATION_ID,
        to: "juana@example.test",
        details: DETAILS,
      }),
    ).rejects.toBeInstanceOf(EnvValidationError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
