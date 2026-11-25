import { tDynamic } from '../data/strings';
import type { GameSession } from '../sim/session';
import { rupiah } from './format';

// A life event or tradition that asks the player to choose: the game pauses until they answer.

export class EventDialog {
  private back: HTMLElement | null = null;

  constructor(private readonly session: GameSession, private readonly onChosen: () => void) {}

  get isOpen(): boolean {
    return this.back !== null;
  }

  /** Opens the dialog when an event is waiting (call every frame or after events). */
  check(): void {
    const p = this.session.pendingEvent;
    if (!p || this.back) return;
    const s = this.session;
    const speed = s.clock.speed;
    s.clock.speed = 0;
    const back = document.createElement('div');
    back.className = 'dialog-backdrop';
    const box = document.createElement('div');
    box.className = 'dialog interview event-dialog';
    const title = document.createElement('div');
    title.className = 'dialog-title';
    title.textContent = tDynamic(p.titleKey);
    const text = document.createElement('p');
    text.className = 'interview-q';
    text.textContent = tDynamic(p.textKey);
    box.append(title, text);
    p.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'interview-a';
      const money = c.effects.money ?? 0;
      b.textContent = money !== 0 ? `${tDynamic(c.labelKey)} (${money > 0 ? '+' : '−'}${rupiah(Math.abs(money))})` : tDynamic(c.labelKey);
      b.addEventListener('click', () => {
        s.chooseEvent(i);
        back.remove();
        this.back = null;
        s.clock.speed = speed === 0 ? 1 : speed;
        this.onChosen();
      });
      box.append(b);
    });
    back.append(box);
    document.body.append(back);
    this.back = back;
  }
}
