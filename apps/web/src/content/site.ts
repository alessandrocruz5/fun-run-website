import { RACE_IDS, RACES, type Race, type RaceId } from "@rr/db/races";
import { baseEnvSchema, createEnv } from "@rr/env";
import { z } from "zod";

/**
 * Copy and course details for the one-page site (docs/design/). Prices, distances, race names and
 * gun times are not here: they come from `RACES`, so the page can't drift from what is charged.
 */

export const SITE = {
  name: "Riverline Run",
  edition: "2027",
  organizer: "Clearwater Collective",
  city: "Port Meridian",
  venue: "Port Meridian Waterfront",
  raceDay: "Sun · Apr 18, 2027",
  raceDayShort: "Apr 18, 2027",
  description:
    "Riverline Run, a fictional fun run by the fictional Clearwater Collective. A portfolio project in test mode: no real event and no real payments.",
  testModeNotice: "Fictional event · Test mode, no real payments",
  privacyContact: "alessandrorafaelcruz@gmail.com",
  /** Registrations are deleted by the weekly reseed; /privacy states this. */
  retentionDays: 7,
} as const;

export const NAV_LINKS = [
  { href: "/#routes", label: "Routes" },
  { href: "/#kit", label: "Shirts & Medals" },
  { href: "/#cause", label: "The Cause" },
] as const;

const siteEnvSchema = baseEnvSchema.extend({
  /** Public origin, e.g. `https://riverline-run.vercel.app`. Used for absolute SEO URLs. */
  SITE_URL: z.url(),
});

/**
 * The site's origin without a trailing slash. Read per request, never at module top level:
 * `next build` runs with no environment variables.
 */
export function getSiteUrl(source?: Record<string, string | undefined>): string {
  return createEnv(siteEnvSchema, source).SITE_URL.replace(/\/+$/, "");
}

type CourseContent = {
  /** Tab name when it isn't the distance, e.g. "Half". */
  nickname?: string;
  includes: string;
  blurb: string;
  gain: string;
  aidStations: number;
  cutoff: string;
  /** SVG path in the 600×440 course map. */
  path: string;
  /** Elevation samples in metres, evenly spaced along the course. */
  elevation: number[];
  highlights: Array<[at: string, text: string]>;
  medal: {
    description: string;
    ribbonHeight: number;
    size: number;
    metal: string;
    face: string;
    faceInk: string;
  };
};

const COURSES: Record<RaceId, CourseContent> = {
  "5k": {
    includes: "Medal",
    blurb:
      "A flat loop around Harbor Plaza and the old ferry docks. Strollers, walkers and dogs on leashes welcome.",
    gain: "8 m",
    aidStations: 1,
    cutoff: "1h 15m",
    path: "M300 228 L360 250 C400 262 420 300 400 330 L330 340 C290 344 270 300 300 228 Z",
    elevation: [4, 4, 5, 6, 6, 7, 8, 8, 7, 6, 6, 5, 5, 4, 4],
    highlights: [
      ["KM 1", "Ferry Docks boardwalk"],
      ["KM 3", "Water station + DJ booth"],
      ["KM 5", "Finish chute at Harbor Plaza"],
    ],
    medal: {
      description: "Bronze river medal",
      ribbonHeight: 48,
      size: 120,
      metal: "linear-gradient(135deg,#E3A774,#9C5B2E)",
      face: "#C9844E",
      faceInk: "#3A1E0A",
    },
  },
  "10k": {
    includes: "Medal",
    blurb:
      "Crosses the river once at Salt Street Bridge and loops back through Dockside Park on shaded paths.",
    gain: "22 m",
    aidStations: 2,
    cutoff: "1h 45m",
    path: "M300 228 C360 250 440 250 480 290 C510 320 480 370 420 370 L300 360 C240 354 220 300 240 260 C252 236 280 226 300 228 Z",
    elevation: [4, 5, 8, 12, 18, 22, 18, 12, 9, 8, 10, 12, 9, 6, 4],
    highlights: [
      ["KM 2", "Salt Street Bridge crossing"],
      ["KM 6", "Dockside Park shade trail"],
      ["KM 9", "Cheer zone by Clearwater volunteers"],
    ],
    medal: {
      description: "Silver river medal",
      ribbonHeight: 56,
      size: 134,
      metal: "linear-gradient(135deg,#F1F3F5,#9AA4AE)",
      face: "#C7CED5",
      faceInk: "#10233A",
    },
  },
  "21k": {
    nickname: "Half",
    includes: "Medal + finisher shirt",
    blurb:
      "Both banks of the Meridian: out along the north shore to Heron Point, back across Salt Street Bridge to the plaza.",
    gain: "64 m",
    aidStations: 5,
    cutoff: "3h 30m",
    path: "M300 228 C220 214 160 160 100 130 C60 110 40 70 80 50 C130 30 200 60 240 100 C280 140 340 150 400 170 C470 196 540 230 560 290 C575 340 520 380 460 370 C400 360 360 300 300 228 Z",
    elevation: [4, 8, 14, 22, 30, 38, 34, 26, 18, 22, 30, 40, 32, 20, 12, 8, 6, 4],
    highlights: [
      ["KM 4", "Heron Point overlook"],
      ["KM 11", "Restored wetlands — Clearwater project site"],
      ["KM 17", "Salt Street Bridge"],
    ],
    medal: {
      description: "Gold medal + finisher shirt",
      ribbonHeight: 64,
      size: 150,
      metal: "linear-gradient(135deg,#FFE08A,#C08A1E)",
      face: "#E5B341",
      faceInk: "#3A2800",
    },
  },
  "42k": {
    nickname: "Full",
    includes: "Medal + finisher shirt",
    blurb:
      "The whole river. Two bridges, Heron Point, the reservoir climb and a long riverside run home to Harbor Plaza.",
    gain: "148 m",
    aidStations: 10,
    cutoff: "6h 30m",
    path: "M300 228 C220 214 160 170 90 140 C40 118 20 60 70 36 C140 10 230 40 280 80 C330 120 420 110 480 120 C550 132 590 190 580 250 C572 310 590 360 540 395 C480 430 380 410 320 390 C250 368 160 380 110 340 C70 306 120 270 180 262 C230 256 270 246 300 228 Z",
    elevation: [
      4, 10, 18, 26, 34, 30, 24, 30, 44, 58, 72, 80, 66, 50, 38, 30, 26, 34, 40, 30, 20, 14, 10, 6,
      4,
    ],
    highlights: [
      ["KM 9", "Heron Point overlook"],
      ["KM 22", "Reservoir climb — the only real hill"],
      ["KM 35", "Riverside mile of signs from families"],
    ],
    medal: {
      description: "Enamel gold medal + finisher shirt",
      ribbonHeight: 72,
      size: 168,
      metal: "linear-gradient(135deg,#FFE08A,#B07A12)",
      face: "#10233A",
      faceInk: "#FF5A1F",
    },
  },
};

export const IMPACT_STATS = [
  { value: 100, suffix: "%", label: "of race surplus goes to field work" },
  { value: 14, suffix: " km", label: "of Meridian riverbank restored since 2019" },
  { value: 31, suffix: "", label: "community wells built" },
] as const;

// ---------- Formatting (server-side, so client components get finished strings) ----------

const pesoFormat = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** `80_000` centavos → `₱800`. */
export function formatPeso(centavos: number): string {
  return pesoFormat.format(centavos / 100);
}

/** One decimal, as on the course display: 5 → `5.0`, 21.0975 → `21.1`. */
export function formatKm(distanceKm: number): string {
  return distanceKm.toFixed(1);
}

/** Medal and tab label: whole distances read `5K`, others `21.1`. */
export function formatDistanceMark(distanceKm: number): string {
  return Number.isInteger(distanceKm) ? `${distanceKm}K` : formatKm(distanceKm);
}

/** `05:30` (24-hour, Asia/Manila) → `5:30 AM`. */
export function formatGunTime(gunTime: string): string {
  const [h = 0, m = 0] = gunTime.split(":").map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Elevation samples → SVG polyline points in a 600×120 box. */
export function elevationPoints(elevation: number[]): string {
  const last = Math.max(elevation.length - 1, 1);
  return elevation
    .map(
      (v, i) => `${Math.round((i / last) * 6000) / 10},${Math.round((112 - v * 1.25) * 10) / 10}`,
    )
    .join(" ");
}

export type RaceView = {
  id: RaceId;
  label: string;
  shortName: string;
  distanceMark: string;
  /** `5K`, `21.1K`. */
  distanceShort: string;
  km: string;
  /** The distance as stored, e.g. `42.195`. */
  kmExact: string;
  price: string;
  start: string;
  includes: string;
  blurb: string;
  gain: string;
  aidStations: string;
  cutoff: string;
  path: string;
  elevationLine: string;
  highlights: Array<[at: string, text: string]>;
  medal: CourseContent["medal"];
};

function toView(race: Readonly<Race>): RaceView {
  const course = COURSES[race.id];
  return {
    id: race.id,
    label: race.label,
    shortName: course.nickname ?? formatDistanceMark(race.distanceKm),
    distanceMark: formatDistanceMark(race.distanceKm),
    distanceShort: `${Number.isInteger(race.distanceKm) ? race.distanceKm : formatKm(race.distanceKm)}K`,
    km: formatKm(race.distanceKm),
    kmExact: String(race.distanceKm),
    price: formatPeso(race.priceCentavos),
    start: formatGunTime(race.gunTime),
    includes: course.includes,
    blurb: course.blurb,
    gain: course.gain,
    aidStations: String(course.aidStations),
    cutoff: course.cutoff,
    path: course.path,
    elevationLine: elevationPoints(course.elevation),
    highlights: course.highlights,
    medal: course.medal,
  };
}

/** Every race, in `RACE_IDS` order, ready to render. */
export function getRaceViews(): RaceView[] {
  return RACE_IDS.map((id) => toView(RACES[id]));
}

export function getRaceView(id: RaceId): RaceView {
  return toView(RACES[id]);
}

/** Cheapest entry, for "Register — from ₱800". */
export function lowestPrice(): string {
  return formatPeso(Math.min(...RACE_IDS.map((id) => RACES[id].priceCentavos)));
}
