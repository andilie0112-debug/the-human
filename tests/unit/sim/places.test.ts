import { describe, expect, it } from 'vitest';
import { GameSession, defaultCharacter, type SimEvent } from '../../../src/sim/session';
import { simData } from '../../../src/sim/gameData';
import places from '../../../src/data/places.json';
import type { ActionDef } from '../../../src/sim/actions';

function act(placeId: string, actionId: string): ActionDef {
  const a = places.find((p) => p.id === placeId)?.actions.find((x) => x.id === actionId);
  if (!a) throw new Error(`${placeId}.${actionId}`);
  return a as ActionDef;
}

function run(s: GameSession): SimEvent[] {
  const ev: SimEvent[] = [];
  for (let i = 0; i < 3000 && s.current; i++) ev.push(...s.simulate(1));
  return ev;
}

describe('neighborhood places', () => {
  it('there is a place of worship for each of the six religions', () => {
    for (const r of simData.religions) expect(places.some((p) => p.kind === 'worship' && p.religion === r.id), r.id).toBe(true);
  });

  it('the warung charges the city street-meal price and fills you up', () => {
    const s = new GameSession(simData);
    s.character.vitals.needs.kenyang = 20;
    const before = s.wallet.balance;
    expect(s.startAction(act('warung', 'eat_warung'), 'warung')).toBe(true);
    expect(s.wallet.balance).toBe(before - 25000);
    run(s);
    expect(s.character.vitals.needs.kenyang).toBeGreaterThan(90);
  });

  it('the clinic cures sickness; BPJS covers it when employed', () => {
    const s = new GameSession(simData);
    s.character.vitals.sick = true;
    s.character.vitals.health = 25;
    const before = s.wallet.balance;
    s.startAction(act('klinik', 'see_doctor'), 'klinik');
    expect(s.wallet.balance).toBe(before - 150000);
    run(s);
    expect(s.character.vitals.sick).toBe(false);
    expect(s.character.vitals.health).toBeGreaterThanOrEqual(65);
    const c = defaultCharacter();
    c.employment = { jobId: 'adm', monthlyGross: 5000000, startMinute: 0, workDaysThisMonth: 21, absentDaysThisMonth: 0 };
    const worker = new GameSession(simData, c);
    expect(worker.costOf(act('klinik', 'see_doctor'))).toBe(0);
  });

  it('ojol driving needs a motorbike and pays per hour', () => {
    const s = new GameSession(simData);
    expect(s.actionBlock(act('ojol', 'drive_ojol'))).toBe('motorbike');
    s.wallet.balance = 9000000;
    expect(s.buyMotorbike()).toBe(true);
    const before = s.wallet.balance;
    s.startAction(act('ojol', 'drive_ojol'), 'ojol');
    run(s);
    expect(s.wallet.balance - before).toBe(64000);
  });

  it('worship at a place is for its own religion; anyone may visit', () => {
    const s = new GameSession(simData); // Muslim by default
    expect(s.actionBlock(act('masjid', 'worship_place'), 'islam')).toBeNull();
    expect(s.actionBlock(act('pura', 'worship_place'), 'hindu')).toBe('religion');
    expect(s.actionBlock(act('pura', 'visit_place'), 'hindu')).toBeNull();
  });

  it('the market is cheaper than the minimarket', () => {
    const a = new GameSession(simData);
    const b = new GameSession(simData);
    const list = { ayam: 2, sayur: 2 };
    a.buyNow(list, 1);
    b.buyNow(list, 0.8);
    expect(3500000 - a.wallet.balance).toBe(46000);
    expect(3500000 - b.wallet.balance).toBe(36800);
    expect(b.inventory.count('ayam')).toBe(2);
  });

  it('ojol fast travel costs money and takes time', () => {
    const s = new GameSession(simData);
    const q = s.travelQuote(500);
    expect(q.cost).toBe(38000);
    expect(q.minutes).toBe(68);
    const t0 = s.clock.minutes;
    s.travel(500);
    expect(s.clock.minutes - t0).toBeCloseTo(68);
    expect(s.wallet.balance).toBe(3500000 - 38000);
  });
});

describe('stage 4 places', () => {
  it('the mall, police, hospital, station, a second minimarket and three food carts exist', async () => {
    const places = (await import('../../../src/data/places.json')).default as { id: string; kind: string; actions: { id: string }[] }[];
    for (const id of ['mall', 'polsek', 'rs', 'stasiun', 'betamart', 'gerobak1', 'gerobak2', 'gerobak3']) expect(places.some((p) => p.id === id)).toBe(true);
    expect(places.filter((p) => p.kind === 'cart').every((p) => p.actions.some((a) => a.id === 'jajan'))).toBe(true);
  });

  it('an SKCK from the police station is remembered', async () => {
    const { GameSession } = await import('../../../src/sim/session');
    const { simData } = await import('../../../src/sim/gameData');
    const places = (await import('../../../src/data/places.json')).default as unknown as { id: string; actions: import('../../../src/sim/actions').ActionDef[] }[];
    const s = new GameSession(simData);
    const skck = places.find((p) => p.id === 'polsek')!.actions[0];
    expect(s.startAction(skck, 'place:polsek')).toBe(true);
    s.simulate(120);
    expect(s.character.skck).toBe(true);
  });
});
