import { describe, expect, it } from 'vitest';
import { GameSession } from '../../../src/sim/session';
import { simData } from '../../../src/sim/gameData';
import { SKILLS } from '../../../src/sim/career';
import { dayProfit } from '../../../src/sim/business';

describe('side business', () => {
  it('data: every business names a real skill and has its work action', async () => {
    const objects = (await import('../../../src/data/objects.json')).default as unknown as { actions: { requires?: string }[] }[];
    const required = new Set(objects.flatMap((o) => o.actions.map((a) => a.requires).filter(Boolean)));
    for (const b of simData.config.business.types) {
      expect(SKILLS).toContain(b.skill);
      expect(required.has(`business:${b.id}`)).toBe(true);
    }
  });

  it('starting costs the capital; only one business at a time; work actions need the business', () => {
    const s = new GameSession(simData, undefined, 1, 10000000);
    const work = { id: 'biz_online', labelKey: 'x', durationMinutes: 120, requires: 'business:online', animation: 'sit' as const };
    expect(s.actionBlock(work)).toBe('business');
    const before = s.wallet.balance;
    expect(s.startBusiness('online')).toBe(true);
    expect(s.wallet.balance).toBe(before - 1500000);
    expect(s.startBusiness('katering')).toBe(false);
    expect(s.actionBlock(work)).toBeNull();
  });

  it('worked days earn more and build reputation; neglected days lose it; profit is booked at midnight', () => {
    const type = simData.config.business.types.find((t) => t.id === 'online')!;
    const state = { typeId: 'online', reputation: 50, workedDay: 0, startedDay: 0, totalProfit: 0, lastProfit: 0 };
    expect(dayProfit(state, type, true, 5, 0.5)).toBeGreaterThan(dayProfit(state, type, false, 5, 0.5));
    expect(dayProfit({ ...state, reputation: 90 }, type, true, 5, 0.5)).toBeGreaterThan(dayProfit(state, type, true, 5, 0.5));
    expect(dayProfit(state, type, false, 0, 0)).toBeLessThan(0); // costs keep running

    const s = new GameSession(simData, undefined, 1, 10000000);
    s.startBusiness('online');
    const rep0 = s.business!.reputation;
    // Work on it today, then let the day end.
    s.startAction({ id: 'biz_online', labelKey: 'act.bizOnline', durationMinutes: 120, requires: 'business:online', animation: 'sit' }, 'desk');
    s.simulate(130);
    const balance = s.wallet.balance;
    const ev = s.simulate(24 * 60);
    const booked = ev.find((e) => e.kind === 'business');
    expect(booked).toBeDefined();
    expect(s.business!.reputation).toBe(rep0 + simData.config.business.reputationGain);
    expect(s.business!.lastProfit).toBe(booked && booked.kind === 'business' ? booked.profit : NaN);
    expect(Math.abs(s.wallet.balance - balance)).toBeGreaterThan(0);
    s.closeBusiness();
    expect(s.business).toBeNull();
  });
});
