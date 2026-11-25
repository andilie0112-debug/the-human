import { fmt, t, tDynamic } from '../data/strings';
import type { GameSession } from '../sim/session';
import type { ItemDef } from '../sim/inventory';
import type { Interior, Zone } from '../world/interior';
import { SHELVES, buildMinimarket, type StoreSpace } from '../world/spaces/minimarket';
import { rupiah } from './format';

// Shopping inside a minimarket: take items from the shelves into a basket, queue at the
// cashier and pay with cash, QRIS or a debit card. Walking out with unpaid items sets off the
// security gate: it may be noticed (wanted by the police) or not (the items are yours, stolen).

export interface StoreHooks {
  toast: (text: string) => void;
  sound: (id: 'alarm' | 'pay' | 'click') => void;
  speak: (text: string, gender: 'male' | 'female') => void;
  /** Called after leaving the store (the caller goes back outside). */
  onLeave: () => void;
}

export class StoreVisit {
  private basket: Record<string, number> = {};
  private space: StoreSpace | null = null;
  private factor = 1;
  private readonly basketEl: HTMLElement;
  private dialog: HTMLElement | null = null;
  private cashierGender: 'male' | 'female' = 'female';

  constructor(
    private readonly session: GameSession,
    private readonly items: readonly ItemDef[],
    private readonly interior: Interior,
    private readonly hooks: StoreHooks,
  ) {
    this.basketEl = document.createElement('div');
    this.basketEl.className = 'basket-hud';
    this.basketEl.hidden = true;
    document.body.append(this.basketEl);
  }

  get active(): boolean {
    return this.space !== null;
  }

  start(brand: string, brandColor: string, priceFactor: number): void {
    this.factor = priceFactor;
    this.basket = {};
    const colors: Record<string, string[]> = {};
    for (const it of this.items) (colors[it.category] ??= []).push(it.color);
    // Some extra packaging colours so shelves look full and varied.
    for (const c of Object.values(colors)) c.push('#e74c3c', '#f39c12', '#2980b9', '#27ae60', '#ecf0f1');
    this.space = buildMinimarket(brandColor, colors);
    this.space.onCashier = (m) => {
      this.cashierGender = m.root.userData.body === 'male' ? 'male' : 'female';
      this.say(fmt(t('store.welcome'), { brand }));
    };
    this.interior.enter(this.space);
    this.renderBasket();
  }

  private say(text: string): void {
    this.hooks.toast(`🗣️ ${t('store.cashier')}: "${text}"`);
    this.hooks.speak(text, this.cashierGender);
  }

  private count(): number {
    return Object.values(this.basket).reduce((a, b) => a + b, 0);
  }

  private total(): number {
    return Math.round((this.session.inventory.priceOf(this.basket) * this.factor) / 100) * 100;
  }

  private renderBasket(): void {
    const n = this.count();
    this.basketEl.hidden = !this.space;
    this.basketEl.textContent = n > 0 ? fmt(t('store.basket'), { n, total: rupiah(this.total()) }) : t('store.basketEmpty');
  }

  onZone(zone: Zone): void {
    if (zone.id === 'exit') return this.leave();
    if (zone.id === 'kasir') return this.checkout();
    const shelf = SHELVES.find((s) => s.id === zone.id);
    if (shelf) this.openShelf(shelf.label, shelf.category);
  }

  private openDialog(title: string): HTMLElement {
    this.closeDialog();
    this.interior.paused = true;
    const back = document.createElement('div');
    back.className = 'dialog-backdrop';
    const box = document.createElement('div');
    box.className = 'dialog store-dialog';
    const h = document.createElement('div');
    h.className = 'dialog-title';
    h.textContent = title;
    box.append(h);
    back.append(box);
    document.body.append(back);
    this.dialog = back;
    return box;
  }

  private closeDialog(): void {
    this.dialog?.remove();
    this.dialog = null;
    this.interior.paused = false;
  }

  private button(parent: HTMLElement, label: string, onClick: () => void, cls = 'btn-secondary'): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', onClick);
    parent.append(b);
    return b;
  }

  private openShelf(label: string, category: string): void {
    const box = this.openDialog(label);
    const list = document.createElement('div');
    list.className = 'store-list';
    box.append(list);
    const render = (): void => {
      list.replaceChildren();
      for (const it of this.items.filter((i) => i.category === category)) {
        const row = document.createElement('div');
        row.className = 'store-row';
        const name = document.createElement('span');
        name.textContent = `${tDynamic(it.nameKey)} · ${rupiah(Math.round((it.price * this.factor) / 100) * 100)}`;
        const n = this.basket[it.id] ?? 0;
        const qty = document.createElement('strong');
        qty.textContent = String(n);
        row.append(name);
        this.button(row, '−', () => {
          if (n > 0) this.basket[it.id] = n - 1;
          this.hooks.sound('click');
          render();
          this.renderBasket();
        });
        row.append(qty);
        this.button(row, '+', () => {
          this.basket[it.id] = n + 1;
          this.hooks.sound('click');
          render();
          this.renderBasket();
        });
        list.append(row);
      }
    };
    render();
    this.button(box, t('store.done'), () => this.closeDialog(), 'btn-primary');
  }

  private checkout(): void {
    if (this.count() === 0) {
      this.say(t('store.nothing'));
      return;
    }
    const total = this.total();
    const box = this.openDialog(`💳 ${t('store.checkout')}`);
    this.say(fmt(t('store.totalLine'), { total: rupiah(total) }));
    const p = document.createElement('p');
    p.textContent = fmt(t('store.total'), { n: this.count(), total: rupiah(total) });
    box.append(p);
    const row = document.createElement('div');
    row.className = 'store-pay';
    box.append(row);
    for (const method of ['tunai', 'qris', 'debit'] as const) {
      this.button(row, tDynamic(`store.pay.${method}`), () => {
        if (!this.session.buyNow(this.basket, this.factor)) {
          this.hooks.toast(t('block.money'));
          return;
        }
        this.hooks.sound('pay');
        this.basket = {};
        this.renderBasket();
        this.closeDialog();
        this.hooks.toast(fmt(t('store.receipt'), { total: rupiah(total), method: tDynamic(`store.pay.${method}`) }));
        this.say(t('store.thanks'));
      }, 'btn-primary').disabled = this.session.wallet.balance < total;
    }
    this.button(box, t('store.back'), () => this.closeDialog());
  }

  private leave(): void {
    if (this.count() > 0) {
      // Unpaid items through the security gate.
      this.hooks.sound('alarm');
      const seen = this.session.commitCrime('mencuri', this.space?.cashier ? 1.4 : 1);
      if (seen) this.hooks.toast(t('crime.seen.mencuri'));
      else {
        for (const [id, n] of Object.entries(this.basket)) if (n > 0) this.session.inventory.add(id, n);
        this.hooks.toast(t('crime.free.mencuri'));
      }
    }
    this.closeDialog();
    this.basket = {};
    this.space = null;
    this.basketEl.hidden = true;
    this.interior.exit();
    this.hooks.onLeave();
  }
}
