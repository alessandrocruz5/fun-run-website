import type { Metadata } from "next";
import { SITE } from "@/content/site";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: `How ${SITE.name} handles the personal data in a test registration, and when it is deleted.`,
  alternates: { canonical: "/privacy" },
};

// Keep in step with packages/db/src/schema/registrations.ts: this notice must list what is stored.
export default function PrivacyPage() {
  const contact = SITE.privacyContact;

  return (
    <main className="wrap prose">
      <p className="mono">LAST UPDATED · 9 OCTOBER 2026</p>
      <h1 className="disp">Privacy notice</h1>
      <p>
        {SITE.name} is a <strong>fictional</strong> fun run by the fictional {SITE.organizer}. This
        site is a portfolio project. Payments run in PayMongo test mode, so no card is ever charged
        and no real event takes place. This notice explains, as the Data Privacy Act of 2012 (RA
        10173) requires, what happens to the details you enter when you register.
      </p>
      <p>
        <strong>Please use test details.</strong> You don&apos;t need to give real personal data to
        try the site. Use an email address you can read if you want to see the confirmation email.
      </p>

      <h2>Who is responsible</h2>
      <p>
        The site owner is the personal information controller. Contact:{" "}
        <a href={`mailto:${contact}`}>{contact}</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>The race you choose and your shirt size.</li>
        <li>Your first and last name, email address, mobile number, birthdate and sex.</li>
        <li>An emergency contact&apos;s name and mobile number.</li>
        <li>The date and time you gave consent to this notice.</li>
        <li>
          Payment records: your booking reference, the amount, the PayMongo checkout and payment
          IDs, the payment method type, PayMongo&apos;s fee, the net amount and when you paid.
        </li>
        <li>When your confirmation email was sent.</li>
      </ul>
      <p>
        We never see or store card numbers. You enter payment details on PayMongo&apos;s own
        checkout page.
      </p>
      <p>
        When you go to checkout, we put one cookie in your browser. It holds your PayMongo checkout
        ID so our confirmation page can check your payment. It is sent only to our registration
        pages, can&apos;t be read by scripts and expires after 24 hours.
      </p>

      <h2>Why we use it</h2>
      <ul>
        <li>To record your registration and confirm your test payment.</li>
        <li>To send you one confirmation email, and only after payment.</li>
        <li>
          To demonstrate race-day logistics such as shirt sizes and emergency contacts in this
          portfolio project.
        </li>
      </ul>
      <p>
        We process it on the basis of your consent. Registration needs you to tick the consent box,
        and we save the time you did so.
      </p>

      <h2>Who else handles it</h2>
      <ul>
        <li>Vercel hosts the site.</li>
        <li>Neon stores the database in Singapore.</li>
        <li>PayMongo processes the test payment.</li>
        <li>Resend delivers the confirmation email.</li>
        <li>Cloudflare Turnstile checks that the form is filled in by a person.</li>
      </ul>
      <p>
        Some of these providers process data outside the Philippines. We don&apos;t put your
        personal data in application logs, error messages or PayMongo metadata. What you type on
        PayMongo&apos;s checkout page goes to PayMongo directly.
      </p>

      <h2>How long we keep it</h2>
      <p>
        <strong>Your data is deleted within {SITE.retentionDays} days.</strong> The registrations
        table is wiped and refilled with sample data every week. The database provider&apos;s
        restore history is kept for {SITE.retentionDays} days or less, so backups expire within the
        same window. PayMongo and Resend keep their own test-mode records under their privacy
        policies.
      </p>

      <h2>Your rights</h2>
      <p>
        Under RA 10173 you have the right to be informed, to access your data, to object, to have it
        corrected, erased or blocked, to data portability and to damages. You may also file a
        complaint with the National Privacy Commission. To use any of these rights, or to withdraw
        your consent and have your registration deleted early, email{" "}
        <a href={`mailto:${contact}`}>{contact}</a>.
      </p>
    </main>
  );
}
