import { Badge } from "@rr/ui";
import { RegistrationForm } from "@/components/registration-form";
import type { RaceView } from "@/content/site";
import { SEXES, SHIRT_SIZES } from "@/lib/registration/schema";

/**
 * The `#register` anchor every call to action points at: the registration form, which hands over
 * to PayMongo's test checkout.
 */
export function Register({ races }: { races: RaceView[] }) {
  return (
    <section id="register" className="wrap sec sec-lg" aria-labelledby="register-title">
      <div className="sechead" data-reveal>
        <h2 id="register-title" className="disp h2">
          REGISTER
        </h2>
        <Badge variant="accent">TEST TRANSACTIONS ONLY</Badge>
      </div>

      {/* The reveal sits on a static wrapper: the form re-renders, which would drop `.in`. */}
      <div data-reveal>
        <RegistrationForm races={races} shirtSizes={SHIRT_SIZES} sexes={SEXES} initialRace="21k" />
      </div>
    </section>
  );
}
