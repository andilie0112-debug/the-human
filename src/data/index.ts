import cities from './cities.json';
import ethnicities from './ethnicities.json';
import holidays from './holidays.json';
import interviewQuestions from './interview_questions.json';
import jobs from './jobs.json';
import religions from './religions.json';
import traits from './traits.json';
import trips from './trips.json';
import { validateIdList, validateKeys, type DataIssue } from './validate';

export const gameData = { cities, ethnicities, holidays, interviewQuestions, jobs, religions, traits, trips };

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
  return issues;
}
