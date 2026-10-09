import { ButtonLink } from "@rr/ui";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { formatPeso, getRaceView, SITE } from "@/content/site";
import { type CheckoutCheck, CHECKOUT_COOKIE, checkCheckout } from "@/lib/registration/confirm";

export const metadata: Metadata = {
  title: "Registration",
  robots: { index: false },
};

const METHOD_LABELS: Record<string, string> = {
  card: "Card",
  gcash: "GCash",
  paymaya: "Maya",
  grab_pay: "GrabPay",
};

const NOT_CONFIRMED: Record<
  Exclude<CheckoutCheck["status"], "paid">,
  { eyebrow: string; title: string; body: string; checkAgain: boolean }
> = {
  unpaid: {
    eyebrow: "PAYMENT NOT RECEIVED YET",
    title: "Almost there.",
    body: "PayMongo hasn't confirmed your payment yet. If you've just paid, check again in a few seconds.",
    checkAgain: true,
  },
  unavailable: {
    eyebrow: "COULDN'T CHECK YOUR PAYMENT",
    title: "We couldn't check just now.",
    body: "The payment provider or our database didn't answer. Nothing is lost: check again in a minute.",
    checkAgain: true,
  },
  not_found: {
    eyebrow: "NO CHECKOUT FOUND",
    title: "We can't find your checkout.",
    body: "This page works in the browser you registered with, for a day after you start paying. If you haven't paid, register again.",
    checkAgain: false,
  },
  rejected: {
    eyebrow: "NOT CONFIRMED",
    title: "We couldn't confirm this payment.",
    body: `The payment didn't match your registration, so it wasn't recorded. Email ${SITE.privacyContact} with the time you paid.`,
    checkAgain: false,
  },
};

/**
 * Where PayMongo sends the runner after paying. It reads no URL parameters: the checkout session
 * comes from the httpOnly cookie the form set, and the page says "Confirmed" only after
 * `checkCheckout()` has read that session from PayMongo, matched the amount and recorded it.
 */
export default async function RegisterSuccessPage() {
  const result = await checkCheckout((await cookies()).get(CHECKOUT_COOKIE)?.value);

  if (result.status !== "paid") {
    const copy = NOT_CONFIRMED[result.status];
    return (
      <main className="wrap prose">
        <p className="mono">{copy.eyebrow}</p>
        <h1 className="disp">{copy.title}</h1>
        <p>{copy.body}</p>
        <div className="row">
          {copy.checkAgain && (
            <ButtonLink href="/register/success" variant="accent">
              CHECK AGAIN
            </ButtonLink>
          )}
          <ButtonLink href="/#register" variant={copy.checkAgain ? "outline" : "accent"}>
            BACK TO REGISTRATION
          </ButtonLink>
        </div>
      </main>
    );
  }

  const registration = result.registration;
  const race = getRaceView(registration.race);
  const method = registration.paymentMethod
    ? (METHOD_LABELS[registration.paymentMethod] ?? registration.paymentMethod)
    : null;

  return (
    <main className="wrap sec">
      <div className="done dark">
        <div className="stack gap-[18px]">
          <p className="mono m-0 text-accent">✓ CONFIRMED · TEST PAYMENT, NO CHARGE MADE</p>
          <h1 className="disp text-[clamp(40px,5vw,64px)] leading-[0.92]">You&apos;re in.</h1>
          <p className="m-0 text-[17px] leading-normal opacity-85">
            Your {race.label} entry is paid and recorded. See you at the {SITE.venue},{" "}
            {SITE.raceDay}.
          </p>
          <dl className="receipt mono">
            <div>
              <dt>REFERENCE</dt>
              <dd>{registration.reference}</dd>
            </div>
            <div>
              <dt>RACE</dt>
              <dd>
                {race.label} · gun time {race.start}
              </dd>
            </div>
            <div>
              <dt>PAID (TEST)</dt>
              <dd>
                {formatPeso(registration.amountCentavos)}
                {method && ` · ${method}`}
              </dd>
            </div>
          </dl>
          <div className="row">
            <ButtonLink href="/" variant="ghost" size="md">
              Back to the start
            </ButtonLink>
          </div>
        </div>
        <div className="bib" aria-hidden="true">
          <div className="mono flex justify-between text-[11px]">
            <span>
              {SITE.name.toUpperCase()} {SITE.edition}
            </span>
            <span className="tag">{race.distanceShort}</span>
          </div>
          <div className="disp num">{race.distanceMark}</div>
          <div className="mono flex justify-between text-[11px]">
            <span>{registration.reference}</span>
            <span>GUN {race.start}</span>
          </div>
        </div>
      </div>
    </main>
  );
}
