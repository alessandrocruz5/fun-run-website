import type { CSSProperties } from "react";
import { getRaceView, type RaceView, SITE } from "@/content/site";

const TEE =
  "M95 20 L120 10 C130 32 170 32 180 10 L205 20 L282 62 L256 122 L225 106 L225 300 L75 300 L75 106 L44 122 L18 62 Z";
const DISPLAY: CSSProperties = { fontFamily: "var(--font-display)", fontStretch: "125%" };
const MONO: CSSProperties = { fontFamily: "var(--font-mono)" };
const YEAR_SHORT = `’${SITE.edition.slice(2)}`;

export function Kit({ races }: { races: RaceView[] }) {
  const half = getRaceView("21k");
  const full = getRaceView("42k");

  return (
    <section id="kit" className="wrap sec sec-lg kit-sec gap-14" aria-labelledby="kit-title">
      <div className="sechead" data-reveal>
        <h2 id="kit-title" className="disp h2">
          WEAR IT.
          <br />
          EARN IT.
        </h2>
        <p className="m-0 max-w-[26em] text-[17px] leading-normal">
          Every runner gets the race jersey in their packet. Finisher shirts are handed out only
          past the line — {half.shortName} and {full.shortName} only.
        </p>
      </div>

      <div className="kit" data-reveal data-stagger>
        <article className="shirt bg-sand">
          <div className="top mono">
            <span>RACE JERSEY</span>
            <span>ALL DISTANCES</span>
          </div>
          <svg viewBox="0 0 300 310" aria-hidden="true">
            <defs>
              <clipPath id="tee-jersey">
                <path d={TEE} />
              </clipPath>
            </defs>
            <g clipPath="url(#tee-jersey)">
              <rect width="300" height="310" fill="var(--color-ink)" />
              <path
                d="M-10 200 C60 170 120 240 190 205 S280 170 320 190 L320 230 C260 210 230 260 170 245 S60 215 -10 240 Z"
                fill="var(--color-accent)"
              />
              <path
                d="M-10 250 C60 225 120 285 190 255 S280 225 320 245"
                fill="none"
                stroke="var(--color-river)"
                strokeWidth="5"
              />
              <path
                d="M-10 266 C60 241 120 301 190 271 S280 241 320 261"
                fill="none"
                stroke="var(--color-river)"
                strokeWidth="2"
              />
              <rect x="18" y="62" width="60" height="60" fill="var(--color-river-dark)" />
              <rect x="222" y="62" width="60" height="60" fill="var(--color-river-dark)" />
              <text
                x="150"
                y="110"
                textAnchor="middle"
                style={DISPLAY}
                fontWeight="900"
                fontSize="26"
                fill="var(--color-paper)"
              >
                RIVERLINE
              </text>
              <text
                x="150"
                y="134"
                textAnchor="middle"
                style={MONO}
                fontWeight="600"
                fontSize="11"
                fill="var(--color-accent)"
              >
                RUN · {SITE.edition}
              </text>
            </g>
            <path
              d="M120 10 C130 32 170 32 180 10"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="4"
            />
          </svg>
          <div>
            <h3>River Navy Tech Tee</h3>
            <p className="opacity-75">Recycled poly, mesh side panels, reflective wave print.</p>
          </div>
        </article>

        <article className="shirt bg-accent">
          <div className="top mono">
            <span>FINISHER SHIRT</span>
            <span>
              {half.shortName.toUpperCase()} · {half.distanceShort}
            </span>
          </div>
          <svg viewBox="0 0 300 310" aria-hidden="true">
            <defs>
              <clipPath id="tee-half">
                <path d={TEE} />
              </clipPath>
            </defs>
            <g clipPath="url(#tee-half)">
              <rect width="300" height="310" fill="var(--color-paper)" />
              <text
                x="150"
                y="160"
                textAnchor="middle"
                style={DISPLAY}
                fontWeight="900"
                fontSize="66"
                fill="var(--color-accent)"
              >
                {half.km}
              </text>
              <text
                x="150"
                y="186"
                textAnchor="middle"
                style={MONO}
                fontWeight="600"
                fontSize="12"
                fill="var(--color-ink)"
              >
                {half.shortName.toUpperCase()} · FINISHER
              </text>
              <path
                d="M90 220 C120 205 150 235 180 220 S210 205 225 212"
                fill="none"
                stroke="var(--color-ink)"
                strokeWidth="3"
              />
              <text
                x="150"
                y="252"
                textAnchor="middle"
                style={MONO}
                fontSize="9"
                fill="var(--color-ink)"
                opacity=".7"
              >
                RIVERLINE RUN {SITE.edition}
              </text>
            </g>
            <path
              d="M120 10 C130 32 170 32 180 10"
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth="4"
            />
          </svg>
          <div>
            <h3>Bone White Finisher</h3>
            <p>Heavyweight cotton, puff-print {half.km} on the chest.</p>
          </div>
        </article>

        <article className="shirt dark">
          <div className="top mono">
            <span>FINISHER SHIRT</span>
            <span className="text-accent">
              {full.shortName.toUpperCase()} · {full.distanceShort}
            </span>
          </div>
          <svg viewBox="0 0 300 310" aria-hidden="true">
            <defs>
              <clipPath id="tee-full">
                <path d={TEE} />
              </clipPath>
            </defs>
            <g clipPath="url(#tee-full)">
              <rect width="300" height="310" fill="var(--color-jet)" />
              <path
                d="M150 70 C120 72 96 92 100 112 C104 130 132 128 150 138 C168 148 196 150 200 170 C204 192 180 206 150 208 C124 210 104 196 110 180"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="4"
              />
              <circle cx="150" cy="70" r="6" fill="var(--color-paper)" />
              <text
                x="150"
                y="246"
                textAnchor="middle"
                style={DISPLAY}
                fontWeight="900"
                fontSize="30"
                fill="var(--color-paper)"
              >
                {full.kmExact}
              </text>
              <text
                x="150"
                y="266"
                textAnchor="middle"
                style={MONO}
                fontWeight="600"
                fontSize="10"
                fill="var(--color-accent)"
              >
                I RAN THE WHOLE RIVER
              </text>
            </g>
            <path
              d="M120 10 C130 32 170 32 180 10"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="4"
            />
          </svg>
          <div>
            <h3>Blackwater Marathoner</h3>
            <p className="opacity-80">Course line printed full-size across the chest.</p>
          </div>
        </article>
      </div>

      <div className="stack gap-6">
        <h3 className="mono m-0 tracking-[.06em]" data-reveal>
          FINISHER MEDALS — ONE PER DISTANCE
        </h3>
        <ul className="medals m-0 list-none p-0" data-reveal data-stagger>
          {races.map((race) => (
            <li key={race.id} className="medal">
              <div
                className="ribbon"
                style={{ height: race.medal.ribbonHeight }}
                aria-hidden="true"
              >
                <i />
                <i />
              </div>
              <div
                className="disc"
                style={
                  { "--ms": `${race.medal.size}px`, background: race.medal.metal } as CSSProperties
                }
                aria-hidden="true"
              >
                <div
                  className="face"
                  style={{ background: race.medal.face, color: race.medal.faceInk }}
                >
                  <b>{race.distanceMark}</b>
                  <small>RIVERLINE {YEAR_SHORT}</small>
                </div>
              </div>
              <h4 className="medal-name">{race.label}</h4>
              <p>{race.medal.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
