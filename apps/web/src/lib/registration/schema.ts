import { RACE_IDS } from "@rr/db/races";
import { sexEnum, shirtSizeEnum } from "@rr/db/schema";
import { z } from "zod";

/**
 * The registration form's fields and their server-side validation. Server only: the form imports
 * types from here, never values, so zod stays out of the browser.
 *
 * There is no price field. Any amount posted with the form is dropped here, and the price is
 * taken from `RACES` when the row is created.
 */

export const SHIRT_SIZES = shirtSizeEnum.enumValues;
export const SEXES = sexEnum.enumValues;

const personName = (what: string) =>
  z.string().trim().min(1, `Enter ${what}.`).max(100, `Keep ${what} under 100 characters.`);

/** A Philippine mobile number in any common spelling, stored as `+639XXXXXXXXX`. */
const mobile = (what: string) =>
  z
    .string()
    .transform((v) => v.replace(/[\s().-]/g, ""))
    .refine((v) => /^(?:\+?63|0)9\d{9}$/.test(v), `Enter ${what} like 0917 123 4567.`)
    .transform((v) => `+63${v.slice(-10)}`);

export const registrationSchema = z.object({
  race: z.enum(RACE_IDS, { error: "Choose a race." }),
  firstName: personName("your first name"),
  lastName: personName("your last name"),
  email: z
    .string()
    .trim()
    .pipe(z.email("Enter an email address like name@example.com.").max(254, "Email is too long.")),
  mobile: mobile("your mobile number"),
  birthdate: z.iso
    .date("Enter your birthdate.")
    .refine(
      (d) => d >= "1900-01-01" && d <= new Date().toISOString().slice(0, 10),
      "Enter a birthdate in the past.",
    ),
  sex: z.enum(SEXES, { error: "Choose one." }),
  shirtSize: z.enum(SHIRT_SIZES, { error: "Choose a shirt size." }),
  emergencyContactName: personName("a name"),
  emergencyContactMobile: mobile("a mobile number"),
  consent: z
    .literal("yes", { error: "Agree to the privacy notice to register." })
    .transform(() => true as const),
});

export type RegistrationInput = z.output<typeof registrationSchema>;
export type RegisterField = keyof z.input<typeof registrationSchema>;

const FIELDS = Object.keys(registrationSchema.shape) as RegisterField[];

/** What the form shows after a submit that didn't reach PayMongo. */
export type RegisterState = {
  status: "idle" | "invalid" | "error";
  /** One message per invalid field. */
  errors?: Partial<Record<RegisterField, string>>;
  /** A message for the whole form, e.g. when PayMongo can't be reached. */
  message?: string;
  /** What the runner typed, so the form can show it again. Sent back to them only, never logged. */
  values?: Partial<Record<RegisterField, string>>;
};

export type ParsedRegistration =
  | { success: true; data: RegistrationInput; values: Partial<Record<RegisterField, string>> }
  | {
      success: false;
      errors: Partial<Record<RegisterField, string>>;
      values: Partial<Record<RegisterField, string>>;
    };

/** Read the form's known fields only. Anything else posted (a price, an amount) is ignored. */
export function parseRegistration(formData: FormData): ParsedRegistration {
  const values: Partial<Record<RegisterField, string>> = {};
  for (const field of FIELDS) {
    const value = formData.get(field);
    // An unticked checkbox or unchosen radio isn't posted: validate it as empty.
    values[field] = typeof value === "string" ? value : "";
  }

  const result = registrationSchema.safeParse(values);
  if (result.success) return { success: true, data: result.data, values };

  const errors: Partial<Record<RegisterField, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as RegisterField;
    errors[field] ??= issue.message;
  }
  return { success: false, errors, values };
}
