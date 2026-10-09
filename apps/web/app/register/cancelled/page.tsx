import { ButtonLink } from "@rr/ui";
import type { Metadata } from "next";
import { SITE } from "@/content/site";

export const metadata: Metadata = {
  title: "Payment cancelled",
  robots: { index: false },
};

/**
 * Where PayMongo's "back" link goes. It changes nothing: an unpaid registration stays pending, and
 * a payment made later on the same checkout is still recorded.
 */
export default function RegisterCancelledPage() {
  return (
    <main className="wrap prose">
      <p className="mono">PAYMENT CANCELLED</p>
      <h1 className="disp">You haven&apos;t paid yet.</h1>
      <p>
        You left PayMongo&apos;s checkout before paying, so your registration isn&apos;t complete
        and nothing was charged. Unpaid registrations are deleted within {SITE.retentionDays} days,
        like every registration on this site.
      </p>
      <div className="row">
        <ButtonLink href="/#register" variant="accent">
          TRY AGAIN
        </ButtonLink>
      </div>
    </main>
  );
}
