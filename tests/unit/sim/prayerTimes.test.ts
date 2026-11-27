import { describe, expect, it } from 'vitest';
import { clockText, prayerTimes } from '../../../src/sim/prayerTimes';

const minutes = (h: number): number => Math.round(h * 60);
const near = (got: number, want: string, tolerance = 4): void => {
  const [hh, mm] = want.split(':').map(Number);
  expect(Math.abs(minutes(got) - (hh * 60 + mm))).toBeLessThanOrEqual(tolerance);
};

describe('prayer times (Kemenag method)', () => {
  it('Jakarta on 1 January matches the published schedule within a few minutes', () => {
    // Kemenag schedule for Jakarta, early January: Subuh 04:16, Dzuhur 11:55, Ashar 15:21, Maghrib 18:12, Isya 19:27.
    const [subuh, dzuhur, ashar, maghrib, isya] = prayerTimes({ year: 2027, month: 1, day: 1 }, { lat: -6.2088, lng: 106.8456, tz: 7 });
    near(subuh, '04:16');
    near(dzuhur, '11:55');
    near(ashar, '15:21');
    near(maghrib, '18:12');
    near(isya, '19:27');
  });

  it('Makassar (WITA) prays by its own clock, and later in the year times shift', () => {
    const jan = prayerTimes({ year: 2027, month: 1, day: 1 }, { lat: -5.1477, lng: 119.4327, tz: 8 });
    // Makassar: Dzuhur about 12:05 WITA in early January.
    near(jan[1], '12:05');
    const aug = prayerTimes({ year: 2027, month: 8, day: 1 }, { lat: -6.2088, lng: 106.8456, tz: 7 });
    // Jakarta in early August: Subuh about 04:43, Maghrib about 17:58.
    near(aug[0], '04:43');
    near(aug[3], '17:58');
  });

  it('keeps the order subuh < dzuhur < ashar < maghrib < isya everywhere', () => {
    for (const lat of [-8.7, -6.2, 1.0, 3.6]) {
      const t = prayerTimes({ year: 2027, month: 6, day: 15 }, { lat, lng: 110, tz: 7 });
      for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
    }
  });

  it('formats clock times', () => {
    expect(clockText(4.27)).toBe('04:16');
    expect(clockText(19.5)).toBe('19:30');
  });
});
