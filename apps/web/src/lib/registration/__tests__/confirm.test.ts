import {
  claimConfirmation,
  type Db,
  getRegistrationByCheckoutSessionId,
  markPaid,
  type Registration,
  releaseConfirmation,
} from "@rr/db";
import { RACES } from "@rr/db/races";
import { EmailError, sendRegistrationConfirmed } from "@rr/email";
import type { CheckoutSession, Payment } from "@rr/payments";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkCheckout, confirmationDetails, confirmPayment, sendConfirmation } from "../confirm";

const db = vi.hoisted(() => ({ fake: "db" }));

vi.mock("@rr/db", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDb: () => db,
  getRegistrationByCheckoutSessionId: vi.fn(),
  markPaid: vi.fn(),
  claimConfirmation: vi.fn(),
  releaseConfirmation: vi.fn(),
}));

vi.mock("@rr/email", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sendRegistrationConfirmed: vi.fn(),
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
  vi.mocked(claimConfirmation).mockImplementation(async () => ({
    ...paidRow,
    confirmationSentAt: new Date(),
  }));
  vi.mocked(releaseConfirmation).mockResolvedValue(true);
  vi.mocked(sendRegistrationConfirmed).mockResolvedValue({ status: "sent", id: "email_1" });
  vi.stubEnv("SITE_URL", "https://riverline.test");
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

  it("records a payment on a registration that was cancelled", async () => {
    payMongoReplies(paidSession);
    vi.mocked(getRegistrationByCheckoutSessionId).mockResolvedValue(row({ status: "cancelled" }));
    expect(await checkCheckout("cs_test1")).toEqual({ status: "paid", registration: paidRow });
    expect(markPaid).toHaveBeenCalledWith(db, expect.objectContaining({ amountCentavos: PRICE }));
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

describe("confirmation email", () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  /**
   * An in-memory registrations row behind the mocked `@rr/db` steps. Each step is atomic, as its
   * one conditional UPDATE is in Postgres, but yields first so concurrent callers interleave.
   */
  function storedRow(initial: Registration) {
    let current = { ...initial };
    vi.mocked(getRegistrationByCheckoutSessionId).mockImplementation(async () => ({ ...current }));
    vi.mocked(markPaid).mockImplementation(async (_db, input) => {
      await tick();
      if (current.status === "paid") return null;
      current = {
        ...current,
        status: "paid",
        paymentId: input.paymentId,
        paymentMethod: input.paymentMethod,
        feeCentavos: input.feeCentavos,
        netCentavos: input.netCentavos,
        paidAt: input.paidAt,
      };
      return { ...current };
    });
    vi.mocked(claimConfirmation).mockImplementation(async () => {
      await tick();
      if (current.status !== "paid" || current.confirmationSentAt) return null;
      current = { ...current, confirmationSentAt: new Date() };
      return { ...current };
    });
    vi.mocked(releaseConfirmation).mockImplementation(async () => {
      const released = current.confirmationSentAt !== null;
      current = { ...current, confirmationSentAt: null };
      return released;
    });
    return () => current;
  }

  function resendTakes(ms: number) {
    vi.mocked(sendRegistrationConfirmed).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return { status: "sent", id: "email_1" };
    });
  }

  function payMongoReturnsPaid() {
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_abc123");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
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
        }),
      ),
    );
  }

  it("sends the runner's email after recording the payment, keyed by the registration ID", async () => {
    storedRow(row());
    await confirmPayment(db as unknown as Db, session());

    expect(sendRegistrationConfirmed).toHaveBeenCalledTimes(1);
    expect(sendRegistrationConfirmed).toHaveBeenCalledWith({
      registrationId: ROW_ID,
      to: "juana@example.test",
      details: {
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
      },
    });
  });

  it("sends exactly one email when the webhook, the success page and retries all fire", async () => {
    const stored = storedRow(row());
    payMongoReturnsPaid();
    resendTakes(5);

    const results = await Promise.all([
      confirmPayment(db as unknown as Db, session()), // webhook
      checkCheckout("cs_test1"), // success page
      confirmPayment(db as unknown as Db, session()), // webhook retry
      checkCheckout("cs_test1"), // reload
      confirmPayment(db as unknown as Db, session()), // dashboard resend
    ]);
    // …and again once everything has settled.
    results.push(
      await confirmPayment(db as unknown as Db, session()),
      await checkCheckout("cs_test1"),
    );

    expect(results.every((r) => r.status === "paid")).toBe(true);
    expect(sendRegistrationConfirmed).toHaveBeenCalledTimes(1);
    expect(stored().confirmationSentAt).not.toBeNull();
  });

  it("releases the claim and throws when sending fails, so the retry sends it", async () => {
    const stored = storedRow(row());
    vi.mocked(sendRegistrationConfirmed).mockRejectedValueOnce(
      new EmailError("Resend responded 500", 500, "application_error"),
    );

    await expect(confirmPayment(db as unknown as Db, session())).rejects.toBeInstanceOf(EmailError);
    expect(releaseConfirmation).toHaveBeenCalledWith(db, ROW_ID);
    expect(stored()).toMatchObject({ status: "paid", confirmationSentAt: null });

    expect(await confirmPayment(db as unknown as Db, session())).toMatchObject({
      status: "paid",
    });
    expect(await confirmPayment(db as unknown as Db, session())).toMatchObject({
      status: "paid",
    });
    expect(sendRegistrationConfirmed).toHaveBeenCalledTimes(2);
    expect(stored().confirmationSentAt).not.toBeNull();
  });

  it("releases the claim when the email can't even be built", async () => {
    const stored = storedRow(row());
    vi.stubEnv("SITE_URL", "");

    await expect(confirmPayment(db as unknown as Db, session())).rejects.toThrow(/SITE_URL/);
    expect(sendRegistrationConfirmed).not.toHaveBeenCalled();
    expect(stored().confirmationSentAt).toBeNull();
  });

  it("logs a failed send by registration ID, status and code only", async () => {
    storedRow(row());
    vi.mocked(sendRegistrationConfirmed).mockRejectedValueOnce(
      new EmailError("Resend responded 422", 422, "validation_error"),
    );

    await confirmPayment(db as unknown as Db, session()).catch(() => undefined);

    expect(consoleError).toHaveBeenCalledWith("email.send_failed", {
      registrationId: ROW_ID,
      error: "EmailError",
      status: 422,
      codes: ["validation_error"],
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/juana|Juana|Dela Cruz/);
  });

  it("still throws the send's error when releasing the claim fails too", async () => {
    storedRow(row());
    vi.mocked(sendRegistrationConfirmed).mockRejectedValueOnce(new EmailError("down", 503));
    vi.mocked(releaseConfirmation).mockRejectedValueOnce(new Error("connection lost"));

    await expect(confirmPayment(db as unknown as Db, session())).rejects.toMatchObject({
      status: 503,
    });
    expect(consoleError).toHaveBeenCalledWith(
      "email.release_failed",
      expect.objectContaining({ registrationId: ROW_ID }),
    );
  });

  it("success page: a failed send reports unavailable, and checking again sends it", async () => {
    storedRow(row());
    payMongoReturnsPaid();
    vi.mocked(sendRegistrationConfirmed).mockRejectedValueOnce(new EmailError("down", 503));

    expect(await checkCheckout("cs_test1")).toEqual({ status: "unavailable" });
    expect(await checkCheckout("cs_test1")).toMatchObject({ status: "paid" });
    expect(sendRegistrationConfirmed).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["pending", row(), [payment({ status: "pending" })]],
    ["cancelled", row({ status: "cancelled" }), []],
    ["pending (failed payment)", row(), [payment({ status: "failed" })]],
  ])("sends nothing for a %s registration", async (_case, registration, payments) => {
    storedRow(registration);
    expect(await confirmPayment(db as unknown as Db, session({ payments }))).toMatchObject({
      status: "unpaid",
    });
    expect(claimConfirmation).not.toHaveBeenCalled();
    expect(sendRegistrationConfirmed).not.toHaveBeenCalled();
  });

  it("sends nothing for a rejected payment", async () => {
    storedRow(row());
    await confirmPayment(
      db as unknown as Db,
      session({ payments: [payment({ amountCentavos: 1 })] }),
    );
    expect(sendRegistrationConfirmed).not.toHaveBeenCalled();
  });

  it("never sends for a row that isn't paid, even when asked directly", async () => {
    for (const status of ["pending", "cancelled"] as const) {
      await sendConfirmation(db as unknown as Db, row({ status }));
    }
    expect(claimConfirmation).not.toHaveBeenCalled();
    expect(sendRegistrationConfirmed).not.toHaveBeenCalled();
  });

  it("doesn't claim again for a row whose email already went out", async () => {
    await sendConfirmation(db as unknown as Db, { ...paidRow, confirmationSentAt: new Date() });
    expect(claimConfirmation).not.toHaveBeenCalled();
    expect(sendRegistrationConfirmed).not.toHaveBeenCalled();
  });

  it("doesn't send when another caller holds the claim", async () => {
    vi.mocked(claimConfirmation).mockResolvedValue(null);
    await sendConfirmation(db as unknown as Db, paidRow);
    expect(sendRegistrationConfirmed).not.toHaveBeenCalled();
  });

  it("logs a duplicate (key reused with another payload) and keeps the claim", async () => {
    vi.mocked(sendRegistrationConfirmed).mockResolvedValue({ status: "duplicate" });
    await sendConfirmation(db as unknown as Db, paidRow);
    expect(consoleWarn).toHaveBeenCalledWith("email.duplicate", { registrationId: ROW_ID });
    expect(releaseConfirmation).not.toHaveBeenCalled();
  });

  it.each([
    ["5k", "5:00 AM", "5:30 AM"],
    ["10k", "4:30 AM", "5:00 AM"],
    ["21k", "4:00 AM", "4:30 AM"],
    ["42k", "3:30 AM", "4:00 AM"],
  ] as const)("asks %s runners to assemble at %s for a %s gun", (race, assembly, gun) => {
    expect(confirmationDetails(row({ race }))).toMatchObject({
      raceLabel: RACES[race].label,
      assemblyTime: assembly,
      gunTime: gun,
    });
  });
});
