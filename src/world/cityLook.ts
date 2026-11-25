import { fmt, t } from '../data/strings';
import type { CityData } from '../sim/session';

// City variants of the same neighborhood: sign texts follow the chosen city
// (its public transport, its signature food).

export function cityLabels(city: Pick<CityData, 'name' | 'publicTransport' | 'signatureFood'>): Record<string, string> {
  const transport = city.publicTransport.find((p) => p.toLowerCase() !== 'ojol') ?? city.publicTransport[0] ?? '';
  return {
    halte: fmt(t('city.halte'), { transport }),
    warung: fmt(t('city.warung'), { food: city.signatureFood }),
    kos: fmt(t('city.kos'), { city: city.name }),
  };
}
