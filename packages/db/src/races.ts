/**
 * The race list. There is no races table: a price change is a deploy.
 *
 * This module imports nothing, so client components can show prices and gun times without pulling
 * in the database driver. The server takes the price from here, never from the request.
 */

export const RACE_IDS = ["5k", "10k", "21k", "42k"] as const;

export type RaceId = (typeof RACE_IDS)[number];

export type Race = {
  id: RaceId;
  label: string;
  distanceKm: number;
  /** Entry fee in centavos (PHP × 100), the unit PayMongo charges in. */
  priceCentavos: number;
  /** Gun time on race day, 24-hour, Asia/Manila. */
  gunTime: string;
};

export const RACES: Readonly<Record<RaceId, Readonly<Race>>> = Object.freeze({
  "5k": Object.freeze({
    id: "5k",
    label: "5K Fun Run",
    distanceKm: 5,
    priceCentavos: 80_000,
    gunTime: "05:30",
  }),
  "10k": Object.freeze({
    id: "10k",
    label: "10K Run",
    distanceKm: 10,
    priceCentavos: 100_000,
    gunTime: "05:00",
  }),
  "21k": Object.freeze({
    id: "21k",
    label: "21K Half Marathon",
    distanceKm: 21.0975,
    priceCentavos: 150_000,
    gunTime: "04:30",
  }),
  "42k": Object.freeze({
    id: "42k",
    label: "42K Marathon",
    distanceKm: 42.195,
    priceCentavos: 220_000,
    gunTime: "04:00",
  }),
});

export function isRaceId(value: unknown): value is RaceId {
  return typeof value === "string" && (RACE_IDS as readonly string[]).includes(value);
}
