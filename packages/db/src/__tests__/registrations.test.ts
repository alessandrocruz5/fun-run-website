import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../client";
import { RACE_IDS, RACES } from "../races";
import {
  attachCheckoutSession,
  claimConfirmation,
  createPending,
  type CreatePendingInput,
  getRegistrationByCheckoutSessionId,
  getRegistrationByReference,
  markCancelled,
  markConfirmationSent,
  type MarkPaidInput,
  markPaid,
  releaseConfirmation,
} from "../registrations";
import * as schema from "../schema";
import { registrations } from "../schema";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

let client: PGlite;
let db: Db;

beforeAll(async () => {
  client = new PGlite();
  db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder });
});

// Reset as the owner, then run every step as the app's least-privilege role.
beforeEach(async () => {
  await client.exec("RESET ROLE; TRUNCATE registrations; SET ROLE rr_app;");
});

afterAll(async () => {
  await client.close();
});

const runner: CreatePendingInput = {
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
};

async function pgErrorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
  throw new Error("Expected the query to fail");
}

async function pendingWithSession(checkoutSessionId = "cs_test_1") {
  const row = await createPending(db, runner);
  await attachCheckoutSession(db, row.id, checkoutSessionId);
  return row;
}

function payment(overrides: Partial<MarkPaidInput> = {}): MarkPaidInput {
  return {
    checkoutSessionId: "cs_test_1",
    amountCentavos: RACES["10k"].priceCentavos,
    paymentId: "pay_test_1",
    paymentMethod: "gcash",
    feeCentavos: 2_500,
    netCentavos: RACES["10k"].priceCentavos - 2_500,
    paidAt: new Date("2026-10-08T02:00:00Z"),
    ...overrides,
  };
}

describe("schema", () => {
  it("has indexes on status, race and created_at", async () => {
    await client.exec("RESET ROLE");
    const { rows } = await client.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE tablename = 'registrations'",
    );
    const defs = rows.map((r) => r.indexdef).join("\n");
    expect(defs).toMatch(/\(status\)/);
    expect(defs).toMatch(/\(race\)/);
    expect(defs).toMatch(/\(created_at\)/);
    expect(defs).toMatch(/UNIQUE INDEX .*\(reference\)/);
    expect(defs).toMatch(/UNIQUE INDEX .*\(checkout_session_id\)/);
  });

  it("has a nullable confirmation_claimed_at column", async () => {
    await client.exec("RESET ROLE");
    const { rows } = await client.query<{ data_type: string; is_nullable: string }>(
      "SELECT data_type, is_nullable FROM information_schema.columns " +
        "WHERE table_name = 'registrations' AND column_name = 'confirmation_claimed_at'",
    );
    expect(rows).toEqual([{ data_type: "timestamp with time zone", is_nullable: "YES" }]);
  });

  it("rejects a non-positive amount", async () => {
    const values = { ...runner, consentAt: new Date(), amountCentavos: 0 };
    expect(await pgErrorCode(db.insert(registrations).values(values))).toBe("23514");
  });

  it("rejects a paid row without paid_at", async () => {
    const row = await createPending(db, runner);
    const update = db
      .update(registrations)
      .set({ status: "paid" })
      .where(eq(registrations.id, row.id));
    expect(await pgErrorCode(update)).toBe("23514");
  });

  it("requires consent_at", async () => {
    const values = {
      ...runner,
      amountCentavos: 100,
    } as unknown as typeof registrations.$inferInsert;
    expect(await pgErrorCode(db.insert(registrations).values(values))).toBe("23502");
  });

  it("keeps checkout_session_id unique", async () => {
    await pendingWithSession("cs_test_dup");
    const other = await createPending(db, runner);
    expect(await pgErrorCode(attachCheckoutSession(db, other.id, "cs_test_dup"))).toBe("23505");
  });
});

describe("createPending", () => {
  it.each(RACE_IDS)("snapshots the %s price from RACES", async (race) => {
    const row = await createPending(db, { ...runner, race });
    expect(row.amountCentavos).toBe(RACES[race].priceCentavos);
    expect(row.status).toBe("pending");
    expect(row.consentAt).toBeInstanceOf(Date);
    expect(row.paidAt).toBeNull();
  });

  it("ignores an amount from the caller", async () => {
    const tampered = { ...runner, amountCentavos: 1 } as CreatePendingInput;
    const row = await createPending(db, tampered);
    expect(row.amountCentavos).toBe(RACES["10k"].priceCentavos);
  });

  it("gives each row a random, readable, unique reference", async () => {
    const rows = await Promise.all(Array.from({ length: 20 }, () => createPending(db, runner)));
    const refs = rows.map((r) => r.reference);
    for (const ref of refs) expect(ref).toMatch(/^RR-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("rejects an unknown race and missing consent without echoing personal data", async () => {
    const badRace = { ...runner, race: "100k" } as unknown as CreatePendingInput;
    const noConsent = { ...runner, consent: false } as unknown as CreatePendingInput;
    await expect(createPending(db, badRace)).rejects.toThrow("Unknown race");
    await expect(createPending(db, noConsent)).rejects.toThrow("Consent is required");
    await expect(createPending(db, noConsent)).rejects.not.toThrow(/juana|Dela Cruz|\+639/i);
  });
});

describe("lookups", () => {
  it("finds a registration by reference and by checkout session", async () => {
    const row = await pendingWithSession();
    expect((await getRegistrationByReference(db, row.reference))?.id).toBe(row.id);
    expect((await getRegistrationByCheckoutSessionId(db, "cs_test_1"))?.id).toBe(row.id);
    expect(await getRegistrationByReference(db, "RR-00000000")).toBeNull();
  });
});

describe("attachCheckoutSession", () => {
  it("sets the session once", async () => {
    const row = await createPending(db, runner);
    expect((await attachCheckoutSession(db, row.id, "cs_test_1"))?.checkoutSessionId).toBe(
      "cs_test_1",
    );
    expect(await attachCheckoutSession(db, row.id, "cs_test_2")).toBeNull();
    expect((await getRegistrationByReference(db, row.reference))?.checkoutSessionId).toBe(
      "cs_test_1",
    );
  });
});

describe("markPaid", () => {
  it("saves the payment details", async () => {
    await pendingWithSession();
    const paid = await markPaid(db, payment());
    expect(paid).toMatchObject({
      status: "paid",
      paymentId: "pay_test_1",
      paymentMethod: "gcash",
      feeCentavos: 2_500,
      netCentavos: 97_500,
      paidAt: new Date("2026-10-08T02:00:00Z"),
      confirmationClaimedAt: null,
      confirmationSentAt: null,
    });
  });

  it("changes nothing on a second call", async () => {
    const row = await pendingWithSession();
    const first = await markPaid(db, payment());
    const second = await markPaid(
      db,
      payment({ paymentId: "pay_test_2", paidAt: new Date("2026-10-09T00:00:00Z") }),
    );
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(await getRegistrationByReference(db, row.reference)).toEqual(first);
  });

  it("refuses an amount that differs from the snapshot", async () => {
    const row = await pendingWithSession();
    expect(await markPaid(db, payment({ amountCentavos: 1 }))).toBeNull();
    expect((await getRegistrationByReference(db, row.reference))?.status).toBe("pending");
  });

  it("ignores an unknown checkout session", async () => {
    await pendingWithSession();
    expect(await markPaid(db, payment({ checkoutSessionId: "cs_test_other" }))).toBeNull();
  });

  it("records a payment that arrives after cancellation", async () => {
    const row = await pendingWithSession();
    await markCancelled(db, row.id);
    expect((await markPaid(db, payment()))?.status).toBe("paid");
  });
});

describe("markCancelled", () => {
  it("cancels a pending row but never a paid one", async () => {
    const pending = await createPending(db, runner);
    expect((await markCancelled(db, pending.id))?.status).toBe("cancelled");

    const paid = await pendingWithSession();
    await markPaid(db, payment());
    expect(await markCancelled(db, paid.id)).toBeNull();
    expect((await getRegistrationByReference(db, paid.reference))?.status).toBe("paid");
  });
});

describe("claimConfirmation / markConfirmationSent / releaseConfirmation", () => {
  // Each test holds a single row, so a statement without WHERE moves only that row's clock.
  async function asOwner(statement: string) {
    await client.exec(`RESET ROLE; ${statement}; SET ROLE rr_app;`);
  }

  /** A registration paid just now, so a stale claim on it is inside the reclaim window. */
  async function paidRegistration() {
    const row = await pendingWithSession();
    await markPaid(db, payment({ paidAt: new Date() }));
    return row;
  }

  function stored(reference: string) {
    return getRegistrationByReference(db, reference);
  }

  it("does not claim an unpaid registration", async () => {
    const row = await pendingWithSession();
    expect(await claimConfirmation(db, row.id)).toBeNull();
  });

  it("claims without marking the email as sent, once", async () => {
    const row = await paidRegistration();
    const claimed = await claimConfirmation(db, row.id);
    expect(claimed?.confirmationClaimedAt).toBeInstanceOf(Date);
    expect(claimed?.confirmationSentAt).toBeNull();
    expect(await claimConfirmation(db, row.id)).toBeNull();
    expect(await stored(row.reference)).toMatchObject({
      confirmationClaimedAt: claimed?.confirmationClaimedAt,
      confirmationSentAt: null,
    });
  });

  it("returns a paid registration to exactly one of several concurrent callers", async () => {
    const row = await paidRegistration();
    const claims = await Promise.all(
      Array.from({ length: 5 }, () => claimConfirmation(db, row.id)),
    );
    const won = claims.filter((c) => c !== null);
    expect(won).toHaveLength(1);
    expect(won[0]?.confirmationClaimedAt).toBeInstanceOf(Date);
    expect(won[0]?.confirmationSentAt).toBeNull();
  });

  it("takes over a claim older than 5 minutes exactly once", async () => {
    const row = await paidRegistration();
    await claimConfirmation(db, row.id);
    await asOwner(
      "UPDATE registrations SET confirmation_claimed_at = now() - interval '6 minutes'",
    );
    const reclaimed = await claimConfirmation(db, row.id);
    expect(reclaimed?.confirmationClaimedAt?.getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(await claimConfirmation(db, row.id)).toBeNull();
  });

  it("leaves a claim that is only 4 minutes old alone", async () => {
    const row = await paidRegistration();
    await claimConfirmation(db, row.id);
    await asOwner(
      "UPDATE registrations SET confirmation_claimed_at = now() - interval '4 minutes'",
    );
    expect(await claimConfirmation(db, row.id)).toBeNull();
  });

  it("takes over a stale claim on a row paid 22 hours ago", async () => {
    const row = await paidRegistration();
    await claimConfirmation(db, row.id);
    await asOwner(
      "UPDATE registrations SET confirmation_claimed_at = now() - interval '6 minutes', " +
        "paid_at = now() - interval '22 hours'",
    );
    expect(await claimConfirmation(db, row.id)).not.toBeNull();
  });

  it("doesn't take over a stale claim on a row paid more than 23 hours ago", async () => {
    const row = await paidRegistration();
    await claimConfirmation(db, row.id);
    await asOwner(
      "UPDATE registrations SET confirmation_claimed_at = now() - interval '6 minutes', " +
        "paid_at = now() - interval '23 hours 5 minutes'",
    );
    expect(await claimConfirmation(db, row.id)).toBeNull();
  });

  it("never time-limits a first claim", async () => {
    const row = await paidRegistration();
    await asOwner("UPDATE registrations SET paid_at = now() - interval '30 hours'");
    expect(await claimConfirmation(db, row.id)).not.toBeNull();
  });

  it("records delivery once", async () => {
    const row = await paidRegistration();
    await claimConfirmation(db, row.id);
    expect(await markConfirmationSent(db, row.id)).toBe(true);
    const sentAt = (await stored(row.reference))?.confirmationSentAt;
    expect(sentAt).toBeInstanceOf(Date);
    expect(await markConfirmationSent(db, row.id)).toBe(false);
    expect((await stored(row.reference))?.confirmationSentAt).toEqual(sentAt);
  });

  it("records delivery even after the claim was taken over", async () => {
    const row = await paidRegistration();
    await claimConfirmation(db, row.id);
    await asOwner(
      "UPDATE registrations SET confirmation_claimed_at = now() - interval '6 minutes'",
    );
    expect(await claimConfirmation(db, row.id)).not.toBeNull();
    expect(await markConfirmationSent(db, row.id)).toBe(true);
  });

  it("never claims or releases a delivered row, even with a stale claim", async () => {
    const row = await paidRegistration();
    await claimConfirmation(db, row.id);
    await markConfirmationSent(db, row.id);
    expect(await claimConfirmation(db, row.id)).toBeNull();
    expect(await releaseConfirmation(db, row.id)).toBe(false);

    await asOwner(
      "UPDATE registrations SET confirmation_claimed_at = now() - interval '6 minutes'",
    );
    expect(await claimConfirmation(db, row.id)).toBeNull();
    const after = await stored(row.reference);
    expect(after?.confirmationClaimedAt).toBeInstanceOf(Date);
    expect(after?.confirmationSentAt).toBeInstanceOf(Date);
  });

  it("can be claimed again after a release", async () => {
    const row = await paidRegistration();
    await claimConfirmation(db, row.id);
    expect(await releaseConfirmation(db, row.id)).toBe(true);
    expect(await stored(row.reference)).toMatchObject({
      confirmationClaimedAt: null,
      confirmationSentAt: null,
    });
    expect(await claimConfirmation(db, row.id)).not.toBeNull();
  });

  it("reports when there was no claim to release", async () => {
    const pending = await pendingWithSession();
    expect(await releaseConfirmation(db, pending.id)).toBe(false);
    await markPaid(db, payment({ paidAt: new Date() }));
    expect(await releaseConfirmation(db, pending.id)).toBe(false);
  });
});
