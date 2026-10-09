import { describe, expect, it, vi } from "vitest";
import {
  type CreateCheckoutSessionInput,
  createPayMongoClient,
  isCheckoutSessionId,
  parseCheckoutSession,
  PayMongoError,
} from "../checkout";

const SECRET_KEY = "sk_test_abc123";

function sessionResource(attributes: Record<string, unknown> = {}, id = "cs_test1") {
  return {
    id,
    type: "checkout_session",
    attributes: {
      checkout_url: `https://checkout.paymongo.com/${id}_client_x#cGtfdGVzdA==`,
      status: "active",
      livemode: false,
      metadata: { registration_id: "reg-1" },
      payments: [],
      ...attributes,
    },
  };
}

const paidPayment = {
  id: "pay_test1",
  type: "payment",
  attributes: {
    amount: 100_000,
    currency: "PHP",
    fee: 2_500,
    net_amount: 97_500,
    status: "paid",
    livemode: false,
    paid_at: 1_791_532_800,
    source: { id: "card_x", type: "card", brand: "visa", last4: "4345" },
  },
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
  return { fetch, client: createPayMongoClient({ secretKey: SECRET_KEY, fetch }) };
}

function sentRequest(fetch: ReturnType<typeof clientReturning>["fetch"]) {
  const [url, init] = fetch.mock.calls[0] ?? [];
  return {
    url: String(url),
    init: init ?? {},
    body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
  };
}

const input: CreateCheckoutSessionInput = {
  registrationId: "0b9f6c1e-1111-4222-8333-444455556666",
  lineItem: { name: "Riverline Run 2027 · 10K Run", amountCentavos: 100_000 },
  description: "Fictional event · Test mode, no real payments",
  successUrl: "https://riverline.test/register/success",
  cancelUrl: "https://riverline.test/register/cancelled",
};

describe("createCheckoutSession", () => {
  it("posts one PHP line item with basic auth and returns the checkout URL", async () => {
    const { fetch, client } = clientReturning(jsonResponse({ data: sessionResource() }));
    const session = await client.createCheckoutSession(input);

    const { url, init, body } = sentRequest(fetch);
    expect(url).toBe("https://api.paymongo.com/v1/checkout_sessions");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe(`Basic ${btoa(`${SECRET_KEY}:`)}`);
    expect(body.data.attributes).toMatchObject({
      line_items: [{ name: input.lineItem.name, amount: 100_000, currency: "PHP", quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      send_email_receipt: false,
    });
    expect(session).toMatchObject({
      id: "cs_test1",
      checkoutUrl: "https://checkout.paymongo.com/cs_test1_client_x#cGtfdGVzdA==",
      livemode: false,
      payments: [],
    });
  });

  it("sends the registration ID as the only metadata", async () => {
    const { fetch, client } = clientReturning(jsonResponse({ data: sessionResource() }));
    await client.createCheckoutSession(input);
    const { body } = sentRequest(fetch);
    expect(body.data.attributes.metadata).toEqual({ registration_id: input.registrationId });
    expect(body.data.attributes).not.toHaveProperty("billing");
    expect(body.data.attributes).not.toHaveProperty("customer_email");
  });

  it.each([0, -1, 1.5, Number.NaN])(
    "refuses amount %s without calling PayMongo",
    async (amount) => {
      const { fetch, client } = clientReturning(jsonResponse({ data: sessionResource() }));
      await expect(
        client.createCheckoutSession({
          ...input,
          lineItem: { ...input.lineItem, amountCentavos: amount },
        }),
      ).rejects.toThrow(RangeError);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("reports a PayMongo error by status and code only", async () => {
    const { client } = clientReturning(
      jsonResponse(
        { errors: [{ code: "parameter_invalid", detail: "juana@example.test is not allowed" }] },
        400,
      ),
    );
    const error = await client.createCheckoutSession(input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PayMongoError);
    expect(error).toMatchObject({ status: 400, codes: ["parameter_invalid"] });
    expect(String((error as Error).message)).not.toMatch(/juana/);
  });

  it("wraps a network failure", async () => {
    const { client } = clientReturning(new TypeError("fetch failed"));
    await expect(client.createCheckoutSession(input)).rejects.toMatchObject({
      name: "PayMongoError",
      status: 0,
    });
  });

  it("refuses a checkout URL that isn't PayMongo's", async () => {
    const { client } = clientReturning(
      jsonResponse({ data: sessionResource({ checkout_url: "https://evil.test/pay" }) }),
    );
    await expect(client.createCheckoutSession(input)).rejects.toThrow(PayMongoError);
  });

  it("refuses a response it can't read", async () => {
    const { client } = clientReturning(jsonResponse({ data: { id: "nope" } }));
    await expect(client.createCheckoutSession(input)).rejects.toThrow(PayMongoError);
  });
});

describe("retrieveCheckoutSession", () => {
  it("gets the session with its payments", async () => {
    const { fetch, client } = clientReturning(
      jsonResponse({ data: sessionResource({ payments: [paidPayment] }) }),
    );
    const session = await client.retrieveCheckoutSession("cs_test1");

    const { url, init } = sentRequest(fetch);
    expect(url).toBe("https://api.paymongo.com/v1/checkout_sessions/cs_test1");
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
    expect(session.payments).toEqual([
      {
        id: "pay_test1",
        status: "paid",
        amountCentavos: 100_000,
        currency: "PHP",
        feeCentavos: 2_500,
        netCentavos: 97_500,
        method: "card",
        paidAt: new Date(1_791_532_800 * 1000),
        livemode: false,
      },
    ]);
  });

  it.each(["", "cs_", "pay_test1", "cs_test1/../../payments", "cs_test 1"])(
    "refuses %j without calling PayMongo",
    async (id) => {
      const { fetch, client } = clientReturning(jsonResponse({ data: sessionResource() }));
      await expect(client.retrieveCheckoutSession(id)).rejects.toThrow(RangeError);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("refuses a different session than the one asked for", async () => {
    const { client } = clientReturning(jsonResponse({ data: sessionResource({}, "cs_other") }));
    await expect(client.retrieveCheckoutSession("cs_test1")).rejects.toThrow(PayMongoError);
  });
});

describe("parseCheckoutSession", () => {
  it("defaults missing metadata and payments, and an unknown payment source", () => {
    const { source: _source, ...withoutSource } = paidPayment.attributes;
    const session = parseCheckoutSession(
      sessionResource({
        metadata: null,
        payments: [{ ...paidPayment, attributes: { ...withoutSource, paid_at: null } }],
      }),
    );
    expect(session.metadata).toEqual({});
    expect(session.payments[0]).toMatchObject({ method: "unknown", paidAt: null });
    expect(parseCheckoutSession(sessionResource({ payments: undefined })).payments).toEqual([]);
  });
});

describe("isCheckoutSessionId", () => {
  it("accepts only cs_ IDs", () => {
    expect(isCheckoutSessionId("cs_CbFCTDfxvMFNjwjVi26Uzhtj")).toBe(true);
    expect(isCheckoutSessionId("cs_a/b")).toBe(false);
    expect(isCheckoutSessionId(undefined)).toBe(false);
  });
});
