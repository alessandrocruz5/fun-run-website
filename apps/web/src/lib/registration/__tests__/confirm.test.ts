import { type Db, getRegistrationByCheckoutSessionId, markPaid, type Registration } from "@rr/db";
import { RACES } from "@rr/db/races";
import type { CheckoutSession, Payment } from "@rr/payments";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkCheckout, confirmPayment } from "../confirm";

const db = vi.hoisted(() => ({ fake: "db" }));

vi.mock("@rr/db", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDb: () => db,
  getRegistrationByCheckoutSessionId: vi.fn(),
  markPaid: vi.fn(),
}));

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

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pay_test1",
    status: "paid",
    amountCentavos: PRICE,
    currency: "PHP",
    feeCentavos: 2_500,
    netCentavos: PRICE - 2_500,
    method: "gcash",
    paidAt: PAID_AT,
    livemode: false,
    ...overrides,
  };
}

function session(overrides: Partial<CheckoutSession> = {}): CheckoutSession {
  return {
    id: "cs_test1",
    checkoutUrl: "https://checkout.paymongo.com/cs_test1_client_x",
    status: "active",
    livemode: false,
    metadata: { registration_id: ROW_ID },
    payments: [payment()],
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

let consoleWarn: ReturnType<typeof vi.spyOn>;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.mocked(getRegistrationByCheckoutSessionId).mockResolvedValue(row());
  vi.mocked(markPaid).mockResolvedValue(paidRow);
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  consoleWarn.mockRestore();
  consoleError.mockRestore();
});

describe("confirmPayment", () => {
  it("records the payment method, fee and net when the paid amount matches", async () => {
    const result = await confirmPayment(db as unknown as Db, session());

    expect(markPaid).toHaveBeenCalledWith(db, {
      checkoutSessionId: "cs_test1",
      amountCentavos: PRICE,
      paymentId: "pay_test1",
      paymentMethod: "gcash",
      feeCentavos: 2_500,
      netCentavos: PRICE - 2_500,
      paidAt: PAID_AT,
    });
    expect(result).toEqual({ status: "paid", registration: paidRow });
  });

  it.each([
    ["a lower amount", { amountCentavos: PRICE - 1 }],
    ["a higher amount", { amountCentavos: PRICE + 1 }],
    ["another currency", { currency: "USD" }],
  ])("refuses %s and records nothing", async (_case, overrides) => {
    const result = await confirmPayment(
      db as unknown as Db,
      session({ payments: [payment(overrides)] }),
    );
    expect(result).toEqual({ status: "rejected", reason: "amount_mismatch" });
    expect(markPaid).not.toHaveBeenCalled();
  });

  it("refuses a live-mode session or payment", async () => {
    expect(await confirmPayment(db as unknown as Db, session({ livemode: true }))).toEqual({
      status: "rejected",
      reason: "livemode",
    });
    expect(
      await confirmPayment(
        db as unknown as Db,
        session({ payments: [payment({ livemode: true })] }),
      ),
    ).toEqual({ status: "rejected", reason: "livemode" });
    expect(markPaid).not.toHaveBeenCalled();
  });

  it("refuses a session we have no registration for", async () => {
    vi.mocked(getRegistrationByCheckoutSessionId).mockResolvedValue(null);
    expect(await confirmPayment(db as unknown as Db, session())).toEqual({
      status: "rejected",
      reason: "unknown_session",
    });
  });

  it("refuses a session whose metadata names another registration", async () => {
    const result = await confirmPayment(
      db as unknown as Db,
      session({ metadata: { registration_id: "someone-else" } }),
    );
    expect(result).toEqual({ status: "rejected", reason: "metadata_mismatch" });
    expect(markPaid).not.toHaveBeenCalled();
  });

  it.each([[[]], [[payment({ status: "pending" })]], [[payment({ status: "failed" })]]])(
    "reports unpaid while PayMongo has no paid payment (%j)",
    async (payments) => {
      const result = await confirmPayment(db as unknown as Db, session({ payments }));
      expect(result).toMatchObject({ status: "unpaid" });
      expect(markPaid).not.toHaveBeenCalled();
    },
  );

  it("is idempotent: an already-paid registration is not written again", async () => {
    vi.mocked(getRegistrationByCheckoutSessionId).mockResolvedValue(paidRow);
    const result = await confirmPayment(db as unknown as Db, session());
    expect(result).toEqual({ status: "paid", registration: paidRow });
    expect(markPaid).not.toHaveBeenCalled();
  });

  it("reports paid when the other caller recorded it first", async () => {
    vi.mocked(getRegistrationByCheckoutSessionId)
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(paidRow);
    vi.mocked(markPaid).mockResolvedValue(null);
    expect(await confirmPayment(db as unknown as Db, session())).toEqual({
      status: "paid",
      registration: paidRow,
    });
  });

  it("reports a write that didn't apply", async () => {
    vi.mocked(markPaid).mockResolvedValue(null);
    expect(await confirmPayment(db as unknown as Db, session())).toEqual({
      status: "rejected",
      reason: "not_recorded",
    });
  });

  it("logs a rejection by ID and reason only", async () => {
    await confirmPayment(
      db as unknown as Db,
      session({ payments: [payment({ amountCentavos: 1 })] }),
    );
    expect(consoleWarn).toHaveBeenCalledWith("payment.rejected", {
      checkoutSessionId: "cs_test1",
      reason: "amount_mismatch",
    });
  });
});

describe("checkCheckout", () => {
  function payMongoReplies(response: () => Response) {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response());
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_abc123");
    return fetch;
  }

  const paidSession = () =>
    Response.json({
      data: {
        id: "cs_test1",
        attributes: {
          checkout_url: "https://checkout.paymongo.com/cs_test1_client_x",
          status: "active",
          livemode: false,
          metadata: { registration_id: ROW_ID },
          payments: [
            {
              id: "pay_test1",
              attributes: {
                status: "paid",
                amount: PRICE,
                currency: "PHP",
                fee: 2_500,
                net_amount: PRICE - 2_500,
                livemode: false,
                paid_at: PAID_AT.getTime() / 1000,
                source: { type: "card" },
              },
            },
          ],
        },
      },
    });

  it.each([undefined, "", "not-a-session", "cs_test1/../x"])(
    "finds nothing for cookie %j and asks no one",
    async (cookie) => {
      const fetch = payMongoReplies(paidSession);
      expect(await checkCheckout(cookie)).toEqual({ status: "not_found" });
      expect(getRegistrationByCheckoutSessionId).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("never sends a session it doesn't know to PayMongo", async () => {
    const fetch = payMongoReplies(paidSession);
    vi.mocked(getRegistrationByCheckoutSessionId).mockResolvedValue(null);
    expect(await checkCheckout("cs_unknown")).toEqual({ status: "not_found" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads the session from PayMongo on the server and confirms it", async () => {
    const fetch = payMongoReplies(paidSession);
    const result = await checkCheckout("cs_test1");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.paymongo.com/v1/checkout_sessions/cs_test1",
      expect.objectContaining({ method: "GET" }),
    );
    expect(markPaid).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ paymentMethod: "card", feeCentavos: 2_500, paidAt: PAID_AT }),
    );
    expect(result).toEqual({ status: "paid", registration: paidRow });
  });

  it("doesn't call PayMongo again for a registration already paid", async () => {
    const fetch = payMongoReplies(paidSession);
    vi.mocked(getRegistrationByCheckoutSessionId).mockResolvedValue(paidRow);
    expect(await checkCheckout("cs_test1")).toEqual({ status: "paid", registration: paidRow });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports unavailable when PayMongo fails, logging status and codes only", async () => {
    payMongoReplies(() =>
      Response.json({ errors: [{ code: "resource_not_found", detail: "juana" }] }, { status: 404 }),
    );
    expect(await checkCheckout("cs_test1")).toEqual({ status: "unavailable" });
    expect(consoleError).toHaveBeenCalledWith("payment.check_failed", {
      checkoutSessionId: "cs_test1",
      error: "PayMongoError",
      status: 404,
      codes: ["resource_not_found"],
    });
    expect(markPaid).not.toHaveBeenCalled();
  });

  it("reports unavailable when the database fails", async () => {
    payMongoReplies(paidSession);
    vi.mocked(getRegistrationByCheckoutSessionId).mockRejectedValue(
      new Error("Failed query … params: juana@example.test"),
    );
    expect(await checkCheckout("cs_test1")).toEqual({ status: "unavailable" });
    expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/juana/);
  });
});
