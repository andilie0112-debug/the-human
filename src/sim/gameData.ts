import cities from '../data/cities.json';
import holidays from '../data/holidays.json';
import religions from '../data/religions.json';
import sim from '../data/sim.json';
import type { SimData } from './session';

/** Simulation data assembled from the JSON content in src/data. */
export const simData: SimData = {
  config: sim,
  calendar: holidays,
  religions,
  cities,
};
