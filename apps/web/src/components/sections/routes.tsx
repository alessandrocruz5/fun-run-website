"use client";

import type { RaceId } from "@rr/db/races";
import { type CSSProperties, type KeyboardEvent, useRef, useState } from "react";
import type { RaceView } from "@/content/site";

const MONO: CSSProperties = { fontFamily: "var(--font-mono)" };

export function Routes({ races, initial }: { races: RaceView[]; initial: RaceId }) {
  const [activeId, setActiveId] = useState<RaceId>(initial);
  const tabRefs = useRef<Partial<Record<RaceId, HTMLButtonElement | null>>>({});
  const race = races.find((r) => r.id === activeId) ?? races[0];
  if (!race) return null;

  // Arrow keys move between tabs (WAI-ARIA tabs pattern, automatic activation).
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    let next: number | undefined;
    if (step) next = (index + step + races.length) % races.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = races.length - 1;
    const target = next === undefined ? undefined : races[next];
    if (!target) return;
    e.preventDefault();
    setActiveId(target.id);
    tabRefs.current[target.id]?.focus();
  };

  return (
    <section id="routes" className="dark" aria-labelledby="routes-title">
      <div className="wrap sec">
        <div className="sechead" data-reveal>
          <h2 id="routes-title" className="disp h2">
            THE ROUTES
          </h2>
          <div className="tabs" role="tablist" aria-label="Distance">
            {races.map((r, i) => (
              <button
                key={r.id}
                ref={(el) => {
                  tabRefs.current[r.id] = el;
                }}
                id={`route-tab-${r.id}`}
                type="button"
                role="tab"
                aria-selected={r.id === race.id}
                aria-controls="route-panel"
                tabIndex={r.id === race.id ? 0 : -1}
                onClick={() => setActiveId(r.id)}
                onKeyDown={(e) => onKeyDown(e, i)}
              >
                {r.shortName}
              </button>
            ))}
          </div>
        </div>

        <div
          id="route-panel"
          role="tabpanel"
          aria-labelledby={`route-tab-${race.id}`}
          className="grid2"
        >
          <div className="map" data-reveal>
            <svg viewBox="0 0 600 440" aria-hidden="true">
              <defs>
                <pattern id="map-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                  <path d="M30 0H0V30" fill="none" stroke="var(--color-grid)" />
                </pattern>
              </defs>
              <rect width="600" height="440" fill="url(#map-grid)" />
              <path
                d="M-20 120 C120 90 200 200 320 210 S520 300 640 330"
                fill="none"
                stroke="var(--color-river)"
                strokeWidth="44"
                strokeLinecap="round"
              />
              <line
                x1="190"
                y1="100"
                x2="230"
                y2="210"
                stroke="var(--color-ink)"
                strokeWidth="7"
                opacity=".25"
              />
              <line
                x1="440"
                y1="225"
                x2="470"
                y2="320"
                stroke="var(--color-ink)"
                strokeWidth="7"
                opacity=".25"
              />
              {/* Keyed so the route redraws on every tab change. */}
              <g key={race.id}>
                <path
                  className="draw"
                  pathLength={1}
                  style={{ "--dur": "2.2s" } as CSSProperties}
                  d={race.path}
                  fill="none"
                  stroke="var(--color-ink)"
                  strokeWidth="10"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity=".12"
                />
                <path
                  id="route-main"
                  className="draw"
                  pathLength={1}
                  style={{ "--dur": "2.2s" } as CSSProperties}
                  d={race.path}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <path
                  className="dots"
                  d={race.path}
                  fill="none"
                  stroke="var(--color-paper)"
                  strokeWidth="1.5"
                  strokeDasharray="2 14"
                  strokeLinejoin="round"
                />
                <circle
                  className="runner"
                  r="7"
                  fill="var(--color-ink)"
                  stroke="var(--color-accent)"
                  strokeWidth="3"
                >
                  <animateMotion dur="9s" repeatCount="indefinite">
                    <mpath href="#route-main" />
                  </animateMotion>
                </circle>
              </g>
              <circle cx="300" cy="228" r="12" fill="var(--color-ink)" />
              <circle cx="300" cy="228" r="5" fill="var(--color-accent)" />
              <text
                x="318"
                y="252"
                style={MONO}
                fontSize="12"
                fontWeight="600"
                fill="var(--color-ink)"
              >
                START / FINISH · HARBOR PLAZA
              </text>
              <text x="40" y="200" style={MONO} fontSize="11" fill="var(--color-ink)" opacity=".7">
                MERIDIAN RIVER
              </text>
            </svg>
            <div className="lbl mono">{race.label.toUpperCase()} · COURSE MAP</div>
          </div>

          <div className="route-info" data-reveal data-stagger>
            <div className="row items-baseline gap-3.5">
              <div key={race.id} className="disp km swap">
                {race.km}
              </div>
              <div className="mono text-[13px] opacity-75">KILOMETERS</div>
            </div>
            <p key={`blurb-${race.id}`} className="blurb swap">
              {race.blurb}
            </p>
            <dl key={`stats-${race.id}`} className="stats swap">
              <div>
                <dt className="mono">START</dt>
                <dd>{race.start}</dd>
              </div>
              <div>
                <dt className="mono">GAIN</dt>
                <dd>{race.gain}</dd>
              </div>
              <div>
                <dt className="mono">AID STATIONS</dt>
                <dd>{race.aidStations}</dd>
              </div>
              <div>
                <dt className="mono">CUTOFF</dt>
                <dd>{race.cutoff}</dd>
              </div>
            </dl>
            <div className="flex flex-col gap-2">
              <span className="mono text-[11px] opacity-75">ELEVATION PROFILE</span>
              <svg
                key={`elev-${race.id}`}
                viewBox="0 0 600 120"
                preserveAspectRatio="none"
                className="block h-24 w-full"
                aria-hidden="true"
              >
                <polygon
                  className="area"
                  points={`0,120 ${race.elevationLine} 600,120`}
                  fill="var(--color-accent)"
                />
                <polyline
                  className="draw"
                  pathLength={1}
                  style={{ "--dur": "1.6s", "--d": ".3s" } as CSSProperties}
                  points={race.elevationLine}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
            <ul key={`hl-${race.id}`} className="hl-list swap">
              {race.highlights.map(([at, text]) => (
                <li key={at} className="hl">
                  <span className="mono">{at}</span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
