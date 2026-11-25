import cities from './cities.json';
import ethnicities from './ethnicities.json';
import holidays from './holidays.json';
import interviewQuestions from './interview_questions.json';
import jobs from './jobs.json';
import religions from './religions.json';
import traits from './traits.json';
import trips from './trips.json';
import sim from './sim.json';
import { validateIdList, validateKeys, type DataIssue } from './validate';

export const gameData = { cities, ethnicities, holidays, interviewQuestions, jobs, religions, traits, trips, sim };

/** Validates all content files; returns a list of problems (empty when everything is fine). */
export function validateGameData(): DataIssue[] {
  const ethnicityIds = new Set(ethnicities.map((e) => e.id));
  const cityIds = new Set(cities.map((c) => c.id));
  const issues: DataIssue[] = [
    ...validateIdList('cities', cities),
    ...validateIdList('ethnicities', ethnicities),
    ...validateIdList('jobs', jobs),
    ...validateIdList('religions', religions),
    ...validateIdList('traits', traits),
    ...validateKeys('interview_questions', interviewQuestions, ['question', 'answers']),
    ...validateKeys('trips', trips, ['destination', 'cost', 'days']),
    ...validateKeys('holidays.holidays', holidays.holidays, []),
  ];
  for (const e of ethnicities) {
    for (const c of e.homeCityIds) if (!cityIds.has(c)) issues.push(`ethnicities.${e.id}: unknown city "${c}"`);
  }
  if (ethnicityIds.size !== ethnicities.length) issues.push('ethnicities: duplicate ids');

  // Simulation rules (sim.json)
  const brackets = sim.payroll.taxBrackets;
  brackets.forEach((b, i) => {
    const prev = i > 0 ? brackets[i - 1].upTo : 0;
    if (b.upTo !== null && (prev === null || b.upTo <= prev)) issues.push(`sim.payroll.taxBrackets[${i}]: must be ascending`);
    if (b.rate < 0 || b.rate > 1) issues.push(`sim.payroll.taxBrackets[${i}]: rate out of range`);
  });
  if (brackets[brackets.length - 1]?.upTo !== null) issues.push('sim.payroll.taxBrackets: last bracket must have upTo null');
  for (const [k, v] of Object.entries(sim.needs.decayPerHour)) if (v < 0) issues.push(`sim.needs.decayPerHour.${k}: negative`);
  for (const r of religions) if (Number.isNaN(Date.parse(r.mainHolidayDate2027))) issues.push(`religions.${r.id}: bad mainHolidayDate2027`);
  return issues;
}
