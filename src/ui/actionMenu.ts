import { fmt, t, tDynamic } from '../data/strings';
import type { ObjectInstance } from '../home/kosRoom';
import type { ActionBlock, ActionDef } from '../sim/actions';
import { totalMinutes } from '../sim/actions';
import type { GameSession } from '../sim/session';
import { rupiah } from './format';

// Pop-up menu listing the actions an object advertises. Opens near the tap position.

export function blockKey(block: Exclude<ActionBlock, null>): 'block.fasting' | 'block.money' | 'block.noFood' {
  return block === 'fasting' ? 'block.fasting' : block === 'noFood' ? 'block.noFood' : 'block.money';
}

export class ActionMenu {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement, private readonly session: GameSession, private readonly onChoose: (inst: ObjectInstance, action: ActionDef) => void) {
    this.root = document.createElement('div');
    this.root.className = 'action-menu';
    this.root.hidden = true;
    parent.append(this.root);
    // Tapping anywhere else closes the menu.
    window.addEventListener('pointerdown', (e) => {
      if (!this.root.hidden && !this.root.contains(e.target as Node)) this.close();
    }, true);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(inst: ObjectInstance, x: number, y: number): void {
    this.root.replaceChildren();
    const title = document.createElement('div');
    title.className = 'action-menu-title';
    title.textContent = tDynamic(inst.def.nameKey);
    this.root.append(title);
    for (const action of inst.def.actions) {
      const b = document.createElement('button');
      b.className = 'action-menu-item';
      const label = document.createElement('span');
      label.textContent = tDynamic(action.labelKey);
      const meta = document.createElement('small');
      const parts = [action.endWhenFull ? t('menu.untilFull') : action.ui === 'shop' ? fmt(t('menu.minutes'), { n: action.durationMinutes }) : fmt(t('menu.minutes'), { n: totalMinutes(action) })];
      if (action.cost) parts.push(rupiah(action.cost));
      if (action.consumes) parts.push(tDynamic(`cat.${action.consumes.category}`));
      const block = this.session.actionBlock(action);
      if (block) parts.push(t(blockKey(block)));
      meta.textContent = parts.join(' · ');
      b.append(label, meta);
      b.disabled = block !== null;
      b.addEventListener('click', () => {
        this.close();
        this.onChoose(inst, action);
      });
      this.root.append(b);
    }
    this.root.hidden = false;
    // Keep the menu on screen.
    const w = this.root.offsetWidth;
    const h = this.root.offsetHeight;
    const left = Math.min(Math.max(8, x - w / 2), window.innerWidth - w - 8);
    const top = Math.min(Math.max(8, y - h - 16), window.innerHeight - h - 8);
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
  }

  close(): void {
    this.root.hidden = true;
  }
}
