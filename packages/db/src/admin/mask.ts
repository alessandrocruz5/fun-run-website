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

/**
 * `juana@example.com` → `j•••@example.com`. A one-character local part is masked whole
 * (`j@x` → `•••@x`); without an `@`, only the mask.
 */
function maskedEmail(column: typeof r.email): SQL<string> {
  return sql<string>`case
    when position('@' in ${column}) > 2
      then left(${column}, 1) || ${MASK} || '@' || split_part(${column}, '@', 2)
    when position('@' in ${column}) = 2 then ${MASK} || '@' || split_part(${column}, '@', 2)
    else ${MASK} end`;
}

/** `+639170000001` → `•••01`. A number too short to hide stays fully masked. */
function maskedMobile(column: typeof r.mobile): SQL<string> {
  return sql<string>`case when length(${column}) > 6
    then ${MASK} || right(${column}, 2) else ${MASK} end`;
}

/**
 * The personal-data columns of `registrations` for a SELECT, raw for the owner and masked by the
 * database for everyone else. A viewer's birthdate and emergency contact are null: hidden, as
 * /privacy says.
 */
export function personalDataColumns(role: OrganizerRole) {
  if (canUnmask(role)) {
    return {
      email: sql<string>`${r.email}`,
      mobile: sql<string>`${r.mobile}`,
      birthdate: sql<string | null>`${r.birthdate}::text`,
      emergencyContactName: sql<string | null>`${r.emergencyContactName}`,
      emergencyContactMobile: sql<string | null>`${r.emergencyContactMobile}`,
    };
  }
  return {
    email: maskedEmail(r.email),
    mobile: maskedMobile(r.mobile),
    birthdate: sql<string | null>`null::text`,
    emergencyContactName: sql<string | null>`null::text`,
    emergencyContactMobile: sql<string | null>`null::text`,
  };
}
