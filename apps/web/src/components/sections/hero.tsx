import { Badge, ButtonLink } from "@rr/ui";
import type { CSSProperties } from "react";
import { getRaceView, lowestPrice, type RaceView, SITE } from "@/content/site";

const delay = (d: string) => ({ "--d": d }) as CSSProperties;

export function Hero({ races }: { races: RaceView[] }) {
  const shortest = races[0];
  const full = getRaceView("42k");

  return (
    <section className="wrap hero" aria-labelledby="hero-title">
      <div className="stack">
        <div className="row rise" style={delay("0s")}>
          <Badge>{SITE.raceDay.toUpperCase()}</Badge>
          <Badge>{SITE.venue.toUpperCase()}</Badge>
        </div>
        <h1 id="hero-title" className="disp">
          <span className="line">
            <span style={delay(".1s")}>Run the</span>
          </span>
          <span className="line">
            <span style={delay(".22s")}>
              <em>river</em>line.
            </span>
          </span>
        </h1>
        <p className="rise" style={delay(".4s")}>
          Four distances along the Meridian River — from a {shortest?.distanceShort} stroll to the
          full {full.distanceShort}. Every entry funds river restoration and clean water work by the{" "}
          {SITE.organizer}.
        </p>
        <div className="row ctas rise" style={delay(".52s")}>
          <ButtonLink href="#register" variant="accent">
            REGISTER — FROM {lowestPrice()}
          </ButtonLink>
          <ButtonLink href="#routes">SEE THE ROUTES</ButtonLink>
        </div>
      </div>

      <div className="hero-map rise" style={delay(".3s")}>
        <svg viewBox="0 0 600 460" aria-hidden="true">
          <path
            d="M-20 130 C120 100 200 210 320 220 S520 310 640 340"
            fill="none"
            stroke="var(--color-river-dark)"
            strokeWidth="56"
            strokeLinecap="round"
          />
          <path
            d="M-20 130 C120 100 200 210 320 220 S520 310 640 340"
            fill="none"
            stroke="var(--color-river)"
            strokeWidth="2"
            strokeDasharray="4 10"
            opacity=".6"
          />
          <path
            id="hero-path"
            className="draw"
            pathLength={1}
            style={{ "--dur": "3.2s", "--d": ".6s" } as CSSProperties}
            transform="translate(0 10)"
            d={full.path}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx="300" cy="238" r="13" fill="var(--color-paper)" />
          <circle cx="300" cy="238" r="6" fill="var(--color-ink)" />
          <circle
            className="runner"
            r="7"
            fill="var(--color-paper)"
            stroke="var(--color-accent)"
            strokeWidth="3"
          >
            <animateMotion dur="14s" begin="3.8s" repeatCount="indefinite">
              <mpath href="#hero-path" />
            </animateMotion>
          </circle>
        </svg>
        <div className="cap mono">
          {full.label.toUpperCase()} COURSE
          <br />
          <span className="text-accent">{full.kmExact} KM · 2 BRIDGES · 1 RIVER</span>
        </div>
        <div className="tags" aria-hidden="true">
          {races.map((race) => (
            <Badge key={race.id} variant="paper">
              {race.shortName}
            </Badge>
          ))}
        </div>
      </div>
    </section>
  );
}
