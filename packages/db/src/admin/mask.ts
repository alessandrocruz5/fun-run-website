import { type SQL, sql } from "drizzle-orm";
import { type OrganizerRole, registrations } from "../schema";

/**
 * Masking by role for the organizer dashboard. A viewer's personal data is masked by Postgres in
 * the SELECT itself, so the raw value never reaches the app, the page or the browser. The UI only
 * displays what the query returned.
 */

export const MASK = "•••";

/** Only `owner` sees personal data unmasked; any other role is masked (fail closed). */
export function canUnmask(role: OrganizerRole): boolean {
  return role === "owner";
}

const r = registrations;

/** `juana@example.com` → `j•••@example.com`. Without an `@`, only the mask. */
function maskedEmail(column: typeof r.email): SQL<string> {
  return sql<string>`case when position('@' in ${column}) > 1
    then left(${column}, 1) || ${MASK} || '@' || split_part(${column}, '@', 2)
    else ${MASK} end`;
}

/** `+639170000001` → `•••01`. A number too short to hide stays fully masked. */
function maskedMobile(column: typeof r.mobile | typeof r.emergencyContactMobile): SQL<string> {
  return sql<string>`case when length(${column}) > 6
    then ${MASK} || right(${column}, 2) else ${MASK} end`;
}

/** `Pedro Dela Cruz` → `P•••`. */
function maskedName(column: typeof r.emergencyContactName): SQL<string> {
  return sql<string>`case when length(${column}) > 1 then left(${column}, 1) || ${MASK} else ${MASK} end`;
}

/**
 * The personal-data columns of `registrations` for a SELECT, raw for the owner and masked by the
 * database for everyone else. A viewer's `birthdate` is null.
 */
export function personalDataColumns(role: OrganizerRole) {
  if (canUnmask(role)) {
    return {
      email: sql<string>`${r.email}`,
      mobile: sql<string>`${r.mobile}`,
      birthdate: sql<string | null>`${r.birthdate}::text`,
      emergencyContactName: sql<string>`${r.emergencyContactName}`,
      emergencyContactMobile: sql<string>`${r.emergencyContactMobile}`,
    };
  }
  return {
    email: maskedEmail(r.email),
    mobile: maskedMobile(r.mobile),
    birthdate: sql<string | null>`null::text`,
    emergencyContactName: maskedName(r.emergencyContactName),
    emergencyContactMobile: maskedMobile(r.emergencyContactMobile),
  };
}
