import { Badge } from "@rr/ui";
import type { RaceView } from "@/content/site";

/**
 * The `#register` anchor every call to action points at. FRW-5 replaces the note with the
 * registration form and PayMongo test checkout.
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

      <ul className="opts" data-reveal data-stagger>
        {races.map((race) => (
          <li key={race.id} className="opt">
            <h3>{race.shortName}</h3>
            <span className="label">{race.label}</span>
            <span className="mono text-[13px]">{race.price}</span>
            <small>
              {race.includes} · Gun time {race.start}
            </small>
          </li>
        ))}
      </ul>

      <div className="reg-note dark" data-reveal>
        <div className="mono text-accent">REGISTRATION OPENS SOON</div>
        <p>
          Sign-up and payment arrive in the next release. Payments will run through PayMongo in test
          mode: no card is ever charged, and the event itself is fictional.
        </p>
      </div>
    </section>
  );
}
