import { fmt, t, tDynamic } from '../data/strings';
import type { ItemDef } from '../sim/inventory';
import type { GameSession } from '../sim/session';
import { rupiah } from './format';

// Minimarket shopping list: choose quantities, see the total, pay and go.

const CATEGORIES = ['bahan', 'siapMakan', 'camilan', 'minuman'];

export class ShopDialog {
  private readonly root: HTMLElement;
  private basket: Record<string, number> = {};
  private onConfirm: ((list: Record<string, number>) => void) | null = null;

  constructor(parent: HTMLElement, private readonly session: GameSession, private readonly items: readonly ItemDef[]) {
    this.root = document.createElement('div');
    this.root.className = 'dialog-backdrop';
    this.root.hidden = true;
    parent.append(this.root);
  }

  open(onConfirm: (list: Record<string, number>) => void): void {
    this.basket = {};
    this.onConfirm = onConfirm;
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    this.root.hidden = true;
    this.onConfirm = null;
  }

  private total(): number {
    return this.session.inventory.priceOf(this.basket);
  }

  private render(): void {
    const box = document.createElement('div');
    box.className = 'dialog shop';
    const head = document.createElement('div');
    head.className = 'dialog-title';
    head.textContent = `🛒 ${t('shop.title')}`;
    box.append(head);

    const list = document.createElement('div');
    list.className = 'shop-list';
    for (const cat of CATEGORIES) {
      const h = document.createElement('div');
      h.className = 'shop-cat';
      h.textContent = tDynamic(`cat.${cat}`);
      list.append(h);
      for (const item of this.items.filter((i) => i.category === cat)) {
        const row = document.createElement('div');
        row.className = 'shop-row';
        const swatch = document.createElement('span');
        swatch.className = 'shop-swatch';
        swatch.style.background = item.color;
        const name = document.createElement('div');
        name.className = 'shop-name';
        name.innerHTML = '';
        const title = document.createElement('span');
        title.textContent = tDynamic(item.nameKey);
        const sub = document.createElement('small');
        sub.textContent = `${rupiah(item.price)} · ${fmt(t('shop.stock'), { n: this.session.inventory.count(item.id) })}`;
        name.append(title, sub);
        const minus = document.createElement('button');
        minus.textContent = '−';
        const qty = document.createElement('span');
        qty.className = 'shop-qty';
        qty.textContent = String(this.basket[item.id] ?? 0);
        const plus = document.createElement('button');
        plus.textContent = '+';
        minus.addEventListener('click', () => this.change(item.id, -1));
        plus.addEventListener('click', () => this.change(item.id, 1));
        row.append(swatch, name, minus, qty, plus);
        list.append(row);
      }
    }
    box.append(list);

    const foot = document.createElement('div');
    foot.className = 'shop-foot';
    const total = this.total();
    const totalEl = document.createElement('div');
    totalEl.className = 'shop-total';
    totalEl.textContent = `${t('shop.total')}: ${rupiah(total)}`;
    if (total > this.session.wallet.balance) totalEl.classList.add('negative');
    const cancel = document.createElement('button');
    cancel.className = 'btn-secondary';
    cancel.textContent = t('shop.cancel');
    cancel.addEventListener('click', () => this.close());
    const pay = document.createElement('button');
    pay.className = 'btn-primary';
    pay.textContent = t('shop.pay');
    pay.disabled = total === 0 || total > this.session.wallet.balance;
    pay.addEventListener('click', () => {
      const confirm = this.onConfirm;
      const basket = { ...this.basket };
      this.close();
      confirm?.(basket);
    });
    foot.append(totalEl, cancel, pay);
    box.append(foot);

    const scroll = this.root.querySelector('.shop-list')?.scrollTop ?? 0;
    this.root.replaceChildren(box);
    list.scrollTop = scroll;
  }

  private change(id: string, delta: number): void {
    const n = Math.max(0, Math.min(20, (this.basket[id] ?? 0) + delta));
    if (n === 0) delete this.basket[id];
    else this.basket[id] = n;
    this.render();
  }
}
