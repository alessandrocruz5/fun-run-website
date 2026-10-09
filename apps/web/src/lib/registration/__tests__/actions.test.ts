import { attachCheckoutSession, createPending, markCancelled, type Registration } from "@rr/db";
import { RACES } from "@rr/db/races";
import { redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "../actions";
import type { RegisterState } from "../schema";

const calls = vi.hoisted(() => [] as string[]);
const db = vi.hoisted(() => ({ fake: "db" }));
const cookieSet = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ cookies: async () => ({ set: cookieSet }) }));
vi.mock("next/navigation", () => ({
  // Like Next's: redirect() throws, so it must not sit inside a try/catch.
  redirect: vi.fn((url: string) => {
    calls.push("redirect");
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock("@rr/db", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDb: () => db,
  createPending: vi.fn(),
  attachCheckoutSession: vi.fn(),
  markCancelled: vi.fn(),
}));

const ROW_ID = "0b9f6c1e-1111-4222-8333-444455556666";
const CHECKOUT_URL = "https://checkout.paymongo.com/cs_test1_client_x#cGtfdGVzdA==";
const idle: RegisterState = { status: "idle" };

const runner = {
  race: "10k",
  firstName: "Juana",
  lastName: "Dela Cruz",
  email: "juana@example.test",
  mobile: "0917 000 0000",
  birthdate: "1990-05-17",
  sex: "female",
  shirtSize: "M",
  emergencyContactName: "Pedro Dela Cruz",
  emergencyContactMobile: "+63 917-000-0001",
  consent: "yes",
};
const PERSONAL = /juana|dela cruz|pedro|example\.test|917/i;

function form(overrides: Record<string, string | null> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...runner, ...overrides })) {
    if (value !== null) data.append(key, value);
  }
  return data;
}

/** What the real `createPending` returns: the price comes from RACES, whatever was posted. */
function pendingRow(race: keyof typeof RACES): Registration {
  return {
    id: ROW_ID,
    reference: "RR-TEST0001",
    race,
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
    amountCentavos: RACES[race].priceCentavos,
    status: "pending",
    checkoutSessionId: null,
    paymentId: null,
    paymentMethod: null,
    feeCentavos: null,
    netCentavos: null,
    paidAt: null,
    confirmationSentAt: null,
    createdAt: new Date(),
  };
}

function payMongoReplies(response: () => Response | Promise<Response>) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    calls.push("paymongo");
    return response();
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const sessionCreated = () =>
  Response.json({
    data: {
      id: "cs_test1",
      attributes: { checkout_url: CHECKOUT_URL, status: "active", livemode: false, payments: [] },
    },
  });

function sentBody(fetch: ReturnType<typeof payMongoReplies>) {
  const init = fetch.mock.calls[0]?.[1];
  return JSON.parse(String(init?.body));
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("SITE_URL", "https://riverline.test/");
  vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_abc123");
  vi.mocked(createPending).mockImplementation(async (_db, input) => {
    calls.push("createPending");
    return pendingRow(input.race);
  });
  vi.mocked(attachCheckoutSession).mockImplementation(async (_db, id, checkoutSessionId) => {
    calls.push("attachCheckoutSession");
    return { ...pendingRow("10k"), id, checkoutSessionId };
  });
  vi.mocked(markCancelled).mockResolvedValue(null);
  cookieSet.mockImplementation(() => calls.push("cookie"));
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  consoleError.mockRestore();
});

describe("register", () => {
  it("saves a pending registration, creates the checkout, saves the session ID, then redirects", async () => {
    payMongoReplies(sessionCreated);
    await expect(register(idle, form())).rejects.toThrow(`NEXT_REDIRECT ${CHECKOUT_URL}`);

    expect(calls).toEqual([
      "createPending",
      "paymongo",
      "attachCheckoutSession",
      "cookie",
      "redirect",
    ]);
    expect(attachCheckoutSession).toHaveBeenCalledWith(db, ROW_ID, "cs_test1");
    expect(cookieSet).toHaveBeenCalledWith("rr_checkout", "cs_test1", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/register",
      maxAge: 86_400,
    });
  });

  it("passes the validated runner on with consent, mobile numbers normalised", async () => {
    payMongoReplies(sessionCreated);
    await register(idle, form()).catch(() => undefined);
    expect(createPending).toHaveBeenCalledWith(db, {
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
      consent: true,
    });
  });

  it("charges the RACES price whatever price the form posts", async () => {
    const fetch = payMongoReplies(sessionCreated);
    const tampered = form({
      race: "42k",
      amount: "1",
      amountCentavos: "1",
      price: "1",
      priceCentavos: "100",
    });
    await register(idle, tampered).catch(() => undefined);

    const input = vi.mocked(createPending).mock.calls[0]?.[1];
    expect(input).toBeDefined();
    expect(Object.keys(input ?? {})).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/amount|price/i)]),
    );
    expect(sentBody(fetch).data.attributes.line_items).toEqual([
      expect.objectContaining({ amount: RACES["42k"].priceCentavos, currency: "PHP", quantity: 1 }),
    ]);
  });

  it("sends PayMongo the registration ID as its only metadata, and no personal data", async () => {
    const fetch = payMongoReplies(sessionCreated);
    await register(idle, form()).catch(() => undefined);

    const body = sentBody(fetch);
    expect(body.data.attributes.metadata).toEqual({ registration_id: ROW_ID });
    expect(JSON.stringify(body)).not.toMatch(PERSONAL);
    expect(body.data.attributes).toMatchObject({
      success_url: "https://riverline.test/register/success",
      cancel_url: "https://riverline.test/register/cancelled",
    });
  });

  it("requires consent", async () => {
    const fetch = payMongoReplies(sessionCreated);
    const state = await register(idle, form({ consent: null }));

    expect(state).toMatchObject({ status: "invalid", errors: { consent: expect.any(String) } });
    expect(Object.keys(state.errors ?? {})).toEqual(["consent"]);
    expect(createPending).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns an error per field and what was typed, without saving anything", async () => {
    const state = await register(
      idle,
      form({ firstName: "   ", email: "juana@", mobile: "12345", sex: null, race: "100k" }),
    );

    expect(state.status).toBe("invalid");
    expect(Object.keys(state.errors ?? {}).sort()).toEqual(
      ["email", "firstName", "mobile", "race", "sex"].sort(),
    );
    expect(state.values).toMatchObject({ email: "juana@", mobile: "12345", lastName: "Dela Cruz" });
    expect(createPending).not.toHaveBeenCalled();
  });

  it("rejects a birthdate in the future", async () => {
    const state = await register(idle, form({ birthdate: "2999-01-01" }));
    expect(state.errors).toEqual({ birthdate: expect.any(String) });
  });

  it.each([
    [
      "PayMongo answers with an error",
      () => Response.json({ errors: [{ code: "x" }] }, { status: 500 }),
    ],
    [
      "PayMongo can't be reached",
      () => {
        throw new TypeError("fetch failed");
      },
    ],
  ])("when %s, shows a retry message and cancels the unpaid row", async (_case, reply) => {
    payMongoReplies(reply);
    const state = await register(idle, form());

    expect(state).toMatchObject({
      status: "error",
      message: expect.stringMatching(/try again/i),
      values: expect.objectContaining({ email: "juana@example.test" }),
    });
    expect(markCancelled).toHaveBeenCalledWith(db, ROW_ID);
    expect(attachCheckoutSession).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("logs a failure without personal data", async () => {
    vi.mocked(createPending).mockRejectedValue(
      new Error("Failed query: insert … params: Juana,Dela Cruz,juana@example.test"),
    );
    const state = await register(idle, form());

    expect(state.status).toBe("error");
    expect(consoleError).toHaveBeenCalledWith("registration.checkout_failed", { error: "Error" });
    expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(PERSONAL);
  });

  it("shows the retry message when the server isn't configured", async () => {
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_live_abc123");
    const state = await register(idle, form());
    expect(state.status).toBe("error");
    expect(createPending).not.toHaveBeenCalled();
  });
});
