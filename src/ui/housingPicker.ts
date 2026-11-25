import { fmt, t, tDynamic } from '../data/strings';
import { GameSession } from '../sim/session';
import { rupiah } from './format';

// After the character creator: choose the first home (kos, kontrakan, apartment, empty rented
// house, or the family's land with a temporary shack). Prices follow the chosen city.

const ICONS: Record<string, string> = { kos: '🛏️', kontrakan: '🏘️', apartemen: '🏢', rumah_sewa: '🏠', tanah: '🌱' };

export function showHousingPicker(session: GameSession, onPicked: () => void): void {
  const root = document.createElement('div');
  root.className = 'main-menu housing';
  const title = document.createElement('h1');
  title.textContent = t('house.title');
  const sub = document.createElement('p');
  sub.textContent = t('house.subtitle');
  const list = document.createElement('div');
  list.className = 'housing-list';
  for (const id of GameSession.START_HOMES) {
    const rent = session.rentOf(id);
    const can = session.wallet.balance >= rent;
    const card = document.createElement('button');
    card.className = 'housing-card';
    card.disabled = !can;
    const name = document.createElement('strong');
    name.textContent = `${ICONS[id] ?? '🏠'} ${tDynamic(`home.${id === 'rumah_sewa' ? 'rumahSewa' : id}`)}`;
    const desc = document.createElement('span');
    desc.textContent = tDynamic(`house.${id}`);
    const price = document.createElement('em');
    price.textContent = rent > 0 ? fmt(t('house.rent'), { rent: rupiah(rent) }) : t('house.free');
    if (!can) price.textContent += ` · ${t('house.cantAfford')}`;
    card.append(name, desc, price);
    card.addEventListener('click', () => {
      if (!session.startHome(id)) return;
      root.remove();
      onPicked();
    });
    list.append(card);
  }
  const money = document.createElement('p');
  money.textContent = `💰 ${rupiah(session.wallet.balance)}`;
  root.append(title, sub, money, list);
  document.body.append(root);
}
