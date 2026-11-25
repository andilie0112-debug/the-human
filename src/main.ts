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
const view = createRoomView(canvas, room, 3.6);

let controller: CharacterController | null = null;
const queueBar = new QueueBar(hudRoot, (i) => controller?.cancel(i));
const menu = new ActionMenu(document.body, session, (inst, action) => controller?.enqueue(inst, action));

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
  model.root.position.set(-0.45, 0, 1.6);
  model.root.rotation.y = Math.PI;
  room.scene.add(model.root);
  controller = new CharacterController(
    session,
    room,
    model,
    (block) => hud.toast(t(block === 'fasting' ? 'block.fasting' : 'block.money')),
    () => queueBar.render(controller?.queue ?? []),
  );
  charModel = model;
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

  if (!controller || !charModel) return;
  if (session.clock.speed === 0) charModel.update(dt);
  else controller.update(dt);
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
