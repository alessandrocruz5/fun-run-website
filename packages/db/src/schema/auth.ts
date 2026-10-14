import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Better Auth's tables for the organizer dashboard (`apps/admin`), with the admin plugin's columns.
 * Each property key is the Better Auth field name, so the Drizzle adapter maps them as-is; pass
 * `authSchema` as the adapter's `schema`. Only `rr_admin` may touch these tables (migration 0003):
 * the public site's `rr_app` has no grant on them.
 */

/** `owner` sees full registration data; `viewer` (the public demo) sees it masked. */
export const ORGANIZER_ROLES = ["owner", "viewer"] as const;
export type OrganizerRole = (typeof ORGANIZER_ROLES)[number];

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const authUsers = pgTable(
  "auth_users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    ...timestamps,
    /** Admin plugin. Defaults to the least-privileged role. */
    role: text("role", { enum: ORGANIZER_ROLES }).notNull().default("viewer"),
    banned: boolean("banned").default(false),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires", { withTimezone: true }),
  },
  (t) => [check("auth_users_role_valid", sql`${t.role} IN ('owner', 'viewer')`)],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Always null: the app doesn't keep visitors' addresses or browsers on the session. */
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
    /** Admin plugin. */
    impersonatedBy: text("impersonated_by"),
  },
  (t) => [index("auth_sessions_user_id_idx").on(t.userId)],
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    /** Scrypt hash from `better-auth/crypto`, for the `credential` provider. */
    password: text("password"),
    ...timestamps,
  },
  (t) => [
    index("auth_accounts_user_id_idx").on(t.userId),
    uniqueIndex("auth_accounts_provider_account_key").on(t.providerId, t.accountId),
  ],
);

export const authVerifications = pgTable(
  "auth_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("auth_verifications_identifier_idx").on(t.identifier)],
);

/** Sign-in rate limits, shared by every instance. `key` is `<ip>|<path>`; stale rows are pruned. */
export const authRateLimits = pgTable("auth_rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/** Keyed by Better Auth's model names, as the Drizzle adapter expects. */
export const authSchema = {
  user: authUsers,
  session: authSessions,
  account: authAccounts,
  verification: authVerifications,
  rateLimit: authRateLimits,
};

export type AuthUser = typeof authUsers.$inferSelect;
