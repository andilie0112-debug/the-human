import { describe, expect, it } from 'vitest';
import { GameSession, defaultCharacter } from '../../../src/sim/session';
import { simData } from '../../../src/sim/gameData';
import { eligible, pickEvent, traditionsToday } from '../../../src/sim/events';
import { fromDate } from '../../../src/sim/time';

const ctx = { balance: 3500000, employed: false, ethnicities: ['jawa'], religionId: 'islam', floodRisk: 0.6, month: 1 };

describe('life events', () => {
  it('conditions: work events need a job, ethnicity events need the ethnicity, floods need a flood city in the rainy season', () => {
    const byId = (id: string) => simData.events.find((e) => e.id === id)!;
    expect(eligible(byId('lemburan'), ctx)).toBe(false);
    expect(eligible(byId('lemburan'), { ...ctx, employed: true })).toBe(true);
    expect(eligible(byId('selametan'), ctx)).toBe(true);
    expect(eligible(byId('ngayah'), ctx)).toBe(false);
    expect(eligible(byId('banjir'), ctx)).toBe(true);
    expect(eligible(byId('banjir'), { ...ctx, month: 7 })).toBe(false);
    expect(eligible(byId('banjir'), { ...ctx, floodRisk: 0.1 })).toBe(false);
  });

  it('picks only eligible events', () => {
    for (let r = 0; r < 1; r += 0.05) {
      const e = pickEvent(simData.events, ctx, r)!;
      expect(eligible(e, ctx)).toBe(true);
    }
  });

  it('a pending event waits for the player; choices change money and needs', () => {
    const s = new GameSession(simData);
    s.pendingEvent = { id: 'tokenListrik', titleKey: 'x', textKey: 'y', choices: simData.events.find((e) => e.id === 'tokenListrik')!.choices };
    const before = s.wallet.balance;
    s.chooseEvent(0);
    expect(s.wallet.balance).toBe(before - 100000);
    expect(s.pendingEvent).toBeNull();
  });

  it('daily events happen sometimes over a month', () => {
    const s = new GameSession(simData, defaultCharacter(), 7);
    let seen = 0;
    for (let d = 0; d < 30; d++) {
      const ev = s.simulate(24 * 60);
      if (ev.some((e) => e.kind === 'lifeEvent')) {
        seen++;
        s.chooseEvent(0);
      }
    }
    expect(seen).toBeGreaterThan(3);
    expect(seen).toBeLessThan(20);
  });
});

describe('traditions', () => {
  it('holidays follow religion and ethnicity (mixed parentage gets both)', () => {
    expect(traditionsToday(simData.traditions, '03-10', 'islam', []).map((t) => t.id)).toEqual(['lebaran']);
    expect(traditionsToday(simData.traditions, '03-10', 'kristen', []).map((t) => t.id)).toEqual([]);
    expect(traditionsToday(simData.traditions, '02-06', 'islam', ['jawa', 'chindo']).map((t) => t.id)).toEqual(['imlek']);
    expect(traditionsToday(simData.traditions, '08-17', 'buddha', []).map((t) => t.id)).toEqual(['agustusan']);
  });

  it('Imlek angpao: receive when single, give when married', () => {
    const single = new GameSession(simData, { ...defaultCharacter(), ethnicities: ['chindo'] });
    single.clock.minutes = fromDate(2027, 2, 6, 6);
    const b1 = single.wallet.balance;
    single.simulate(120);
    expect(single.wallet.balance - b1).toBe(400000);
    const married = new GameSession(simData, { ...defaultCharacter(), ethnicities: ['chindo'], married: true });
    married.clock.minutes = fromDate(2027, 2, 6, 6);
    const b2 = married.wallet.balance;
    married.simulate(120);
    expect(married.wallet.balance - b2).toBe(-300000);
  });

  it('Nyepi is a stay-home day for Hindu characters only', () => {
    const hindu = new GameSession(simData, { ...defaultCharacter(), religionId: 'hindu' });
    hindu.clock.minutes = fromDate(2027, 3, 8, 10);
    expect(hindu.isNyepi()).toBe(true);
    const other = new GameSession(simData);
    other.clock.minutes = fromDate(2027, 3, 8, 10);
    expect(other.isNyepi()).toBe(false);
  });
});

describe('social life', () => {
  it('starts with parents and neighbours', () => {
    const s = new GameSession(simData);
    expect(s.npcs.map((n) => n.role)).toEqual(['keluarga', 'keluarga', 'tetangga', 'tetangga']);
  });

  it('chatting and hanging out build the relationship; Ramah builds it faster', () => {
    const s = new GameSession(simData);
    const n = s.npcs[2];
    const r0 = n.relationship;
    s.social(n.id, 'chat');
    expect(n.relationship).toBe(r0 + 3);
    const before = s.wallet.balance;
    s.social(n.id, 'hangout');
    expect(n.relationship).toBe(r0 + 13);
    expect(s.wallet.balance).toBe(before - 75000);
    const friendly = new GameSession(simData, { ...defaultCharacter(), traits: ['ramah'] });
    const m = friendly.npcs[2];
    const m0 = m.relationship;
    friendly.social(m.id, 'chat');
    expect(m.relationship).toBe(m0 + 4.5);
  });

  it('dating, proposing and a wedding (needs 70 / 90 closeness and 60 days)', () => {
    const s = new GameSession(simData, defaultCharacter(), 3, 100000000);
    const n = s.npcs[2];
    expect(s.socialBlock(n.id, 'confess')).toBe('relationship');
    n.relationship = 100;
    s.social(n.id, 'confess');
    expect(n.datingSince).not.toBeNull();
    expect(s.socialBlock(n.id, 'propose')).toBe('time');
    s.clock.minutes += 61 * 24 * 60;
    n.relationship = 100;
    n.lastContact = s.clock.minutes;
    while (!n.engaged) s.social(n.id, 'propose');
    expect(s.wedding(n.id, 'adat')).toBe(true);
    expect(n.spouse).toBe(true);
    expect(s.character.married).toBe(true);
    expect(s.socialBlock(s.npcs[3].id, 'confess')).not.toBeNull();
  });

  it('family cannot be dated and keeps a closeness floor', () => {
    const s = new GameSession(simData);
    s.npcs[0].relationship = 90;
    expect(s.socialBlock('ayah', 'confess')).toBe('family');
    s.simulate(30 * 24 * 60);
    expect(s.npcs[0].relationship).toBeGreaterThanOrEqual(50);
  });
});

describe('trips', () => {
  it('mudik costs the ticket, clears homesickness and uses leave for work days', () => {
    const c = defaultCharacter();
    c.perantau = true;
    c.employment = { jobId: 'adm', monthlyGross: 5000000, startMinute: 0, workDaysThisMonth: 21, absentDaysThisMonth: 0 };
    const s = new GameSession(simData, c);
    s.character.vitals.kangen = 80;
    s.clock.minutes = fromDate(2027, 1, 11, 6); // Monday
    const trip = s.tripAction('mudik');
    const before = s.wallet.balance;
    expect(s.startAction(trip, 'door')).toBe(true);
    expect(s.wallet.balance).toBe(before - 700000);
    expect(s.career.job!.leaveDaysLeft).toBe(8);
    for (let i = 0; i < 200 && s.current; i++) s.simulate(60);
    expect(s.character.vitals.kangen).toBe(0);
    expect(s.career.job!.absentDaysThisMonth).toBe(0);
    expect(s.character.buffs.map((b) => b.id)).toContain('pulang');
  });
});
