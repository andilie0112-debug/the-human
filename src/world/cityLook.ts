import { fmt, t } from '../data/strings';
import type { CityData } from '../sim/session';

// City variants of the same neighbourhood: sign texts follow the chosen city (its district,
// public transport, mall, hospital, station and street food). Brands are parodies.

type CityLike = Pick<CityData, 'name' | 'publicTransport' | 'signatureFood'> & Partial<CityData>;

export function cityLabels(city: CityLike): Record<string, string> {
  const transport = city.publicTransport.find((p) => p.toLowerCase() !== 'ojol') ?? city.publicTransport[0] ?? '';
  const district = city.district ?? city.name;
  const carts = city.cart ?? ['Bakso', 'Siomay', 'Es cendol'];
  return {
    halte: city.transit ?? fmt(t('city.halte'), { transport }),
    warung: fmt(t('city.warung'), { food: city.signatureFood }),
    kos: fmt(t('city.kos'), { city: city.name }),
    minimarket: t('city.minimarket'),
    betamart: t('place.betamart'),
    kafe: t('city.kafe'),
    gym: t('city.gym'),
    klinik: t('city.klinik'),
    pasar: fmt(t('city.pasar'), { district }),
    kantor: fmt(t('city.kantor'), { city: city.name }),
    polsek: fmt(t('city.polsek'), { district }),
    mall: city.mall ?? t('place.mall'),
    rs: city.hospital ?? t('place.rs'),
    stasiun: city.station ?? t('place.stasiun'),
    bandara: t('place.bandara'),
    gerobak1: carts[0],
    gerobak2: carts[1] ?? carts[0],
    gerobak3: carts[2] ?? carts[0],
  };
}
