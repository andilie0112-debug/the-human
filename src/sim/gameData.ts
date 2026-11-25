import cities from '../data/cities.json';
import holidays from '../data/holidays.json';
import religions from '../data/religions.json';
import sim from '../data/sim.json';
import items from '../data/items.json';
import jobs from '../data/jobs.json';
import interviewQuestions from '../data/interview_questions.json';
import objects from '../data/objects.json';
import kos from '../data/rooms/kos.json';
import kontrakan from '../data/rooms/kontrakan.json';
import rumah from '../data/rooms/rumah.json';
import type { SimData } from './session';

/** Simulation data assembled from the JSON content in src/data. */
export const simData: SimData = {
  config: sim,
  calendar: holidays,
  religions,
  cities,
  items,
  jobs: jobs as SimData['jobs'],
  interviewQuestions,
  objects: objects as unknown as SimData['objects'],
  layouts: { kos, kontrakan, rumah } as unknown as SimData['layouts'],
};
