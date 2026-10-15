import { getDb } from "@rr/db";
import { getRegistration, TIME_ZONE } from "@rr/db/admin";
import { RACES } from "@rr/db/races";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { formatPeso } from "@/components/stat-card";
import { canSeePersonalData } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { listHref, parseListParams, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Registration" };

const dateTime = new Intl.DateTimeFormat("en-PH", {
  timeZone: TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
});

const METHOD_LABELS: Record<string, string> = {
  card: "Card",
  gcash: "GCash",
  paymaya: "Maya",
  grab_pay: "GrabPay",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-option border-2 border-ink bg-field p-5">
      <h2 className="m-0 text-lg font-semibold">{title}</h2>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
        {children}
      </dl>
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-line">{label}</dt>
      <dd className="m-0 break-words">{value}</dd>
    </>
  );
}

const NOT_YET = <span className="text-line">Not yet</span>;

/**
 * One registration in full. The query masks a viewer's email and mobile and returns null for
 * their birthdate and emergency contact; this page shows what it returned and says when a field
 * is hidden for the viewer.
 */
export default async function RegistrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireSession();
  const { reference } = await params;
  const list = parseListParams(await searchParams);
  const registration = await getRegistration(getDb(), session.role, reference);
  if (!registration) notFound();
  const unmasked = canSeePersonalData(session.role);
  const hidden = <span className="text-line">Hidden in the demo view</span>;
  const paid = registration.status === "paid";

  return (
    <main className="mx-auto flex max-w-[860px] flex-col gap-6 px-4 py-8 sm:px-7 sm:py-10">
      <div className="flex flex-col gap-3">
        <Link href={listHref(list)} className="text-sm font-semibold underline underline-offset-4">
          ← Registrations
        </Link>
        <h1 className="disp text-4xl">
          {registration.firstName} {registration.lastName}
        </h1>
        <p className="mono m-0 uppercase">
          {registration.reference} · {registration.status}
        </p>
        {!unmasked && (
          <p className="m-0 max-w-[60ch] text-sm">
            Demo view: email and mobile are masked, and birthdate and emergency contact are hidden.
          </p>
        )}
      </div>

      <Section title="Runner">
        <Field label="Race" value={RACES[registration.race].label} />
        <Field label="Shirt size" value={registration.shirtSize} />
        <Field label="Birthdate" value={registration.birthdate ?? hidden} />
        <Field label="Email" value={<span className="break-all">{registration.email}</span>} />
        <Field label="Mobile" value={registration.mobile} />
        <Field label="Registered" value={dateTime.format(registration.createdAt)} />
      </Section>

      <Section title="Emergency contact">
        <Field label="Name" value={registration.emergencyContactName ?? hidden} />
        <Field label="Mobile" value={registration.emergencyContactMobile ?? hidden} />
      </Section>

      <Section title="Consent">
        <Field
          label="Agreed to the privacy notice"
          value={dateTime.format(registration.consentAt)}
        />
      </Section>

      <Section title="Payment (test mode)">
        <Field label="Status" value={registration.status} />
        <Field
          label="Method"
          value={
            registration.paymentMethod
              ? (METHOD_LABELS[registration.paymentMethod] ?? registration.paymentMethod)
              : NOT_YET
          }
        />
        <Field label="Amount" value={formatPeso(registration.amountCentavos)} />
        <Field
          label="Fee"
          value={registration.feeCentavos === null ? NOT_YET : formatPeso(registration.feeCentavos)}
        />
        <Field
          label="Net"
          value={registration.netCentavos === null ? NOT_YET : formatPeso(registration.netCentavos)}
        />
        <Field
          label="PayMongo ID"
          value={
            registration.paymentId ? (
              <span className="mono break-all">{registration.paymentId}</span>
            ) : (
              NOT_YET
            )
          }
        />
        <Field
          label="Paid"
          value={registration.paidAt ? dateTime.format(registration.paidAt) : NOT_YET}
        />
      </Section>

      <Section title="Confirmation email">
        <Field
          label="Status"
          value={
            registration.confirmationSentAt
              ? `Sent ${dateTime.format(registration.confirmationSentAt)}`
              : paid
                ? "Not sent"
                : "Not sent: it goes out only after payment"
          }
        />
      </Section>
    </main>
  );
}
