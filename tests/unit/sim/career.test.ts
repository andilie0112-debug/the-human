import { describe, expect, it } from 'vitest';
import { Career, type CareerEvent, type CareerHost, type SkillId } from '../../../src/sim/career';
import { simData } from '../../../src/sim/gameData';
import { MINUTES_PER_DAY, fromDate, toParts } from '../../../src/sim/time';

interface Fake extends CareerHost {
  t: number;
  rolls: number[];
  paid: number;
}

function makeCareer(opts: { education?: string; skills?: Partial<Record<SkillId, number>>; presentation?: number; industries?: string[] } = {}): { c: Career; h: Fake } {
  const h: Fake = {
    t: fromDate(2027, 1, 4, 8), // Monday
    rolls: [],
    paid: 0,
    now: () => h.t,
    rng: () => (h.rolls.length ? h.rolls.shift()! : 0.5),
    cityMinimumWage: () => 5000000,
    education: () => opts.education ?? 'S1',
    experienceYears: () => 0,
    skills: () => ({ logika: 0, karisma: 0, kreatif: 0, masak: 0, fisik: 0, ...opts.skills }),
    traits: () => [],
    presentation: () => opts.presentation ?? 80,
    pay: (amount) => {
      h.paid += amount;
    },
    isPublicHoliday: () => false,
  };
  const c = new Career(h, simData.jobs, simData.config.career, () => opts.industries ?? ['kantor', 'pabrik']);
  c.refreshListings(h.t); // this week's listings, so later random rolls go where the tests expect
  return { c, h };
}

function day(h: Fake, c: Career, out: CareerEvent[] = []): CareerEvent[] {
  h.t = Math.floor(h.t / MINUTES_PER_DAY + 1) * MINUTES_PER_DAY;
  c.onNewDay(h.t, out);
  return out;
}

/** Applies to an admin job and walks the application to an interview invitation. */
function toInterview(c: Career, h: Fake): string {
  c.refreshListings(h.t);
  c.listings = [{ id: 'L1', jobId: 'adm', company: 'PT Uji', salary: 5000000, postedDay: 0 }];
  const app = c.apply('L1')!;
  h.rolls = [0.9, 0, 0]; // not ghosted, interview in 2 days at 09:00
  h.t = app.replyAt - 1;
  day(h, c);
  expect(app.status).toBe('interview');
  return app.id;
}

describe('career', () => {
  it('lists jobs only from the city industries', () => {
    const { c, h } = makeCareer({ industries: ['retail'] });
    c.refreshListings(h.t);
    expect(c.listings.length).toBeGreaterThan(0);
    for (const l of c.listings) expect(simData.jobs.find((j) => j.id === l.jobId)!.industry).toBe('retail');
  });

  it('salary is the minimum wage times the job multiplier', () => {
    const { c } = makeCareer();
    expect(c.salaryFor(c.jobData('prog'))).toBe(8000000);
  });

  it('rejects CVs that do not meet the education requirement', () => {
    const { c, h } = makeCareer({ education: 'SMA/SMK' });
    c.listings = [{ id: 'L1', jobId: 'prog', company: 'PT A', salary: 1, postedDay: 0 }];
    const app = c.apply('L1')!;
    h.t = app.replyAt;
    const out = day(h, c);
    expect(app.status).toBe('rejected');
    expect(app.reason).toBe('education');
    expect(out.some((e) => e.kind === 'message' && e.message.textKey === 'msg.rejectEducation')).toBe(true);
  });

  it('some companies never answer (ghosting)', () => {
    const { c, h } = makeCareer();
    c.listings = [{ id: 'L1', jobId: 'adm', company: 'PT A', salary: 1, postedDay: 0 }];
    const app = c.apply('L1')!;
    h.rolls = [0.1];
    h.t = app.replyAt - 1;
    day(h, c);
    expect(app.status).toBe('ghosted');
  });

  it('invites to an interview; good answers lead to an offer that starts next Monday', () => {
    const { c, h } = makeCareer();
    const id = toInterview(c, h);
    const app = c.applications.find((a) => a.id === id)!;
    h.t = app.interviewAt!;
    expect(c.interviewNow()?.id).toBe(id);
    c.attendInterview(id, 1);
    day(h, c);
    day(h, c); // the result arrives a day after the interview
    expect(app.status).toBe('offer');
    expect(c.acceptOffer(id)).toBe(true);
    const start = c.pendingStart!.startAt;
    expect(toParts(start).weekday).toBe(1);
    h.t = start - 1;
    const out = day(h, c);
    expect(out.some((e) => e.kind === 'hired')).toBe(true);
    expect(c.job?.company).toBe('PT Uji');
  });

  it('bad answers or missing skills fail the interview', () => {
    const { c, h } = makeCareer({ presentation: 20 });
    const id = toInterview(c, h);
    c.attendInterview(id, 0.1);
    day(h, c);
    day(h, c);
    expect(c.applications.find((a) => a.id === id)!.status).toBe('rejected');
    const missing = makeCareer().c;
    expect(missing.interviewScore(1, 'prog')).toBeLessThan(makeCareer({ skills: { logika: 3 } }).c.interviewScore(1, 'prog'));
  });

  it('missing the interview cancels the application', () => {
    const { c, h } = makeCareer();
    const id = toInterview(c, h);
    day(h, c);
    day(h, c);
    day(h, c);
    expect(c.applications.find((a) => a.id === id)!.status).toBe('failed');
  });

  function employed(): { c: Career; h: Fake } {
    const r = makeCareer();
    r.c.job = { jobId: 'adm', company: 'PT Uji', monthlyGross: 5000000, startMinute: r.h.t, level: 0, levelSinceMinute: r.h.t, performance: 50, warnings: 0, absencesSinceWarning: 0, absentDaysThisMonth: 0, leaveDaysLeft: 12, excusedDays: [], lastJudgedDay: -1 };
    return r;
  }

  it('going to work on time raises performance, being late lowers it', () => {
    const { c, h } = employed();
    h.t = fromDate(2027, 1, 4, 7, 0); // shift 08:00, commute 30 min
    expect(c.canGoToWork(h.t)).toBe(true);
    c.startShift(h.t, []);
    expect(c.job!.performance).toBe(52);
    h.t = fromDate(2027, 1, 5, 8, 30);
    const out: CareerEvent[] = [];
    c.startShift(h.t, out);
    expect(c.job!.performance).toBe(49);
    expect(out[0].kind === 'message' && out[0].message.textKey).toBe('msg.late');
  });

  it('three absences give SP1, more lead to dismissal', () => {
    const { c, h } = employed();
    const events: CareerEvent[] = [];
    for (let d = 4; d <= 31 && c.job; d++) {
      const t = fromDate(2027, 1, d, 11);
      if (!c.isWorkDay(t)) continue;
      h.t = t;
      c.checkAbsence(t, events);
    }
    const keys = events.filter((e) => e.kind === 'message').map((e) => (e.kind === 'message' ? e.message.textKey : ''));
    expect(keys).toContain('msg.sp1');
    expect(keys).toContain('msg.sp3');
    expect(events.some((e) => e.kind === 'fired')).toBe(true);
  });

  it('sick leave and annual leave excuse the day', () => {
    const { c, h } = employed();
    h.t = fromDate(2027, 1, 4, 7);
    expect(c.requestSickLeave(h.t, false)).toBe(false);
    expect(c.requestSickLeave(h.t, true)).toBe(true);
    c.checkAbsence(fromDate(2027, 1, 4, 11), []);
    expect(c.job!.absentDaysThisMonth).toBe(0);
    expect(c.requestLeave(h.t)).toBe(true);
    expect(c.job!.leaveDaysLeft).toBe(11);
    c.checkAbsence(fromDate(2027, 1, 5, 11), []);
    expect(c.job!.absentDaysThisMonth).toBe(0);
  });

  it('a good worker is promoted with a 20% raise after three months', () => {
    const { c, h } = employed();
    c.job!.performance = 90;
    h.t = fromDate(2027, 5, 1) - 1;
    c.refreshListings(h.t);
    h.rolls = [0.9];
    const out = day(h, c);
    expect(c.job!.level).toBe(1);
    expect(c.job!.monthlyGross).toBe(6000000);
    expect(out.some((e) => e.kind === 'message' && e.message.textKey === 'msg.promoted')).toBe(true);
  });

  it('a rare layoff pays severance', () => {
    const { c, h } = employed();
    h.t = fromDate(2027, 2, 1) - 1;
    c.refreshListings(fromDate(2027, 2, 1)); // 1 Feb is a Monday: new listings that week
    h.rolls = [0.001];
    const out = day(h, c);
    expect(c.job).toBeNull();
    expect(h.paid).toBe(5000000);
    expect(out.some((e) => e.kind === 'fired' && e.reason === 'layoff')).toBe(true);
  });

  it('counts the scheduled work days of a month', () => {
    const { c } = employed();
    expect(c.workDaysInMonth(fromDate(2027, 1, 10))).toBe(21); // Mon-Fri in January 2027
  });
});
