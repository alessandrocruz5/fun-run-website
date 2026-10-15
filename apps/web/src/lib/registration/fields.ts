/**
 * Names of the registration form's bot-check inputs, shared by the client form and the server
 * action. No imports on purpose: the client form imports this as a value, so it must stay free of
 * server code and zod.
 */

/** The hidden input the widget adds to the form. */
export const TURNSTILE_FIELD = "cf-turnstile-response";

/**
 * A decoy input, hidden from people. A bot that fills in every input fills this too. The name
 * is one browsers don't autofill, so a person never sets it by accident.
 */
export const HONEYPOT_FIELD = "fax_number";
