import { AmbientLight, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, CircleGeometry, Timer, ACESFilmicToneMapping } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { fmt, t, tDynamic } from '../data/strings';
import { HAIRSTYLES, HUMAN_SKIN_TONES, HumanModel } from '../characters/humanModel';
import { lookFor } from '../characters/look';
import { createRenderer } from '../engine/renderer';
import { createCharacter, isPerantau, validateSetup, type CharacterSetup, type CreatedCharacter } from '../sim/characterSetup';
import { simData } from '../sim/gameData';
import cities from '../data/cities.json';
import ethnicities from '../data/ethnicities.json';
import religions from '../data/religions.json';
import traits from '../data/traits.json';
import { rupiah } from './format';

// Character creator: a rotating 3D preview and a tabbed panel of choices.

const HAIR_COLORS = ['#0f0c0a', '#1a1310', '#3a2418', '#6b4226', '#a0703c', '#7a7a7a'];
const CLOTH_COLORS = ['#f2c14e', '#e8747c', '#4f9a8a', '#3f6fa8', '#ffffff', '#2d2d33', '#c86b3c', '#9cc5e8', '#5d6b4c', '#8e6cc0'];
const PANTS_COLORS = ['#2f3a52', '#2d2d33', '#5d6b4c', '#efe8dc', '#7a5638', '#4a3d6b'];
const HIJAB_COLORS = ['#c46b7a', '#3f6fa8', '#2d2d33', '#efe8dc', '#4f9a8a', '#8a5a3a'];

function defaultSetup(): CharacterSetup {
  return {
    name: '',
    gender: 'male',
    startAge: 22,
    religionId: 'islam',
    fatherEthnicityId: 'jawa',
    motherEthnicityId: 'jawa',
    cityId: 'jkt',
    traits: [],
    fastingEnabled: true,
    muscle: 0.1,
    fat: 0.3,
    appearance: {
      skinTone: HUMAN_SKIN_TONES[2],
      hair: 'Hair_SimpleParted',
      hairColor: '#1a1310',
      beard: false,
      hijab: false,
      hijabColor: HIJAB_COLORS[0],
      shirtColor: '#f2c14e',
      longSleeve: false,
      pantsColor: '#2f3a52',
      shorts: false,
      shoesColor: '#f2f2f2',
    },
  };
}

type Tab = 'diri' | 'tampilan' | 'baju' | 'asal' | 'sifat';
const TABS: Tab[] = ['diri', 'tampilan', 'baju', 'asal', 'sifat'];

export function showCreator(onDone: (created: CreatedCharacter) => void): void {
  const setup = defaultSetup();
  let tab: Tab = 'diri';

  const root = document.createElement('div');
  root.className = 'creator';
  const canvas = document.createElement('canvas');
  canvas.className = 'creator-preview';
  const panel = document.createElement('div');
  panel.className = 'creator-panel';
  root.append(canvas, panel);
  document.body.append(root);

  // --- 3D preview ------------------------------------------------------------------------
  const renderer = createRenderer(canvas);
  renderer.toneMapping = ACESFilmicToneMapping;
  const scene = new Scene();
  scene.background = new Color('#e9e2d6');
  scene.add(new HemisphereLight('#fff6e8', '#8a6a4a', 1.2), new AmbientLight('#ffffff', 0.2));
  const key = new DirectionalLight('#fff1dc', 2.4);
  key.position.set(2, 4, 3);
  scene.add(key);
  const floor = new Mesh(new CircleGeometry(1.2, 48), new MeshStandardMaterial({ color: '#d9c9ae', roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const camera = new PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 1.25, 4.2);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.95, 0);
  controls.enablePan = false;
  controls.minDistance = 1.4;
  controls.maxDistance = 6;
  controls.update();

  let model: HumanModel | null = null;
  let loadToken = 0;
  let reloadTimer = 0;
  const reload = (): void => {
    window.clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(async () => {
      const token = ++loadToken;
      const preview = createCharacter(setup.name ? setup : { ...setup, name: 'x' }, simData.config.startOptions, ethnicities).character;
      const next = await HumanModel.load(lookFor(preview));
      if (token !== loadToken) {
        next.dispose();
        return;
      }
      if (model) {
        next.root.rotation.y = model.root.rotation.y;
        model.dispose();
      }
      scene.add(next.root);
      model = next;
    }, 250);
  };
  reload();

  const resize = (): void => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();
  const timer = new Timer();
  timer.connect(document);
  let running = true;
  renderer.setAnimationLoop((time) => {
    if (!running) return;
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.1);
    if (model) {
      model.root.rotation.y += dt * 0.35;
      model.update(dt);
    }
    controls.update();
    renderer.render(scene, camera);
  });

  // --- Panel -------------------------------------------------------------------------------
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    e.className = cls;
    if (text !== undefined) e.textContent = text;
    parent.append(e);
    return e;
  };
  const section = (parent: HTMLElement, label: string): HTMLElement => {
    el('div', 'cr-label', parent, label);
    return el('div', 'cr-row', parent);
  };
  const chips = <T extends string | number>(parent: HTMLElement, options: { value: T; label: string }[], current: T, onPick: (v: T) => void): void => {
    for (const o of options) {
      const b = el('button', `cr-chip${o.value === current ? ' on' : ''}`, parent, o.label);
      b.addEventListener('click', () => {
        onPick(o.value);
        render();
      });
    }
  };
  const swatches = (parent: HTMLElement, colors: readonly string[], current: string, onPick: (c: string) => void): void => {
    for (const c of colors) {
      const b = el('button', `cr-swatch${c === current ? ' on' : ''}`, parent);
      b.style.background = c;
      b.setAttribute('aria-label', c);
      b.addEventListener('click', () => {
        onPick(c);
        reload();
        render();
      });
    }
  };
  const toggle = (parent: HTMLElement, label: string, value: boolean, onChange: (v: boolean) => void): void => {
    const b = el('button', `cr-chip${value ? ' on' : ''}`, parent, `${value ? '✓ ' : ''}${label}`);
    b.addEventListener('click', () => {
      onChange(!value);
      reload();
      render();
    });
  };

  const render = (): void => {
    panel.replaceChildren();
    const tabs = el('div', 'cr-tabs', panel);
    for (const tb of TABS) {
      const b = el('button', `cr-tab${tb === tab ? ' on' : ''}`, tabs, t(`cr.tab.${tb}`));
      b.addEventListener('click', () => {
        tab = tb;
        render();
      });
    }
    const body = el('div', 'cr-body', panel);
    const a = setup.appearance;

    if (tab === 'diri') {
      el('div', 'cr-label', body, t('cr.name'));
      const name = el('input', 'cr-input', body);
      name.value = setup.name;
      name.maxLength = 20;
      name.placeholder = t('cr.namePlaceholder');
      name.addEventListener('input', () => {
        setup.name = name.value;
        footerCheck();
      });
      chips(section(body, t('cr.gender')), [{ value: 'male', label: t('cr.male') }, { value: 'female', label: t('cr.female') }], setup.gender, (g) => {
        setup.gender = g;
        a.hair = HAIRSTYLES[g][0];
        reload();
      });
      chips(section(body, t('cr.age')), simData.config.startOptions.map((o) => ({ value: o.age, label: `${o.age} th` })), setup.startAge, (v) => (setup.startAge = v));
      const opt = simData.config.startOptions.find((o) => o.age === setup.startAge)!;
      el('div', 'cr-note', body, fmt(t('cr.ageInfo'), { edu: opt.education, money: rupiah(opt.savings), years: opt.experienceYears }) + (opt.motorbike ? ` · ${t('cr.motorbike')}` : ''));
    }

    if (tab === 'tampilan') {
      swatches(section(body, t('cr.skin')), HUMAN_SKIN_TONES, a.skinTone, (c) => (a.skinTone = c));
      const shape = section(body, t('cr.body'));
      for (const [k, label] of [['muscle', t('style.muscle')], ['fat', t('style.fat')]] as const) {
        const row = el('label', 'cr-slider', shape);
        el('span', '', row, label);
        const input = el('input', '', row);
        input.type = 'range';
        input.min = '0';
        input.max = '100';
        input.value = String(Math.round(setup[k] * 100));
        input.addEventListener('input', () => {
          setup[k] = Number(input.value) / 100;
          model?.setBodyShape(setup.muscle, setup.fat);
        });
      }
      chips(section(body, t('cr.hair')), HAIRSTYLES[setup.gender].map((h) => ({ value: h, label: tDynamic(`hair.${h}`) })), a.hair, (h) => {
        a.hair = h;
        reload();
      });
      swatches(section(body, t('cr.hairColor')), HAIR_COLORS, a.hairColor, (c) => (a.hairColor = c));
      const extra = section(body, setup.gender === 'male' ? t('cr.beard') : t('cr.hijab'));
      if (setup.gender === 'male') toggle(extra, t('cr.beardOn'), a.beard, (v) => (a.beard = v));
      else {
        toggle(extra, t('cr.hijabOn'), a.hijab, (v) => (a.hijab = v));
        if (a.hijab) swatches(section(body, t('cr.hijabColor')), HIJAB_COLORS, a.hijabColor ?? HIJAB_COLORS[0], (c) => (a.hijabColor = c));
      }
    }

    if (tab === 'baju') {
      swatches(section(body, t('cr.shirt')), CLOTH_COLORS, a.shirtColor, (c) => (a.shirtColor = c));
      toggle(section(body, t('cr.sleeve')), t('cr.longSleeve'), a.longSleeve, (v) => (a.longSleeve = v));
      swatches(section(body, t('cr.pants')), PANTS_COLORS, a.pantsColor, (c) => (a.pantsColor = c));
      toggle(section(body, t('cr.pantsType')), t('cr.shorts'), a.shorts, (v) => (a.shorts = v));
      swatches(section(body, t('cr.shoes')), ['#f2f2f2', '#222222', '#8a5a3a', '#3f6fa8'], a.shoesColor, (c) => (a.shoesColor = c));
    }

    if (tab === 'asal') {
      chips(section(body, t('cr.religion')), religions.map((r) => ({ value: r.id, label: r.name })), setup.religionId, (v) => (setup.religionId = v));
      if (setup.religionId === 'islam') toggle(section(body, t('cr.fasting')), t('cr.fastingOn'), setup.fastingEnabled, (v) => (setup.fastingEnabled = v));
      chips(section(body, t('cr.father')), ethnicities.map((e) => ({ value: e.id, label: e.name })), setup.fatherEthnicityId, (v) => (setup.fatherEthnicityId = v));
      chips(section(body, t('cr.mother')), ethnicities.map((e) => ({ value: e.id, label: e.name })), setup.motherEthnicityId, (v) => (setup.motherEthnicityId = v));
      chips(section(body, t('cr.city')), cities.map((c) => ({ value: c.id, label: c.name })), setup.cityId, (v) => (setup.cityId = v));
      const city = cities.find((c) => c.id === setup.cityId)!;
      el('div', 'cr-note', body, fmt(t('cr.cityInfo'), { umr: rupiah(city.minimumWage2026), kos: rupiah(city.boardingRoomRentMonthly), food: city.signatureFood }) + (city.minimumWageIsEstimate ? ` (${t('cr.estimate')})` : ''));
      const perantau = isPerantau(setup.cityId, setup.fatherEthnicityId, setup.motherEthnicityId, ethnicities);
      el('div', `cr-badge${perantau ? ' on' : ''}`, body, perantau ? t('cr.perantau') : t('cr.local'));
    }

    if (tab === 'sifat') {
      el('div', 'cr-note', body, t('cr.traitsHint'));
      const list = el('div', 'cr-traits', body);
      for (const tr of traits) {
        const on = setup.traits.includes(tr.id);
        const b = el('button', `cr-trait${on ? ' on' : ''}`, list);
        el('strong', '', b, tr.name);
        el('small', '', b, tr.effect);
        b.addEventListener('click', () => {
          if (on) setup.traits = setup.traits.filter((x) => x !== tr.id);
          else if (setup.traits.length < 2) setup.traits = [...setup.traits, tr.id];
          else setup.traits = [setup.traits[1], tr.id];
          render();
        });
      }
    }

    const footer = el('div', 'cr-footer', panel);
    const status = el('div', 'cr-status', footer);
    const go = el('button', 'btn-primary', footer, t('cr.start'));
    go.addEventListener('click', () => {
      if (validateSetup(setup).length) return;
      running = false;
      renderer.setAnimationLoop(null);
      model?.dispose();
      renderer.dispose();
      root.remove();
      onDone(createCharacter(setup, simData.config.startOptions, ethnicities));
    });
    footerCheck = (): void => {
      const problems = validateSetup(setup);
      go.disabled = problems.length > 0;
      status.textContent = problems.includes('name') ? t('cr.needName') : problems.includes('traits') ? t('cr.needTraits') : '';
    };
    footerCheck();
  };
  let footerCheck = (): void => {};
  render();
}
