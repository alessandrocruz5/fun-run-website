import * as crypto from "node:crypto";
import { EnvValidationError } from "@rr/env";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCheckoutSession, PayMongoError } from "../checkout";
import { getWebhookEnv } from "../env";
import {
  CHECKOUT_SESSION_PAID,
  parseWebhookEvent,
  SIGNATURE_TOLERANCE_SECONDS,
  verifyWebhookSignature,
} from "../webhook";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof crypto>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const SECRET = "whsk_testsecret";
const T = 1_496_734_173;

function sign(rawBody: string, t: number | string = T, secret = SECRET) {
  return crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
}

function verify(header: string | null | undefined, rawBody: string, now = T) {
  return verifyWebhookSignature({ header, rawBody, secret: SECRET, now });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("verifyWebhookSignature", () => {
  it("matches a fixed vector: hex HMAC-SHA256 of `t.body` (computed with openssl)", () => {
    const rawBody = '{"data":{"id":"evt_test1"}}';
    const te = "99891e41d1b4082f7f6b8da075fa9b698cd7551d59d592587a3dcb659e5eea65";
    expect(verify(`t=${T},te=${te},li=`, rawBody)).toEqual({ ok: true });
  });

  it("accepts PayMongo's test-mode header, comparing in constant time", () => {
    const rawBody = '{"data":{"id":"evt_1","attributes":{"type":"x"}}}';
    expect(verify(`t=${T},te=${sign(rawBody)},li=`, rawBody)).toEqual({ ok: true });
    expect(crypto.timingSafeEqual).toHaveBeenCalledTimes(1);
  });

  it("accepts any key order, spaces and upper-case hex", () => {
    const rawBody = "{}";
    expect(verify(` li= , te=${sign(rawBody).toUpperCase()} , t=${T},`, rawBody)).toEqual({
      ok: true,
    });
  });

  it.each([
    ["at the start of the window", T - SIGNATURE_TOLERANCE_SECONDS],
    ["at the end of the window", T + SIGNATURE_TOLERANCE_SECONDS],
  ])("accepts a timestamp %s", (_case, t) => {
    expect(verify(`t=${t},te=${sign("{}", t)},li=`, "{}")).toEqual({ ok: true });
  });

  it.each([
    ["older than 5 minutes", T - SIGNATURE_TOLERANCE_SECONDS - 1],
    ["more than 5 minutes ahead", T + SIGNATURE_TOLERANCE_SECONDS + 1],
  ])("refuses a correctly signed timestamp %s", (_case, t) => {
    expect(verify(`t=${t},te=${sign("{}", t)},li=`, "{}")).toEqual({ ok: false, reason: "stale" });
  });

  it.each([null, undefined, ""])("refuses a missing header (%j)", (header) => {
    expect(verify(header, "{}")).toEqual({ ok: false, reason: "missing" });
  });

  it.each([
    ["no te", `t=${T},li=`],
    ["an empty te (a live-mode delivery)", `t=${T},te=,li=${sign("{}")}`],
    ["no t", `te=${sign("{}")},li=`],
    ["a non-numeric t", `t=abc,te=${sign("{}", "abc")},li=`],
    ["a negative t", `t=-${T},te=${sign("{}", `-${T}`)},li=`],
    ["a te that isn't hex", `t=${T},te=${"z".repeat(64)},li=`],
    ["a short te", `t=${T},te=${sign("{}").slice(0, 62)},li=`],
    ["a repeated te", `t=${T},te=${"0".repeat(64)},te=${sign("{}")},li=`],
    ["a part without =", `t=${T},te=${sign("{}")},li`],
    ["a bare signature", sign("{}")],
  ])("refuses a header with %s", (_case, header) => {
    expect(verify(header, "{}")).toEqual({ ok: false, reason: "malformed" });
    expect(crypto.timingSafeEqual).not.toHaveBeenCalled();
  });

  it.each([
    ["another secret", `t=${T},te=${sign("{}", T, "whsk_other")},li=`, "{}"],
    ["a changed body", `t=${T},te=${sign('{"a":1}')},li=`, '{"a":2}'],
    ["a re-serialized body", `t=${T},te=${sign('{"a": 1}')},li=`, '{"a":1}'],
    ["a changed timestamp", `t=${T + 1},te=${sign("{}", T)},li=`, "{}"],
    ["the right signature in li only", `t=${T},te=${"0".repeat(64)},li=${sign("{}")}`, "{}"],
  ])("refuses a signature made with %s", (_case, header, rawBody) => {
    expect(verify(header, rawBody)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("defaults to the current time", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(
      verifyWebhookSignature({
        header: `t=${now},te=${sign("{}", now)},li=`,
        rawBody: "{}",
        secret: SECRET,
      }),
    ).toEqual({ ok: true });
    expect(
      verifyWebhookSignature({
        header: `t=${T},te=${sign("{}")},li=`,
        rawBody: "{}",
        secret: SECRET,
      }),
    ).toEqual({ ok: false, reason: "stale" });
  });
});

const checkoutSession = {
  id: "cs_test1",
  type: "checkout_session",
  attributes: {
    checkout_url: "https://checkout.paymongo.com/cs_test1_client_x",
    status: "active",
    livemode: false,
    metadata: { registration_id: "reg-1" },
    payments: [
      {
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
          source: { id: "src_x", type: "gcash" },
        },
      },
    ],
  },
};

const paidEvent = {
  data: {
    id: "evt_test1",
    type: "event",
    attributes: {
      type: CHECKOUT_SESSION_PAID,
      livemode: false,
      data: checkoutSession,
      previous_data: {},
      created_at: T,
      updated_at: T,
    },
  },
};

describe("parseWebhookEvent", () => {
  it("reads the event, whose data is the checkout session", () => {
    const event = parseWebhookEvent(JSON.stringify(paidEvent));
    expect(event).toEqual({
      id: "evt_test1",
      type: CHECKOUT_SESSION_PAID,
      livemode: false,
      data: checkoutSession,
    });
    expect(parseCheckoutSession(event.data).payments[0]).toMatchObject({
      method: "gcash",
      feeCentavos: 2_500,
      netCentavos: 97_500,
    });
  });

  it("reads livemode as sent", () => {
    const live = structuredClone(paidEvent);
    live.data.attributes.livemode = true;
    expect(parseWebhookEvent(JSON.stringify(live)).livemode).toBe(true);
  });

  it.each([
    ["not JSON", "juana@example.test"],
    ["no attributes", JSON.stringify({ data: { id: "evt_1" } })],
    ["no livemode", JSON.stringify({ data: { id: "evt_1", attributes: { type: "x" } } })],
    ["an array", "[]"],
  ])("refuses %s without quoting the body", (_case, rawBody) => {
    expect(() => parseWebhookEvent(rawBody)).toThrow(PayMongoError);
    expect(() => parseWebhookEvent(rawBody)).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("juana") }),
    );
  });
});

describe("getWebhookEnv", () => {
  it("accepts the webhook's secret key", () => {
    expect(getWebhookEnv({ PAYMONGO_WEBHOOK_SECRET: SECRET }).PAYMONGO_WEBHOOK_SECRET).toBe(SECRET);
  });

  it("doesn't need the API key", () => {
    expect(() => getWebhookEnv({ PAYMONGO_WEBHOOK_SECRET: SECRET })).not.toThrow();
  });

  it.each(["", "sk_test_abc123", "pk_test_abc123", "sk_live_abc123", " whsk_x", "whsk_x\n"])(
    "rejects %j",
    (secret) => {
      expect(() => getWebhookEnv({ PAYMONGO_WEBHOOK_SECRET: secret })).toThrow(EnvValidationError);
    },
  );

  it("rejects a missing secret, naming the key but not repeating a value", () => {
    expect(() => getWebhookEnv({})).toThrow(/PAYMONGO_WEBHOOK_SECRET/);
    expect(() => getWebhookEnv({ PAYMONGO_WEBHOOK_SECRET: "sk_test_s3cr3tvalue" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("s3cr3tvalue") }),
    );
  });
});
