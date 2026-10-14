import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../client";
import * as schema from "../../schema";
import { registrations } from "../../schema";
import { canUnmask, MASK, personalDataColumns } from "../mask";

const migrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url));

let client: PGlite;
let db: Db;

const base = {
  race: "5k",
  firstName: "Juana",
  lastName: "Dela Cruz",
  sex: "female",
  shirtSize: "M",
  consentAt: new Date(),
  amountCentavos: 80_000,
} as const;

const runners = [
  {
    reference: "RR-AAAAAAA1",
    email: "juana.delacruz@example.com",
    mobile: "+639170000001",
    birthdate: "1990-05-17",
    emergencyContactName: "Pedro Dela Cruz",
    emergencyContactMobile: "+639170000002",
  },
  // Edge cases: too short to keep any of it, or no `@` at all.
  {
    reference: "RR-AAAAAAA2",
    email: "j@x",
    mobile: "123456",
    birthdate: "2001-01-01",
    emergencyContactName: "P",
    emergencyContactMobile: "12",
  },
  {
    reference: "RR-AAAAAAA3",
    email: "not-an-email",
    mobile: "+639170000003",
    birthdate: "1980-12-31",
    emergencyContactName: "Ana",
    emergencyContactMobile: "+639170000004",
  },
];

beforeAll(async () => {
  client = new PGlite();
  db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder });
  await db.insert(registrations).values(runners.map((r) => ({ ...base, ...r })));
  await client.exec("SET ROLE rr_admin");
});

afterAll(async () => {
  await client.close();
});

function selectAs(role: "owner" | "viewer") {
  return db
    .select(personalDataColumns(role))
    .from(registrations)
    .orderBy(asc(registrations.reference));
}

describe("canUnmask", () => {
  it("unmasks for the owner only", () => {
    expect(canUnmask("owner")).toBe(true);
    expect(canUnmask("viewer")).toBe(false);
    expect(canUnmask("admin" as never)).toBe(false);
  });
});

describe("personalDataColumns", () => {
  it("returns the owner the stored values", async () => {
    expect(await selectAs("owner")).toEqual(
      runners.map(({ reference: _, ...personal }) => personal),
    );
  });

  it("masks the viewer's values in Postgres", async () => {
    expect(await selectAs("viewer")).toEqual([
      {
        email: `j${MASK}@example.com`,
        mobile: `${MASK}01`,
        birthdate: null,
        emergencyContactName: null,
        emergencyContactMobile: null,
      },
      {
        email: `${MASK}@x`,
        mobile: MASK,
        birthdate: null,
        emergencyContactName: null,
        emergencyContactMobile: null,
      },
      {
        email: MASK,
        mobile: `${MASK}03`,
        birthdate: null,
        emergencyContactName: null,
        emergencyContactMobile: null,
      },
    ]);
  });

  it("never returns the viewer a stored value", async () => {
    const returned = JSON.stringify(await selectAs("viewer"));
    for (const { reference: _, ...personal } of runners) {
      for (const value of Object.values(personal)) expect(returned).not.toContain(`"${value}"`);
    }
  });
});
