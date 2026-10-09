"use client";

import { unstable_isUnrecognizedActionError, unstable_rethrow } from "next/navigation";
import Script from "next/script";
import { type InputHTMLAttributes, useActionState, useEffect, useRef, useState } from "react";
import type { RaceView } from "@/content/site";
import { register } from "@/lib/registration/actions";
import type { RegisterField, RegisterState } from "@/lib/registration/schema";

// Types only from the schema module: the server validates, so zod stays out of the browser. The
// honeypot's name is a literal for the same reason: turnstile.ts is server only.
const HONEYPOT_FIELD = "fax_number";

type TurnstileApi = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: "dark";
      size: "flexible" | "compact";
      callback(): void;
      "error-callback"(): void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const INITIAL_STATE: RegisterState = { status: "idle" };

/** Page order: after a rejected submit, focus goes to the first field that needs fixing. */
const FIELD_ORDER: RegisterField[] = [
  "race",
  "shirtSize",
  "firstName",
  "lastName",
  "email",
  "mobile",
  "birthdate",
  "sex",
  "emergencyContactName",
  "emergencyContactMobile",
  "consent",
];

const SEX_LABELS: Record<string, string> = { female: "Female", male: "Male" };

const UNREACHABLE =
  "We couldn't reach the server. Nothing was charged and your details are still here: check your connection and try again.";
const SITE_UPDATED =
  "The site was updated while you were filling this in. Nothing was charged: reload the page and register again.";

/**
 * `register`, but a round trip that fails (connection lost, a deploy in between, a gateway error)
 * comes back as a retry message instead of crashing the page and losing what was typed.
 */
async function registerOrRetry(
  previous: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  try {
    return await register(previous, formData);
  } catch (error) {
    // The redirect to PayMongo arrives as a rejection: let Next handle it.
    unstable_rethrow(error);
    const values: RegisterState["values"] = {};
    for (const field of FIELD_ORDER) {
      const value = formData.get(field);
      if (typeof value === "string") values[field] = value;
    }
    const message = unstable_isUnrecognizedActionError(error) ? SITE_UPDATED : UNREACHABLE;
    return { status: "error", message, values };
  }
}

const fieldId = (field: RegisterField) => `reg-${field}`;
const errorId = (field: RegisterField) => `reg-${field}-error`;

function FieldError({ field, message }: { field: RegisterField; message?: string }) {
  return message ? (
    <p id={errorId(field)} className="err">
      {message}
    </p>
  ) : null;
}

function TextField({
  field,
  label,
  state,
  ...input
}: { field: RegisterField; label: string; state: RegisterState } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "name" | "id" | "defaultValue"
>) {
  const error = state.errors?.[field];
  return (
    <div className="input">
      <label htmlFor={fieldId(field)}>{label}</label>
      <input
        id={fieldId(field)}
        name={field}
        defaultValue={state.values?.[field] ?? ""}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId(field) : undefined}
        {...input}
      />
      <FieldError field={field} message={error} />
    </div>
  );
}

/** Narrower than the widget's 300px minimum, it switches to the compact size (150px). */
const FLEXIBLE_MIN_WIDTH = 300;

/**
 * Cloudflare Turnstile, rendered explicitly so React owns the lifecycle. The widget adds a hidden
 * `cf-turnstile-response` input inside the form. Tokens are single use, so the widget resets after
 * every response from the server. The widget is Cloudflare's own accessible iframe; this adds the
 * group label and a message when the check can't load.
 */
function TurnstileWidget({ siteKey, state }: { siteKey: string; state: RegisterState }) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  const mount = () => {
    const node = container.current;
    if (!window.turnstile || !node || widgetId.current) return;
    widgetId.current = window.turnstile.render(node, {
      sitekey: siteKey,
      theme: "dark",
      size: node.clientWidth < FLEXIBLE_MIN_WIDTH ? "compact" : "flexible",
      callback: () => setFailed(false),
      "error-callback": () => setFailed(true),
    });
  };

  // A script that is already loaded (client-side navigation, strict-mode remount) needs no onReady.
  useEffect(() => {
    mount();
    return () => {
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (state.status !== "idle" && widgetId.current) window.turnstile?.reset(widgetId.current);
  }, [state]);

  return (
    <div role="group" aria-label="Check that you are a person">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={mount}
        onError={() => setFailed(true)}
      />
      <div ref={container} />
      {failed && (
        <p className="errbox" role="alert">
          The check that you&apos;re a person couldn&apos;t load. Check your connection and reload
          the page.
        </p>
      )}
    </div>
  );
}

type Props = {
  races: RaceView[];
  shirtSizes: readonly string[];
  sexes: readonly string[];
  initialRace: RaceView["id"];
  /** `null` when `TURNSTILE_SITE_KEY` isn't set: registration is paused rather than unprotected. */
  turnstileSiteKey: string | null;
};

/**
 * The registration form. It posts to the `register` server action, which validates on the server
 * and redirects to PayMongo's hosted checkout. Prices shown here are display only. Submitting needs
 * JavaScript, as PayMongo's checkout does.
 */
export function RegistrationForm({
  races,
  shirtSizes,
  sexes,
  initialRace,
  turnstileSiteKey,
}: Props) {
  const [state, formAction, pending] = useActionState(registerOrRetry, INITIAL_STATE);
  const form = useRef<HTMLFormElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  // Mirrors the checked radios for the summary. React's reset after a submit restores the
  // posted choices, which are these.
  const [raceId, setRaceId] = useState<string>(state.values?.race ?? initialRace);
  const [shirtSize, setShirtSize] = useState<string>(state.values?.shirtSize ?? "M");

  const race = races.find((r) => r.id === raceId) ?? races[0];
  const values = state.values ?? {};
  const errors = state.errors ?? {};

  useEffect(() => {
    if (state.status === "error") {
      submit.current?.focus();
      return;
    }
    if (state.status !== "invalid") return;
    const first = FIELD_ORDER.find((field) => state.errors?.[field]);
    const target = first ? form.current?.elements.namedItem(first) : null;
    if (target instanceof RadioNodeList) {
      const radios = Array.from(target) as HTMLInputElement[];
      (radios.find((r) => r.checked) ?? radios[0])?.focus();
    } else if (target instanceof HTMLElement) {
      target.focus();
    }
  }, [state]);

  return (
    <form
      ref={form}
      action={formAction}
      noValidate
      className="reg"
      onChange={(e) => {
        const input = e.target;
        if (!(input instanceof HTMLInputElement)) return;
        if (input.name === "race") setRaceId(input.value);
        if (input.name === "shirtSize") setShirtSize(input.value);
      }}
    >
      <div className="stack reg-fields">
        <fieldset className="field">
          <legend className="mono">01 · RACE</legend>
          <div className="opts">
            {races.map((r) => (
              <label key={r.id} className="opt">
                <input
                  type="radio"
                  name="race"
                  value={r.id}
                  defaultChecked={(values.race ?? initialRace) === r.id}
                  aria-describedby={errors.race ? errorId("race") : undefined}
                  className="sr-only"
                />
                <b>{r.shortName}</b>
                <span className="label">{r.label}</span>
                <span className="mono text-[13px]">{r.price}</span>
                <small>
                  {r.includes} · Gun time {r.start}
                </small>
              </label>
            ))}
          </div>
          <FieldError field="race" message={errors.race} />
        </fieldset>

        <fieldset className="field">
          <legend className="mono">02 · SHIRT SIZE</legend>
          <div className="choices">
            {shirtSizes.map((size) => (
              <label key={size} className="sz">
                <input
                  type="radio"
                  name="shirtSize"
                  value={size}
                  defaultChecked={(values.shirtSize ?? "M") === size}
                  aria-describedby={errors.shirtSize ? errorId("shirtSize") : undefined}
                  className="sr-only"
                />
                {size}
              </label>
            ))}
          </div>
          <FieldError field="shirtSize" message={errors.shirtSize} />
        </fieldset>

        <fieldset className="field">
          <legend className="mono">03 · RUNNER</legend>
          <div className="inputs">
            <TextField
              field="firstName"
              label="First name"
              autoComplete="given-name"
              state={state}
            />
            <TextField
              field="lastName"
              label="Last name"
              autoComplete="family-name"
              state={state}
            />
            <TextField
              field="email"
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              spellCheck={false}
              state={state}
            />
            <TextField
              field="mobile"
              label="Mobile number"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0917 123 4567"
              state={state}
            />
            <TextField
              field="birthdate"
              label="Birthdate"
              type="date"
              autoComplete="bday"
              state={state}
            />
            <fieldset className="input">
              <legend>Sex</legend>
              <div className="choices">
                {sexes.map((sex) => (
                  <label key={sex} className="sz">
                    <input
                      type="radio"
                      name="sex"
                      value={sex}
                      defaultChecked={values.sex === sex}
                      aria-describedby={errors.sex ? errorId("sex") : undefined}
                      className="sr-only"
                    />
                    {SEX_LABELS[sex] ?? sex}
                  </label>
                ))}
              </div>
              <FieldError field="sex" message={errors.sex} />
            </fieldset>
          </div>
        </fieldset>

        <fieldset className="field">
          <legend className="mono">04 · EMERGENCY CONTACT</legend>
          <div className="inputs">
            <TextField
              field="emergencyContactName"
              label="Contact name"
              autoComplete="off"
              state={state}
            />
            <TextField
              field="emergencyContactMobile"
              label="Contact mobile number"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="0917 123 4567"
              state={state}
            />
          </div>
        </fieldset>

        <div className="field">
          <div className="consent">
            <input
              id={fieldId("consent")}
              type="checkbox"
              name="consent"
              value="yes"
              defaultChecked={values.consent === "yes"}
              required
              aria-invalid={errors.consent ? true : undefined}
              aria-describedby={errors.consent ? errorId("consent") : undefined}
            />
            <label htmlFor={fieldId("consent")}>
              I&apos;ve read the{" "}
              <a href="/privacy" target="_blank" rel="noopener">
                privacy notice<span className="sr-only"> (opens in a new tab)</span>
              </a>{" "}
              and agree to Riverline Run using my details as it describes.
            </label>
          </div>
          <FieldError field="consent" message={errors.consent} />
        </div>

        {/* The honeypot: off-screen and out of the tab order, so only a bot fills it in. */}
        <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
          <label>
            Leave this field empty
            <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
          </label>
        </div>
      </div>

      <div className="summary dark">
        <div className="flex items-center justify-between">
          <span className="mono">ORDER SUMMARY</span>
          <span className="tag mono">TEST</span>
        </div>
        <div className="disp text-[44px] leading-[0.9]">{race?.label}</div>
        <div className="lines">
          <div>
            <span>Entry · {race?.shortName}</span>
            <span>{race?.price}</span>
          </div>
          <div className="dim">
            <span>Race shirt · {shirtSize}</span>
            <span>Included</span>
          </div>
          <div className="dim">
            <span>{race?.includes}</span>
            <span>Included</span>
          </div>
        </div>
        <div className="total">
          <span className="mono">TOTAL</span>
          <b>{race?.price}</b>
        </div>
        {turnstileSiteKey ? (
          <TurnstileWidget siteKey={turnstileSiteKey} state={state} />
        ) : (
          <p className="errbox" role="alert">
            Registration is paused while the check that you&apos;re a person is unavailable. Please
            try again later.
          </p>
        )}
        {state.status === "error" && (
          <p className="errbox" role="alert">
            {state.message}
          </p>
        )}
        {state.status === "invalid" && (
          <p className="errbox">Some details need fixing: see the highlighted fields.</p>
        )}
        <button ref={submit} type="submit" className="pay" disabled={pending || !turnstileSiteKey}>
          {pending ? "OPENING PAYMONGO…" : `PAY ${race?.price ?? ""} (TEST)`}
        </button>
        <p className="m-0 text-xs leading-[1.45] opacity-75">
          You&apos;ll pay on PayMongo&apos;s test checkout. Use test card 4343 4343 4343 4345, any
          future expiry and any CVC. No card is ever charged.
        </p>
      </div>
    </form>
  );
}
