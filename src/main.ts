import { validateGameData } from './data';
import { t } from './data/strings';
import { HUMAN_SKIN_TONES, HumanModel } from './characters/humanModel';
import { Wanderer, WANDER_START } from './characters/wander';
import { createRoomView } from './home/roomView';
import { GameSession } from './sim/session';
import { simData } from './sim/gameData';
import { Hud } from './ui/hud';

const issues = validateGameData();
if (issues.length > 0) console.warn('Data validation issues:', issues);

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const hudRoot = document.querySelector<HTMLDivElement>('#hud');
const controlsEl = document.querySelector<HTMLDivElement>('#controls');
if (!canvas || !hudRoot || !controlsEl) throw new Error('Missing page elements');

// The persistent simulation; scenes and UI read from it.
const session = new GameSession(simData);
const hud = new Hud(hudRoot, session);

const styleLink = document.createElement('a');
styleLink.href = './style.html';
styleLink.textContent = t('m0.styleLink');
controlsEl.append(styleLink);

const view = createRoomView(canvas);
let character: HumanModel | null = null;
void HumanModel.load({
  body: 'male',
  skinTone: HUMAN_SKIN_TONES[2],
  hair: 'Hair_SimpleParted',
  hairColor: '#1a1310',
  shirtColor: '#f2c14e',
  pantsColor: '#2f3a52',
  shoesColor: '#f2f2f2',
  ...session.character.body,
}).then((m) => {
  m.root.position.set(WANDER_START[0], 0, WANDER_START[1]);
  view.room.scene.add(m.root);
  character = m;
});

const wanderer = new Wanderer();
view.start((dt, realDt) => {
  const events = session.tick(realDt);
  if (events.length > 0) {
    hud.showEvents(events);
    // Body composition changes overnight.
    if (character && events.some((e) => e.kind === 'newDay')) character.setBodyShape(session.character.body.muscle, session.character.body.fat);
  }
  hud.update(dt);

  if (!character) return;
  if (session.clock.speed === 0) {
    character.play('Idle_Loop');
    character.update(dt);
  } else {
    wanderer.update(character, dt, session.clock.speed);
  }
});
