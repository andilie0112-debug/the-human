import { fmt, t, tDynamic } from '../data/strings';
import type { ObjectInstance } from '../home/kosRoom';
import type { ActionBlock, ActionDef } from '../sim/actions';
import { totalMinutes } from '../sim/actions';
import type { GameSession } from '../sim/session';
import { rupiah } from './format';

// Pop-up menu listing the actions an object advertises. Opens near the tap position.

export function blockKey(block: Exclude<ActionBlock, null>): 'block.fasting' | 'block.money' | 'block.noFood' | 'block.motorbike' | 'block.religion' | 'block.record' | 'block.business' | 'block.noChore' | 'block.skill' {
  return `block.${block}`;
}

export class ActionMenu {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement, private readonly session: GameSession, private readonly onChoose: (inst: ObjectInstance, action: ActionDef, religion?: string) => void) {
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

  open(inst: ObjectInstance, x: number, y: number, extra: ActionDef[] = [], religion?: string): void {
    this.render(inst, [...extra, ...inst.def.actions], religion);
    this.root.hidden = false;
    // Keep the menu on screen.
    const w = this.root.offsetWidth;
    const h = this.root.offsetHeight;
    const left = Math.min(Math.max(8, x - w / 2), window.innerWidth - w - 8);
    const top = Math.min(Math.max(8, y - h - 16), window.innerHeight - h - 8);
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
  }

  /**
   * Lists the actions. Recipes (cooking with exact ingredients) are many, so they sit behind one
   * "cook with a recipe" entry that opens their own list (with a way back).
   */
  private render(inst: ObjectInstance, actions: ActionDef[], religion: string | undefined, recipesOnly = false): void {
    this.root.replaceChildren();
    const title = document.createElement('div');
    title.className = 'action-menu-title';
    title.textContent = tDynamic(inst.def.nameKey);
    this.root.append(title);
    const shown = actions.filter((action) => {
      // Side-business work and delivered food only show up when they apply.
      const hidden = this.session.actionBlock(action, religion);
      if (hidden === 'business' || hidden === 'noChore') return false;
      return !(action.consumes?.category === 'pesanan' && this.session.inventory.countCategory('pesanan') === 0);
    });
    const recipes = shown.filter((a) => a.consumes?.items);
    if (recipesOnly) {
      const back = this.entry(t('menu.back'), '');
      back.classList.add('action-menu-back');
      back.addEventListener('click', () => this.render(inst, actions, religion));
      this.root.append(back);
      for (const action of recipes) this.root.append(this.item(inst, action, religion));
      return;
    }
    let grouped = false;
    for (const action of shown) {
      if (action.consumes?.items && recipes.length > 1) {
        if (grouped) continue;
        grouped = true;
        const ok = recipes.filter((a) => this.session.actionBlock(a, religion) === null).length;
        const b = this.entry(t('menu.recipes'), fmt(t('menu.recipesMeta'), { n: recipes.length, ok }));
        b.addEventListener('click', () => {
          this.render(inst, actions, religion, true);
          this.keepOnScreen();
        });
        this.root.append(b);
        continue;
      }
      this.root.append(this.item(inst, action, religion));
    }
  }

  private entry(label: string, meta: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'action-menu-item';
    const l = document.createElement('span');
    l.textContent = label;
    b.append(l);
    if (meta) {
      const m = document.createElement('small');
      m.textContent = meta;
      b.append(m);
    }
    return b;
  }

  private item(inst: ObjectInstance, action: ActionDef, religion: string | undefined): HTMLButtonElement {
    const parts = [action.endWhenFull ? t('menu.untilFull') : action.ui === 'shop' ? fmt(t('menu.minutes'), { n: action.durationMinutes }) : fmt(t('menu.minutes'), { n: totalMinutes(action) })];
    const cost = this.session.costOf(action);
    if (cost) parts.push(rupiah(cost));
    else if (action.bpjsCovered && action.cost) parts.push(t('toast.bpjs'));
    if (action.consumes?.items) {
      // A recipe: its ingredients (the missing ones marked).
      const inv = this.session.inventory;
      const list = Object.entries(action.consumes.items).map(([id, n]) => `${inv.count(id) >= n ? '' : '✗ '}${n > 1 ? `${n} ` : ''}${tDynamic(this.session.itemName(id))}`);
      parts.push(fmt(t('menu.needs'), { list: list.join(', ') }));
    } else if (action.consumes?.category) parts.push(tDynamic(`cat.${action.consumes.category}`));
    const block = this.session.actionBlock(action, religion);
    if (block === 'skill') parts.push(fmt(t('block.skill'), { n: Math.max(...Object.values(action.minSkill ?? {}).map((v) => v ?? 0)) }));
    else if (block) parts.push(t(blockKey(block)));
    const b = this.entry(tDynamic(action.labelKey), parts.join(' · '));
    b.disabled = block !== null;
    b.addEventListener('click', () => {
      this.close();
      this.onChoose(inst, action, religion);
    });
    return b;
  }

  /** After the list changed size: pull it back inside the screen. */
  private keepOnScreen(): void {
    const r = this.root.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 8) this.root.style.top = `${Math.max(8, window.innerHeight - r.height - 8)}px`;
    if (r.right > window.innerWidth - 8) this.root.style.left = `${Math.max(8, window.innerWidth - r.width - 8)}px`;
  }

  close(): void {
    this.root.hidden = true;
  }
}
