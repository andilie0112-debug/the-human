import { Mesh, MeshStandardMaterial, type Group, type Material } from 'three';
import { fmt, t, tDynamic } from '../data/strings';
import { OBJECTS, type ObjectDef } from '../data/objectCatalog';
import { buildObjectModel } from '../home/objectModels';
import type { KosRoom } from '../home/kosRoom';
import { paylaterInstalment } from '../sim/home';
import type { GameSession } from '../sim/session';
import { rupiah } from './format';

// Build/buy mode: time stops; buy, move, rotate, store or sell furniture on a 25 cm grid.

const GRID = 0.25;
const snap = (v: number): number => Math.round(v / GRID) * GRID;

type Placing =
  | { kind: 'buy'; def: ObjectDef; paylater: boolean }
  | { kind: 'storage'; def: ObjectDef; index: number }
  | { kind: 'move'; def: ObjectDef; placementId: string };

export class BuildMode {
  active = false;
  private readonly panel: HTMLElement;
  private readonly bar: HTMLElement;
  private tab: 'beli' | 'gudang' = 'beli';
  private selected: string | null = null;
  private placing: Placing | null = null;
  private ghost: Group | null = null;
  private ghostAt = { x: 0, z: 0, rot: 0 };
  private ghostValid = false;
  private savedSpeed: 0 | 1 | 2 | 3 = 1;
  private readonly button: HTMLButtonElement;

  constructor(
    private readonly session: GameSession,
    private readonly room: KosRoom,
    private readonly onEnter: () => void,
    private readonly toast: (text: string) => void,
  ) {
    this.button = document.createElement('button');
    this.button.className = 'build-btn';
    this.button.textContent = '🔨';
    this.button.setAttribute('aria-label', t('build.title'));
    this.button.addEventListener('click', () => (this.active ? this.exit() : this.enter()));
    document.body.append(this.button);
    this.panel = document.createElement('div');
    this.panel.className = 'build-panel';
    this.panel.hidden = true;
    document.body.append(this.panel);
    this.bar = document.createElement('div');
    this.bar.className = 'build-bar';
    this.bar.hidden = true;
    document.body.append(this.bar);
  }

  enter(tab: 'beli' | 'gudang' = 'beli'): void {
    if (this.active) return;
    this.active = true;
    this.tab = tab;
    this.savedSpeed = this.session.clock.speed;
    this.session.clock.speed = 0;
    this.onEnter();
    document.body.classList.add('building');
    this.render();
  }

  exit(): void {
    this.cancelPlacing();
    this.select(null);
    this.active = false;
    this.session.clock.speed = this.savedSpeed === 0 ? 1 : this.savedSpeed;
    document.body.classList.remove('building');
    this.panel.hidden = true;
    this.bar.hidden = true;
  }

  /** A tap in the 3D view while building: `instanceId` when an object was hit, `point` on the floor. */
  handleTap(instanceId: string | undefined, point: { x: number; z: number } | null): void {
    if (this.placing) {
      if (point) this.moveGhost(point.x, point.z);
      return;
    }
    this.select(instanceId ?? null);
  }

  private refreshRoom(): void {
    this.room.setPlacements(this.session.home.placements);
  }

  private highlight(id: string | null, on: boolean): void {
    const inst = id ? this.room.instances.get(id) : undefined;
    inst?.group.traverse((o) => {
      if (o instanceof Mesh && o.material instanceof MeshStandardMaterial) o.material.emissive.set(on ? '#3a3010' : '#000000');
    });
  }

  private select(id: string | null): void {
    this.highlight(this.selected, false);
    this.selected = id;
    this.highlight(id, true);
    this.renderBar();
  }

  private startPlacing(p: Placing, at?: { x: number; z: number; rot: number }): void {
    this.cancelPlacing();
    this.select(null);
    this.placing = p;
    this.ghost = buildObjectModel(p.def.model);
    this.ghost.traverse((o) => {
      if (o instanceof Mesh) {
        const m = (o.material as Material).clone() as MeshStandardMaterial;
        m.transparent = true;
        m.opacity = 0.55;
        m.depthWrite = false;
        o.material = m;
        o.castShadow = false;
      }
    });
    this.room.scene.add(this.ghost);
    this.ghostAt = at ?? { x: 0, z: 0.5, rot: 0 };
    this.moveGhost(this.ghostAt.x, this.ghostAt.z);
    this.panel.hidden = true;
  }

  private moveGhost(x: number, z: number): void {
    if (!this.ghost || !this.placing) return;
    this.ghostAt = { ...this.ghostAt, x: snap(x), z: snap(z) };
    this.ghost.position.set(this.ghostAt.x, 0, this.ghostAt.z);
    this.ghost.rotation.y = (this.ghostAt.rot * Math.PI) / 180;
    const id = this.placing.kind === 'move' ? this.placing.placementId : '__ghost__';
    const problem = this.session.placementProblem({ id, objectId: this.placing.def.id, ...this.ghostAt });
    this.ghostValid = problem === null;
    this.ghost.traverse((o) => {
      if (o instanceof Mesh) (o.material as MeshStandardMaterial).emissive.set(this.ghostValid ? '#1f6b2f' : '#8a1f1f');
    });
    this.renderBar(problem);
  }

  private cancelPlacing(): void {
    if (this.ghost) {
      this.room.scene.remove(this.ghost);
      this.ghost.traverse((o) => {
        if (o instanceof Mesh) (o.material as Material).dispose();
      });
    }
    this.ghost = null;
    this.placing = null;
  }

  private confirmPlacing(): void {
    const p = this.placing;
    if (!p) return;
    const at = this.ghostAt;
    let result: string | null;
    if (p.kind === 'buy') result = this.session.buy(p.def.id, at, p.paylater);
    else if (p.kind === 'storage') result = this.session.placeFromStorage(p.index, at);
    else result = this.session.movePlacement(p.placementId, at);
    if (result) {
      this.toast(tDynamic(`build.problem.${result}`));
      return;
    }
    this.cancelPlacing();
    this.refreshRoom();
    this.render();
  }

  private btn(parent: HTMLElement, label: string, onClick: () => void, cls = 'btn-secondary', disabled = false): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = cls;
    b.textContent = label;
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    parent.append(b);
    return b;
  }

  /** Context bar: placing controls, or tools for the selected object. */
  private renderBar(problem: string | null = null): void {
    this.bar.replaceChildren();
    this.bar.hidden = !this.active || (!this.placing && !this.selected);
    if (this.bar.hidden) return;
    if (this.placing) {
      const label = document.createElement('span');
      label.className = 'build-label';
      label.textContent = this.ghostValid ? t('build.tapFloor') : tDynamic(`build.problem.${problem ?? 'overlap'}`);
      this.bar.append(label);
      this.btn(this.bar, `⟳ ${t('build.rotate')}`, () => {
        this.ghostAt.rot = (this.ghostAt.rot + 90) % 360;
        this.moveGhost(this.ghostAt.x, this.ghostAt.z);
      });
      this.btn(this.bar, `✓ ${t('build.place')}`, () => this.confirmPlacing(), 'btn-primary', !this.ghostValid);
      this.btn(this.bar, t('shop.cancel'), () => {
        this.cancelPlacing();
        this.render();
      });
      return;
    }
    const pl = this.session.home.placements.find((p) => p.id === this.selected);
    const def = pl ? OBJECTS.find((o) => o.id === this.session.objectData(pl.objectId)?.id) : undefined;
    if (!pl || !def) return;
    const label = document.createElement('span');
    label.className = 'build-label';
    label.textContent = tDynamic(def.nameKey);
    this.bar.append(label);
    if (def.fixture) {
      const note = document.createElement('span');
      note.className = 'build-label';
      note.textContent = t('build.fixture');
      this.bar.append(note);
      return;
    }
    this.btn(this.bar, `⟳ ${t('build.rotate')}`, () => {
      const r = this.session.movePlacement(pl.id, { x: pl.x, z: pl.z, rot: (pl.rot + 90) % 360 });
      if (r) this.toast(t(`build.problem.${r}`));
      else this.refreshRoom();
      this.select(pl.id);
    });
    this.btn(this.bar, `✥ ${t('build.move')}`, () => this.startPlacing({ kind: 'move', def, placementId: pl.id }, { x: pl.x, z: pl.z, rot: pl.rot }));
    this.btn(this.bar, `📦 ${t('build.store')}`, () => {
      this.session.store(pl.id);
      this.selected = null;
      this.refreshRoom();
      this.render();
    });
    const value = Math.round(((def.price ?? 0) * 0.5) / 1000) * 1000;
    this.btn(this.bar, `💰 ${fmt(t('build.sell'), { price: rupiah(value) })}`, () => {
      this.session.sell(pl.id);
      this.selected = null;
      this.refreshRoom();
      this.render();
    });
  }

  private render(): void {
    this.panel.hidden = !this.active || this.placing !== null;
    this.renderBar();
    if (this.panel.hidden) return;
    this.panel.replaceChildren();
    const head = document.createElement('div');
    head.className = 'build-head';
    const title = document.createElement('strong');
    title.textContent = `🔨 ${t('build.title')}`;
    head.append(title);
    if (this.session.character.ethnicities.includes('chindo')) {
      const fs = this.session.fengShui();
      const badge = document.createElement('span');
      badge.className = 'fs-badge';
      badge.textContent = fmt(t('fs.score'), { n: fs.score });
      badge.title = fs.rules.map((r) => `${r.ok ? '✓' : '✗'} ${tDynamic(r.key)}`).join('\n');
      badge.addEventListener('click', () => this.toast(fs.rules.map((r) => `${r.ok ? '✓' : '✗'} ${tDynamic(r.key)}`).join(' · ')));
      head.append(badge);
    }
    this.btn(head, t('build.done'), () => this.exit(), 'btn-primary');
    this.panel.append(head);

    const tabs = document.createElement('div');
    tabs.className = 'phone-tabs';
    for (const tb of ['beli', 'gudang'] as const) {
      const b = this.btn(tabs, `${t(`build.tab.${tb}`)}${tb === 'gudang' && this.session.home.storage.length ? ` (${this.session.home.storage.length})` : ''}`, () => {
        this.tab = tb;
        this.render();
      }, `phone-tab${tb === this.tab ? ' on' : ''}`);
      void b;
    }
    this.panel.append(tabs);

    const list = document.createElement('div');
    list.className = 'build-list';
    if (this.tab === 'beli') {
      const buyable = OBJECTS.filter((o) => !o.fixture && (o.price ?? 0) > 0 && (!o.religion || o.religion === this.session.character.religionId));
      for (const def of buyable) {
        const card = document.createElement('div');
        card.className = 'build-card';
        const name = document.createElement('div');
        name.className = 'phone-card-title';
        name.textContent = tDynamic(def.nameKey);
        const price = document.createElement('div');
        price.className = 'phone-small';
        const inst = paylaterInstalment(def.price ?? 0, this.session.cfgFinance);
        price.textContent = `${rupiah(def.price ?? 0)} · ${fmt(t('build.paylaterInfo'), { amount: rupiah(inst), months: this.session.cfgFinance.paylaterMonths })}`;
        card.append(name, price);
        const row = document.createElement('div');
        row.className = 'phone-row';
        this.btn(row, t('build.cash'), () => this.startPlacing({ kind: 'buy', def, paylater: false }), 'btn-primary', this.session.wallet.balance < (def.price ?? 0));
        this.btn(row, t('build.paylater'), () => this.startPlacing({ kind: 'buy', def, paylater: true }));
        card.append(row);
        list.append(card);
      }
    } else {
      if (this.session.home.storage.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'phone-empty';
        empty.textContent = t('build.emptyStorage');
        list.append(empty);
      }
      this.session.home.storage.forEach((objectId, index) => {
        const def = OBJECTS.find((o) => o.id === objectId);
        if (!def) return;
        const card = document.createElement('div');
        card.className = 'build-card';
        const name = document.createElement('div');
        name.className = 'phone-card-title';
        name.textContent = tDynamic(def.nameKey);
        card.append(name);
        this.btn(card, t('build.placeIt'), () => this.startPlacing({ kind: 'storage', def, index }), 'btn-primary');
        list.append(card);
      });
    }
    this.panel.append(list);
  }
}
