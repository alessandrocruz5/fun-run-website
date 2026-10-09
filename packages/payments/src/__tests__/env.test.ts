import { EnvValidationError } from "@rr/env";
import { describe, expect, it } from "vitest";
import { createPayMongoClient } from "../checkout";
import { getPaymentsEnv } from "../env";

const NOT_TEST_KEYS = [
  "sk_live_abc123",
  "pk_test_abc123",
  "pk_live_abc123",
  "sk_test_",
  " sk_test_abc123",
  "sk_test_abc123\n",
  "SK_TEST_abc123",
  "",
];

describe("getPaymentsEnv", () => {
  it("accepts a test secret key", () => {
    expect(getPaymentsEnv({ PAYMONGO_SECRET_KEY: "sk_test_abc123" }).PAYMONGO_SECRET_KEY).toBe(
      "sk_test_abc123",
    );
  });

  it.each(NOT_TEST_KEYS)("rejects %j", (key) => {
    expect(() => getPaymentsEnv({ PAYMONGO_SECRET_KEY: key })).toThrow(EnvValidationError);
  });

  it("rejects a missing key", () => {
    expect(() => getPaymentsEnv({})).toThrow(/PAYMONGO_SECRET_KEY/);
  });

  it("never repeats the rejected key", () => {
    expect(() => getPaymentsEnv({ PAYMONGO_SECRET_KEY: "sk_live_s3cr3tvalue" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("s3cr3tvalue") }),
    );
  });
});

describe("createPayMongoClient", () => {
  it.each(NOT_TEST_KEYS)("refuses %j even when passed directly", (key) => {
    expect(() => createPayMongoClient({ secretKey: key })).toThrow(/test secret keys/);
  });

  it("does not repeat the key it refused", () => {
    expect(() => createPayMongoClient({ secretKey: "sk_live_s3cr3tvalue" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("s3cr3tvalue") }),
    );
  });
});
