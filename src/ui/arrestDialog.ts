import { fmt, t, tDynamic } from '../data/strings';
import type { ActionDef } from '../sim/actions';
import type { GameSession } from '../sim/session';
import { rupiah } from './format';

// Caught by the police: the open offences, then a choice between the fine and jail time.
// Resolves with the jail action to run (or null when the fine was paid).

export function showArrest(session: GameSession): Promise<ActionDef | null> {
  return new Promise((resolve) => {
    const speed = session.clock.speed;
    session.clock.speed = 0;
    const back = document.createElement('div');
    back.className = 'dialog-backdrop';
    const box = document.createElement('div');
    box.className = 'dialog interview';
    const title = document.createElement('div');
    title.className = 'dialog-title';
    title.textContent = t('crime.arrested');
    const open = session.crime.record.filter((e) => e.outcome === 'buron').map((e) => tDynamic(`offence.${e.offence}`));
    const text = document.createElement('p');
    text.className = 'interview-q';
    const fine = session.fine();
    const days = session.jailDays();
    text.textContent = fmt(t('crime.arrestText'), { list: [...new Set(open)].join(', ') || '-', fine: rupiah(fine), days });
    box.append(title, text);
    const done = (choice: 'denda' | 'penjara'): void => {
      const action = session.arrest(choice);
      back.remove();
      session.clock.speed = speed === 0 ? 1 : speed;
      resolve(action);
    };
    const pay = document.createElement('button');
    pay.className = 'btn-primary';
    pay.textContent = fmt(t('crime.payFine'), { fine: rupiah(fine) });
    pay.disabled = session.wallet.balance < fine;
    pay.addEventListener('click', () => done('denda'));
    const jail = document.createElement('button');
    jail.className = 'btn-secondary';
    jail.textContent = fmt(t('crime.jail'), { days });
    jail.addEventListener('click', () => done('penjara'));
    box.append(pay, jail);
    if (pay.disabled) {
      const note = document.createElement('p');
      note.textContent = t('crime.cantPay');
      box.append(note);
    }
    back.append(box);
    document.body.append(back);
  });
}
