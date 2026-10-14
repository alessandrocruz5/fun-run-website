import { ORGANIZER_ROLES, type OrganizerRole } from "@rr/db/schema";
import { createAccessControl } from "better-auth/plugins/access";

export { ORGANIZER_ROLES, type OrganizerRole };

/**
 * What each organizer role may do with registrations. Neither role holds any of the admin
 * plugin's `user` or `session` permissions, so every `/admin/*` endpoint refuses both: nobody can
 * create users, change roles or impersonate from the dashboard. Accounts come from the seed only.
 */
export const ac = createAccessControl({ registration: ["read", "unmask"] });

export const roles = {
  /** Full registration data. */
  owner: ac.newRole({ registration: ["read", "unmask"] }),
  /** The public demo: email, phone, birthdate and emergency contact are masked. */
  viewer: ac.newRole({ registration: ["read"] }),
} satisfies Record<OrganizerRole, unknown>;

export function isOrganizerRole(value: unknown): value is OrganizerRole {
  return typeof value === "string" && (ORGANIZER_ROLES as readonly string[]).includes(value);
}

/** Whether `role` may see registrations' personal data unmasked. */
export function canSeePersonalData(role: OrganizerRole): boolean {
  return roles[role].authorize({ registration: ["unmask"] }).success;
}
