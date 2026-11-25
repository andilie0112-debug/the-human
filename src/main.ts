import { Raycaster, Vector2, type Mesh } from 'three';
import { validateGameData } from './data';
import { t } from './data/strings';
import { KOS_LAYOUT } from './data/objectCatalog';
import { HUMAN_SKIN_TONES, HumanModel } from './characters/humanModel';
import { createKosRoom } from './home/kosRoom';
import { createRoomView } from './home/roomView';
import { onTap } from './engine/tapInput';
import { CharacterController } from './interaction/characterController';
import { GameSession, defaultCharacter } from './sim/session';
import { simData } from './sim/gameData';
import { toParts } from './sim/time';
import { Hud } from './ui/hud';
import { ActionMenu } from './ui/actionMenu';
import { QueueBar } from './ui/queueBar';
import { ShopDialog } from './ui/shopDialog';
import { NEED_ICONS, ThoughtBubble } from './ui/thoughtBubble';
import { AutonomyDriver } from './interaction/autonomyDriver';
import { NEED_KEYS } from './sim/needs';
import { blockKey } from './ui/actionMenu';
import { AudioEngine, type LoopId } from './engine/audio';
import type { ActionStep } from './sim/actions';
import type { ObjectInstance } from './home/kosRoom';

const issues = validateGameData();
if (issues.length > 0) console.warn('Data validation issues:', issues);

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const hudRoot = document.querySelector<HTMLDivElement>('#hud');
const controlsEl = document.querySelector<HTMLDivElement>('#controls');
if (!canvas || !hudRoot || !controlsEl) throw new Error('Missing page elements');

// Until the character creator (M5): ?agama=hindu etc. picks the religion for testing.
const character = defaultCharacter();
const agama = new URLSearchParams(location.search).get('agama');
if (agama && simData.religions.some((r) => r.id === agama)) character.religionId = agama;

// The persistent simulation; scenes and UI read from it and send commands.
const session = new GameSession(simData, character);
const hud = new Hud(hudRoot, session);

const styleLink = document.createElement('a');
styleLink.href = './style.html';
styleLink.textContent = t('m0.styleLink');
const hint = document.createElement('div');
hint.className = 'tap-hint';
hint.textContent = t('hint.tap');
controlsEl.append(styleLink);
document.body.append(hint);

const room = createKosRoom(KOS_LAYOUT, character.religionId);
const audio = new AudioEngine();
room.onDoor = (opening) => audio.play(opening ? 'doorOpen' : 'doorClose');

// Mute toggle (remembered on this device).
const muteBtn = document.createElement('button');
muteBtn.className = 'mute-btn';
const renderMute = (): void => {
  muteBtn.textContent = audio.muted ? '🔇' : '🔊';
};
renderMute();
muteBtn.addEventListener('click', () => {
  audio.setMuted(!audio.muted);
  renderMute();
});
document.body.append(muteBtn);

// Autonomy level: Penuh (full), Rendah (only urgent needs), Mati (off).
const autoBtn = document.createElement('button');
autoBtn.className = 'auto-btn';
const AUTO_LEVELS = ['full', 'low', 'off'] as const;
const renderAuto = (): void => {
  autoBtn.textContent = t(`auto.${session.character.autonomy}`);
};
renderAuto();
autoBtn.addEventListener('click', () => {
  const i = AUTO_LEVELS.indexOf(session.character.autonomy);
  session.character.autonomy = AUTO_LEVELS[(i + 1) % AUTO_LEVELS.length];
  renderAuto();
});
document.body.append(autoBtn);
const bubble = new ThoughtBubble(document.body);
let autonomy: AutonomyDriver | null = null;
let urgentTimer = 0;

/** Which sound loops an activity step makes. */
function loopsFor(step: ActionStep, inst: ObjectInstance, actionId: string): LoopId[] {
  const loops: LoopId[] = [];
  if (step.prop === 'water') loops.push('water');
  if (step.prop === 'cooking') loops.push('flame', 'sizzle');
  if (step.prop === 'chop') loops.push('chopping');
  if (step.prop === 'warm') loops.push('flame');
  if (step.prop === 'open' && inst.def.model === 'fridge') loops.push('fridgeHum');
  if (step.prop === 'screen') loops.push(inst.def.model === 'tv' ? 'tv' : actionId === 'video_call' ? 'voices' : 'typing');
  if (step.animation === 'lie') loops.push('breath');
  if (step.animation === 'exercise') loops.push('workout');
  if (step.animation === 'eat' || step.prop === 'plate') loops.push('eating');
  return loops;
}
const view = createRoomView(canvas, room, 3.6);

let controller: CharacterController | null = null;
const queueBar = new QueueBar(hudRoot, (i) => controller?.cancel(i));
const shop = new ShopDialog(document.body, session, simData.items);
const menu = new ActionMenu(document.body, session, (inst, action) => {
  if (action.ui === 'shop') {
    shop.open((list) => {
      audio.play('pay');
      controller?.enqueue(inst, action, list);
    });
  } else {
    controller?.enqueue(inst, action);
  }
});

/** Shows what is in the fridge (one model per item unit). */
function refreshFridge(): void {
  const units: { color: string; shape: string }[] = [];
  for (const [id, n] of session.inventory.list()) {
    const def = simData.items.find((i) => i.id === id);
    if (def) for (let k = 0; k < n; k++) units.push({ color: def.color, shape: def.shape });
  }
  room.setFridgeContents(units);
}
refreshFridge();

void HumanModel.load({
  body: 'male',
  skinTone: HUMAN_SKIN_TONES[2],
  hair: 'Hair_SimpleParted',
  hairColor: '#1a1310',
  shirtColor: '#f2c14e',
  pantsColor: '#2f3a52',
  shoesColor: '#f2f2f2',
  ...session.character.body,
}).then((model) => {
  model.censorCamera = view.camera;
  model.root.position.set(-0.45, 0, 1.6);
  model.root.rotation.y = Math.PI;
  room.scene.add(model.root);
  controller = new CharacterController(session, room, model, {
    notify: (block) => {
      if (block) hud.toast(t(blockKey(block)));
    },
    onQueueChange: () => {
      queueBar.render(controller?.queue ?? []);
      refreshFridge();
    },
    itemColor: (id) => simData.items.find((i) => i.id === id)?.color,
    onStepChange: (step, inst, actionId) => {
      audio.setLoops(step && inst && actionId ? loopsFor(step, inst, actionId) : []);
      if (step?.prop === 'open' && inst?.def.model === 'fridge') audio.play('fridgeOpen');
      if (step?.prop === 'flush') audio.play('flush');
      if (step?.prop === 'open' && inst && inst.def.model !== 'fridge') audio.play('doorOpen');
    },
    onFootstep: () => audio.play('footstep'),
  });
  charModel = model;
  autonomy = new AutonomyDriver(session, room, controller, (choice) => bubble.show(NEED_ICONS[choice.reason] ?? '💭'));
});
let charModel: HumanModel | null = null;

// Tap: an object opens its action menu, the floor is a walk command.
const raycaster = new Raycaster();
const ndc = new Vector2();
onTap(canvas, (x, y) => {
  if (menu.isOpen) return;
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, view.camera);
  const hits = raycaster.intersectObjects(room.pickables.filter((o) => o.visible && o.parent?.visible !== false), false);
  const hit = hits[0];
  if (!hit) return;
  const id = (hit.object as Mesh).userData.instanceId as string | undefined;
  const inst = id ? room.instances.get(id) : undefined;
  if (inst) {
    menu.open(inst, x, y);
    hint.hidden = true;
  } else if ((hit.object as Mesh).userData.floor) {
    controller?.walkTo({ x: hit.point.x, z: hit.point.z });
    hint.hidden = true;
  }
});

let night: boolean | null = null;
view.start((dt, realDt) => {
  const events = session.tick(realDt);
  if (events.length > 0) {
    hud.showEvents(events);
    if (events.some((e) => e.kind === 'salary' || e.kind === 'thr')) audio.play('pay');
    else if (events.some((e) => e.kind === 'bill' || e.kind === 'sick' || e.kind === 'burnout' || e.kind === 'shoppingDone' || (e.kind === 'newDay' && (e.holidays.length > 0 || e.ramadanStart)))) audio.play('notify');
    controller?.handleEvents(events);
    // Body composition changes overnight.
    if (charModel && events.some((e) => e.kind === 'newDay')) charModel.setBodyShape(session.character.body.muscle, session.character.body.fat);
  }
  hud.update(dt);

  const hour = toParts(session.clock.minutes).hour;
  const isNight = hour < 6 || hour >= 18;
  if (isNight !== night) {
    night = isNight;
    room.setNight(isNight);
  }

  if (events.some((e) => e.kind === 'shoppingDone')) refreshFridge();

  room.update(dt, controller && charModel?.root.visible ? controller.position : null, controller?.frontDoorOpen ?? false);
  if (!controller || !charModel) return;
  if (session.clock.speed === 0) charModel.update(dt);
  else controller.update(dt);
  autonomy?.update(realDt);

  // A very low need shows its icon every few seconds, even with autonomy off.
  urgentTimer -= realDt;
  if (urgentTimer <= 0) {
    urgentTimer = 6;
    const v = session.character.vitals.needs;
    const worst = NEED_KEYS.reduce((a, b) => (v[a] <= v[b] ? a : b));
    if (v[worst] < 20) bubble.show(NEED_ICONS[worst], 2.5);
  }
  bubble.update(charModel.root, view.camera);
});

// Test hook for the Playwright smoke test (only with ?debug).
if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __game: unknown }).__game = {
    session,
    room,
    view,
    get controller() {
      return controller;
    },
    get character() {
      return charModel;
    },
    /** Screen position (CSS px) of an object's centre, for simulated taps. */
    screenOf(id: string, y = 0.4) {
      const inst = room.instances.get(id);
      if (!inst) return null;
      const v = inst.group.position.clone();
      v.y = y;
      v.project(view.camera);
      return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
    },
  };
}
