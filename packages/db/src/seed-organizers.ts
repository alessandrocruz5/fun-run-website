import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { neon } from "@neondatabase/serverless";
import { baseEnvSchema, createEnv } from "@rr/env";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { z } from "zod";
import type { Db } from "./client";
import * as schema from "./schema";
import { authAccounts, authSessions, authUsers, type OrganizerRole } from "./schema";

/**
 * Creates or updates the dashboard's two accounts: `owner` (full data) and `viewer` (the public
 * demo, masked). There is no sign-up endpoint, so this is the only way an account is made.
 *
 *   pnpm --filter @rr/db seed:organizers
 *
 * Laptop only, as the Neon owner, with the variables in packages/db/.env (see .env.example).
 * Re-running it resets both passwords and signs both accounts out everywhere.
 */

export type OrganizerAccount = {
  role: OrganizerRole;
  name: string;
  email: string;
  password: string;
};

/** Better Auth caps passwords at 128 characters; both are generated, so 16 is the floor. */
const passwordSchema = z.string().min(16).max(128);

export const seedEnvSchema = baseEnvSchema
  .extend({
    /** Direct (non-pooled) owner URL of the Neon branch to seed. Never set in Vercel. */
    MIGRATE_DATABASE_URL: z.url(),
    ORGANIZER_OWNER_EMAIL: z.email(),
    ORGANIZER_OWNER_PASSWORD: passwordSchema,
    /** The same pair goes into the admin app's env, for the "Explore the organizer demo" button. */
    DEMO_VIEWER_EMAIL: z.email(),
    DEMO_VIEWER_PASSWORD: passwordSchema,
  })
  .refine(
    (env) => env.ORGANIZER_OWNER_EMAIL.toLowerCase() !== env.DEMO_VIEWER_EMAIL.toLowerCase(),
    {
      path: ["DEMO_VIEWER_EMAIL"],
      message: "must differ from ORGANIZER_OWNER_EMAIL",
    },
  );

export function organizerAccounts(env: z.infer<typeof seedEnvSchema>): OrganizerAccount[] {
  return [
    {
      role: "owner",
      name: "Clearwater Collective",
      email: env.ORGANIZER_OWNER_EMAIL,
      password: env.ORGANIZER_OWNER_PASSWORD,
    },
    {
      role: "viewer",
      name: "Demo viewer",
      email: env.DEMO_VIEWER_EMAIL,
      password: env.DEMO_VIEWER_PASSWORD,
    },
  ];
}

/**
 * Upserts each account by email, as Better Auth's own sign-up would store it: a lowercased email
 * and a `credential` account holding the scrypt hash. Then it deletes the account's sessions.
 */
export async function seedOrganizers(db: Db, accounts: OrganizerAccount[]): Promise<void> {
  for (const account of accounts) {
    const email = account.email.toLowerCase();
    const now = new Date();
    const [user] = await db
      .insert(authUsers)
      .values({
        id: randomUUID(),
        name: account.name,
        email,
        emailVerified: true,
        role: account.role,
      })
      .onConflictDoUpdate({
        target: authUsers.email,
        set: { name: account.name, role: account.role, updatedAt: now },
      })
      .returning({ id: authUsers.id });
    if (!user) throw new Error(`seed: no row returned for the ${account.role} account`);

    const password = await hashPassword(account.password);
    await db
      .insert(authAccounts)
      .values({
        id: randomUUID(),
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password,
      })
      .onConflictDoUpdate({
        target: [authAccounts.providerId, authAccounts.accountId],
        set: { password, updatedAt: now },
      });
    await db.delete(authSessions).where(eq(authSessions.userId, user.id));
  }
}

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const env = createEnv(seedEnvSchema);
  const db = drizzle({ client: neon(env.MIGRATE_DATABASE_URL), schema });
  await seedOrganizers(db, organizerAccounts(env));
  // Roles only: the addresses are personal data and stay out of terminal logs.
  console.log("seed:organizers: owner and viewer are ready; their old sessions were signed out.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
