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
import apartemen from '../data/rooms/apartemen.json';
import rumah_sewa from '../data/rooms/rumah_sewa.json';
import tanah from '../data/rooms/tanah.json';
import events from '../data/events.json';
import traditions from '../data/traditions.json';
import names from '../data/names.json';
import ethnicities from '../data/ethnicities.json';
import trips from '../data/trips.json';
import type { SimData } from './session';

/** Simulation data assembled from the JSON content in src/data. */
export const simData: SimData = {
  config: sim as unknown as SimData['config'], // JSON string unions (skill ids) are checked by the data tests
  calendar: holidays,
  religions,
  cities,
  items,
  jobs: jobs as SimData['jobs'],
  interviewQuestions,
  objects: objects as unknown as SimData['objects'],
  layouts: { kos, kontrakan, rumah, apartemen, rumah_sewa, tanah } as unknown as SimData['layouts'],
  events: events as unknown as SimData['events'],
  traditions: traditions as unknown as SimData['traditions'],
  names,
  ethnicities,
  trips: trips as SimData["trips"],
};
