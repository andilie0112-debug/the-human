// Weather: dry and rainy seasons. In the rainy season (about October to April) afternoons often
// bring a downpour; cities with a high flood risk can flood after heavy rain. The weather of a day
// is worked out from the day and the city, so it is the same after loading a save.

export interface WeatherConfig {
  /** Chance of rain on a day, per month 1..12. */
  rainChanceByMonth: number[];
  /** Earliest and latest hour a shower starts (afternoon storms). */
  startHours: number[];
  /** Shortest and longest shower in hours. */
  durationHours: number[];
  /** Heavy rain above this intensity can flood a flood-prone city. */
  floodIntensity: number;
  /** Extra travel time while it rains (fraction), and while flooded. */
  rainTravelSlowdown: number;
  floodTravelSlowdown: number;
}

export interface DayWeather {
  rain: boolean;
  startHour: number;
  endHour: number;
  /** 0..1 */
  intensity: number;
  /** The neighbourhood floods after the rain (until the next morning). */
  flood: boolean;
}

export interface WeatherNow {
  raining: boolean;
  intensity: number;
  flooded: boolean;
}

/** A small deterministic random number from a day and a city id (0..1). */
function noise(day: number, salt: string, k: number): number {
  let h = 2166136261 ^ (day * 374761393 + k * 668265263);
  for (let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function dayWeather(day: number, month: number, cityId: string, floodRisk: number, cfg: WeatherConfig): DayWeather {
  const chance = cfg.rainChanceByMonth[month - 1] ?? 0;
  const rain = noise(day, cityId, 1) < chance;
  if (!rain) return { rain: false, startHour: 0, endHour: 0, intensity: 0, flood: false };
  const [h0, h1] = cfg.startHours;
  const [d0, d1] = cfg.durationHours;
  const startHour = h0 + Math.floor(noise(day, cityId, 2) * (h1 - h0 + 1));
  const endHour = Math.min(24, startHour + d0 + Math.floor(noise(day, cityId, 3) * (d1 - d0 + 1)));
  const intensity = 0.35 + noise(day, cityId, 4) * 0.65;
  const flood = intensity > cfg.floodIntensity && noise(day, cityId, 5) < floodRisk * 0.6;
  return { rain, startHour, endHour, intensity, flood };
}

/** The weather at an hour of a day (flooding lasts from the end of the rain to midnight). */
export function weatherAt(w: DayWeather, hour: number): WeatherNow {
  const raining = w.rain && hour >= w.startHour && hour < w.endHour;
  return { raining, intensity: raining ? w.intensity : 0, flooded: w.flood && hour >= w.startHour + 1 };
}

/** Travel takes longer in the rain and much longer through floods. */
export function travelFactor(now: WeatherNow, cfg: WeatherConfig): number {
  if (now.flooded) return 1 + cfg.floodTravelSlowdown;
  if (now.raining) return 1 + cfg.rainTravelSlowdown;
  return 1;
}
