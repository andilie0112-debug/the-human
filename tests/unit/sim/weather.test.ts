import { describe, expect, it } from 'vitest';
import { GameSession, defaultCharacter } from '../../../src/sim/session';
import { simData } from '../../../src/sim/gameData';
import { dayWeather, travelFactor, weatherAt } from '../../../src/sim/weather';
import { fromDate } from '../../../src/sim/time';

const cfg = simData.config.weather;

describe('weather', () => {
  it('rains far more often in the rainy season than in the dry season', () => {
    let wet = 0;
    let dry = 0;
    for (let d = 0; d < 300; d++) {
      if (dayWeather(d, 1, 'jkt', 0.6, cfg).rain) wet++;
      if (dayWeather(d, 8, 'jkt', 0.6, cfg).rain) dry++;
    }
    expect(wet / 300).toBeGreaterThan(0.6);
    expect(dry / 300).toBeLessThan(0.2);
  });

  it('is the same for the same day and city (saves agree) and showers fall in the afternoon', () => {
    for (let d = 0; d < 50; d++) {
      const a = dayWeather(d, 1, 'bdg', 0.15, cfg);
      expect(dayWeather(d, 1, 'bdg', 0.15, cfg)).toEqual(a);
      if (a.rain) {
        expect(a.startHour).toBeGreaterThanOrEqual(13);
        expect(a.endHour).toBeGreaterThan(a.startHour);
        expect(weatherAt(a, a.startHour).raining).toBe(true);
        expect(weatherAt(a, a.endHour).raining).toBe(false);
      }
    }
  });

  it('only flood-prone cities flood, and travel is slower in rain and floods', () => {
    let floodsRisky = 0;
    let floodsSafe = 0;
    for (let d = 0; d < 400; d++) {
      if (dayWeather(d, 1, 'jkt', 0.6, cfg).flood) floodsRisky++;
      if (dayWeather(d, 1, 'jkt', 0, cfg).flood) floodsSafe++;
    }
    expect(floodsRisky).toBeGreaterThan(0);
    expect(floodsSafe).toBe(0);
    expect(travelFactor({ raining: true, intensity: 1, flooded: false }, cfg)).toBe(1.3);
    expect(travelFactor({ raining: false, intensity: 0, flooded: true }, cfg)).toBe(2);
  });

  it('getting caught in the rain outdoors makes you wet and a bit gloomy; a flood event floods the street', () => {
    const s = new GameSession(simData, defaultCharacter());
    // Find a rainy day in January and stand outside during the shower.
    let day = 1;
    s.clock.minutes = fromDate(2027, 1, day, 6);
    while (!s.todayWeather().rain) s.clock.minutes = fromDate(2027, 1, ++day, 6);
    const w = s.todayWeather();
    s.clock.minutes = fromDate(2027, 1, day, w.startHour - 1);
    s.outdoors = true;
    const events = s.simulate(120);
    expect(events.some((e) => e.kind === 'weather' && e.raining)).toBe(true);
    expect(s.character.buffs.map((b) => b.id)).toContain('kehujanan');
    const s2 = new GameSession(simData);
    s2.pendingEvent = { id: 'banjir', titleKey: 'x', textKey: 'y', choices: simData.events.find((e) => e.id === 'banjir')!.choices };
    s2.chooseEvent(0);
    expect(s2.todayWeather().flood).toBe(true);
  });
});

describe('food delivery', () => {
  it('charges dishes and the fee, delivers after a while into the inventory, and costs more in the rain', () => {
    const s = new GameSession(simData);
    s.clock.minutes = fromDate(2027, 8, 2, 12); // dry season
    while (s.weatherNow().raining) s.clock.minutes += 24 * 60;
    const before = s.wallet.balance;
    const q = s.deliveryQuote({ nasi_goreng: 2 });
    expect(q.food).toBe(50000);
    expect(q.rainFee).toBe(0);
    const min = s.orderDelivery({ nasi_goreng: 2 })!;
    expect(s.wallet.balance).toBe(before - q.total);
    expect(min).toBeGreaterThanOrEqual(25);
    s.simulate(10);
    expect(s.inventory.countCategory('pesanan')).toBe(0);
    const ev = s.simulate(60);
    expect(ev.some((e) => e.kind === 'delivery')).toBe(true);
    expect(s.inventory.countCategory('pesanan')).toBe(2);
    expect(s.orderDelivery({})).toBeNull();
    const wet = new GameSession(simData);
    wet.weatherNow = () => ({ raining: true, intensity: 1, flooded: false });
    expect(wet.deliveryQuote({ bakso: 1 }).rainFee).toBe(simData.config.delivery.rainFee);
  });
});
