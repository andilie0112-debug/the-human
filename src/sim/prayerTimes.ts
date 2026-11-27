// The five daily prayer times for a place and date, worked out from the sun as the Indonesian
// Ministry of Religious Affairs (Kemenag) does: Subuh when the sun is 20° below the horizon,
// Isya at 18°, Ashar when a shadow is its object's length plus the noon shadow (Shafi'i), Maghrib
// at sunset, and a safety margin (ihtiyat) of two minutes on each. Accurate to about a minute.

export interface PlaceOnEarth {
  lat: number;
  lng: number;
  /** Hours ahead of UTC (WIB 7, WITA 8, WIT 9). */
  tz: number;
}

export const PRAYER_NAMES = ['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'] as const;

const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;
const fixAngle = (a: number): number => ((a % 360) + 360) % 360;
const fixHour = (h: number): number => ((h % 24) + 24) % 24;

function julianDay(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
}

/** Sun declination (degrees) and equation of time (hours) for a Julian day. */
function sun(jd: number): { decl: number; eqt: number } {
  const d = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * d);
  const q = fixAngle(280.459 + 0.98564736 * d);
  const L = fixAngle(q + 1.915 * Math.sin(rad(g)) + 0.02 * Math.sin(rad(2 * g)));
  const e = 23.439 - 0.00000036 * d;
  const ra = fixHour(deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))) / 15);
  return { decl: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L)))), eqt: q / 15 - ra };
}

/**
 * Local clock hours (fractional, e.g. 4.27 = 04:16) of subuh, dzuhur, ashar, maghrib and isya on
 * a calendar day at a place.
 */
export function prayerTimes(date: { year: number; month: number; day: number }, at: PlaceOnEarth): number[] {
  const jd = julianDay(date.year, date.month, date.day) - at.lng / (15 * 24);
  const { decl, eqt } = sun(jd + 0.5);
  const noon = 12 + at.tz - at.lng / 15 - eqt;
  const lat = rad(at.lat);
  const dec = rad(decl);
  /** Hours from noon until the sun is at `altitude` degrees (negative: below the horizon). */
  const fromNoon = (altitude: number): number => {
    const c = (Math.sin(rad(altitude)) - Math.sin(dec) * Math.sin(lat)) / (Math.cos(dec) * Math.cos(lat));
    return deg(Math.acos(Math.min(1, Math.max(-1, c)))) / 15;
  };
  const asrAltitude = deg(Math.atan(1 / (1 + Math.tan(Math.abs(lat - dec)))));
  const margin = 2 / 60;
  return [
    noon - fromNoon(-20) + margin,
    noon + margin,
    noon + fromNoon(asrAltitude) + margin,
    noon + fromNoon(-0.833) + margin,
    noon + fromNoon(-18) + margin,
  ];
}

/** "04:16" */
export function clockText(hour: number): string {
  const m = Math.round(hour * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
