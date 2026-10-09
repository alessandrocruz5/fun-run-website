import { createHmac } from "node:crypto";
import { getDb, getRegistrationByCheckoutSessionId, markPaid, type Registration } from "@rr/db";
import { RACES } from "@rr/db/races";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, runtime } from "../route";

const db = vi.hoisted(() => ({ fake: "db" }));

vi.mock("@rr/db", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDb: vi.fn(() => db),
  getRegistrationByCheckoutSessionId: vi.fn(),
  markPaid: vi.fn(),
}));

const SECRET = "whsk_testsecret";
const ROW_ID = "0b9f6c1e-1111-4222-8333-444455556666";
const PRICE = RACES["10k"].priceCentavos;
const PAID_AT = new Date("2026-10-09T03:00:00Z");

function row(overrides: Partial<Registration> = {}): Registration {
  return {
    id: ROW_ID,
    reference: "RR-TEST0001",
    race: "10k",
    firstName: "Juana",
    lastName: "Dela Cruz",
    email: "juana@example.test",
    mobile: "+639170000000",
    birthdate: "1990-05-17",
    sex: "female",
    shirtSize: "M",
    emergencyContactName: "Pedro Dela Cruz",
    emergencyContactMobile: "+639170000001",
    consentAt: new Date(),
    amountCentavos: PRICE,
    status: "pending",
    checkoutSessionId: "cs_test1",
    paymentId: null,
    paymentMethod: null,
    feeCentavos: null,
    netCentavos: null,
    paidAt: null,
    confirmationSentAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

const paidRow = row({
  status: "paid",
  paymentId: "pay_test1",
  paymentMethod: "gcash",
  feeCentavos: 2_500,
  netCentavos: PRICE - 2_500,
  paidAt: PAID_AT,
});

function event({
  type = "checkout_session.payment.paid",
  livemode = false,
  amount = PRICE,
}: { type?: string; livemode?: boolean; amount?: number } = {}) {
  return {
    data: {
      id: "evt_test1",
      type: "event",
      attributes: {
        type,
        livemode,
        data: {
          id: "cs_test1",
          type: "checkout_session",
          attributes: {
            checkout_url: "https://checkout.paymongo.com/cs_test1_client_x",
            status: "active",
            livemode,
            metadata: { registration_id: ROW_ID },
            payments: [
              {
                id: "pay_test1",
                type: "payment",
                attributes: {
                  amount,
                  currency: "PHP",
                  fee: 2_500,
                  net_amount: amount - 2_500,
                  status: "paid",
                  livemode,
                  paid_at: PAID_AT.getTime() / 1000,
                  source: { id: "src_x", type: "gcash" },
                },
              },
            ],
          },
        },
        previous_data: {},
      },
    },
  };
}

function signature(rawBody: string, t = Math.floor(Date.now() / 1000), secret = SECRET) {
  const te = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return `t=${t},te=${te},li=`;
}

function deliver(body: unknown, header?: (rawBody: string) => string | null) {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  const value = header ? header(rawBody) : signature(rawBody);
  return POST(
    new Request("https://riverline.test/api/webhooks/paymongo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(value === null ? {} : { "Paymongo-Signature": value }),
      },
      body: rawBody,
    }),
  );
}

let consoleWarn: ReturnType<typeof vi.spyOn>;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("PAYMONGO_WEBHOOK_SECRET", SECRET);
  vi.mocked(getRegistrationByCheckoutSessionId).mockResolvedValue(row());
  vi.mocked(markPaid).mockResolvedValue(paidRow);
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  consoleWarn.mockRestore();
  consoleError.mockRestore();
});

function expectDatabaseUntouched() {
  expect(getDb).not.toHaveBeenCalled();
  expect(getRegistrationByCheckoutSessionId).not.toHaveBeenCalled();
  expect(markPaid).not.toHaveBeenCalled();
}

describe("POST /api/webhooks/paymongo", () => {
  it("runs on Node and is never cached", async () => {
    expect(runtime).toBe("nodejs");
    const response = await deliver(event());
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("confirms a paid checkout session, saving method, fee and net", async () => {
    const response = await deliver(event());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: "paid" });
    expect(markPaid).toHaveBeenCalledWith(db, {
      checkoutSessionId: "cs_test1",
      amountCentavos: PRICE,
      paymentId: "pay_test1",
      paymentMethod: "gcash",
      feeCentavos: 2_500,
      netCentavos: PRICE - 2_500,
      paidAt: PAID_AT,
    });
  });

  it.each([
    ["a missing signature", () => null],
    ["an empty signature", () => ""],
    ["a signature with another secret", (raw: string) => signature(raw, undefined, "whsk_other")],
    ["a signature for another body", () => signature(JSON.stringify(event({ amount: 1 })))],
    [
      "a signature older than 5 minutes",
      (raw: string) => signature(raw, Math.floor(Date.now() / 1000) - 301),
    ],
    [
      "a live-mode signature only",
      (raw: string) => signature(raw).replace(/te=(\w+),li=/, "te=,li=$1"),
    ],
    ["a malformed header", () => "garbage"],
  ])("returns 401 for %s without touching the database", async (_case, header) => {
    const response = await deliver(event(), header);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expectDatabaseUntouched();
  });

  it("logs a refused signature by reason only", async () => {
    await deliver(event(), () => null);
    expect(consoleWarn).toHaveBeenCalledWith("webhook.unauthorized", { reason: "missing" });
  });

  it("rejects a live-mode event without touching the database", async () => {
    const response = await deliver(event({ livemode: true }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "livemode" });
    expectDatabaseUntouched();
  });

  it.each(["payment.paid", "payment.failed", "checkout_session.expired"])(
    "acknowledges %s and changes nothing",
    async (type) => {
      const response = await deliver(event({ type }));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ outcome: "ignored" });
      expectDatabaseUntouched();
    },
  );

  it("acknowledges a repeated delivery and changes nothing", async () => {
    vi.mocked(getRegistrationByCheckoutSessionId).mockResolvedValue(paidRow);
    const response = await deliver(event());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: "paid" });
    expect(markPaid).not.toHaveBeenCalled();
  });

  it("records nothing when the paid amount differs from the price snapshot", async () => {
    const response = await deliver(event({ amount: PRICE - 1 }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: "rejected" });
    expect(markPaid).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith("payment.rejected", {
      checkoutSessionId: "cs_test1",
      reason: "amount_mismatch",
    });
  });

  it("acknowledges a session from another environment without retrying", async () => {
    vi.mocked(getRegistrationByCheckoutSessionId).mockResolvedValue(null);
    const response = await deliver(event());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: "rejected" });
    expect(markPaid).not.toHaveBeenCalled();
  });

  it.each([
    ["a body that isn't JSON", "not json"],
    ["an event without attributes", { data: { id: "evt_1" } }],
    [
      "a paid event whose data isn't a checkout session",
      {
        data: {
          id: "evt_1",
          attributes: { type: "checkout_session.payment.paid", livemode: false, data: {} },
        },
      },
    ],
  ])("returns 400 for %s even when signed", async (_case, body) => {
    const response = await deliver(body);

    expect(response.status).toBe(400);
    expect(markPaid).not.toHaveBeenCalled();
  });

  it("returns 500 so PayMongo retries when the database fails, logging no personal data", async () => {
    vi.mocked(getRegistrationByCheckoutSessionId).mockRejectedValue(
      new Error("Failed query … params: juana@example.test"),
    );
    const response = await deliver(event());

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalledWith("webhook.confirm_failed", {
      eventId: "evt_test1",
      checkoutSessionId: "cs_test1",
      error: "Error",
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/juana/);
  });

  it("returns 500 without touching the database when the secret isn't configured", async () => {
    vi.stubEnv("PAYMONGO_WEBHOOK_SECRET", "");
    const response = await deliver(event());

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalledWith(
      "webhook.env_failed",
      expect.objectContaining({ error: "EnvValidationError" }),
    );
    expectDatabaseUntouched();
  });
});
