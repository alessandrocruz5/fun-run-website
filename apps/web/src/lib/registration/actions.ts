"use server";

import { attachCheckoutSession, createPending, getDb, markCancelled, RACES } from "@rr/db";
import { createPayMongoClient, getPaymentsEnv } from "@rr/payments";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSiteUrl, SITE } from "@/content/site";
import { CHECKOUT_COOKIE, logError } from "./confirm";
import { parseRegistration, type RegisterState, type RegistrationInput } from "./schema";

const CHECKOUT_FAILED =
  "We couldn't start the payment just now. Nothing was charged and your details are still here: please try again.";

/**
 * The registration form's action: save a pending registration, create its PayMongo checkout
 * session, save the session ID, then redirect to PayMongo. The price is the race's from `RACES`.
 */
export async function register(
  _previous: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const parsed = parseRegistration(formData);
  if (!parsed.success) return { status: "invalid", errors: parsed.errors, values: parsed.values };

  let checkoutUrl: string;
  try {
    checkoutUrl = await startCheckout(parsed.data);
  } catch {
    return { status: "error", message: CHECKOUT_FAILED, values: parsed.values };
  }
  // Outside the try: redirect() works by throwing.
  redirect(checkoutUrl);
}

async function startCheckout(input: RegistrationInput): Promise<string> {
  let registrationId: string | undefined;
  try {
    const siteUrl = getSiteUrl();
    const paymongo = createPayMongoClient({ secretKey: getPaymentsEnv().PAYMONGO_SECRET_KEY });
    const db = getDb();

    const registration = await createPending(db, input);
    registrationId = registration.id;

    const session = await paymongo.createCheckoutSession({
      registrationId: registration.id,
      lineItem: {
        name: `${SITE.name} ${SITE.edition} · ${RACES[registration.race].label}`,
        amountCentavos: registration.amountCentavos,
      },
      description: SITE.testModeNotice,
      successUrl: `${siteUrl}/register/success`,
      cancelUrl: `${siteUrl}/register/cancelled`,
    });

    if (!(await attachCheckoutSession(db, registration.id, session.id))) {
      throw new Error("Checkout session was not attached");
    }

    (await cookies()).set(CHECKOUT_COOKIE, session.id, {
      httpOnly: true,
      secure: siteUrl.startsWith("https://"),
      sameSite: "lax",
      path: "/register",
      maxAge: 60 * 60 * 24,
    });
    return session.checkoutUrl;
  } catch (error) {
    logError("registration.checkout_failed", error, registrationId ? { registrationId } : {});
    // A row that never got a checkout can't be paid: don't leave it pending.
    if (registrationId) await markCancelled(getDb(), registrationId).catch(() => null);
    throw error;
  }
}
