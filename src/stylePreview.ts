import { createRoomView } from './home/roomView';
import { createPreviewRoom } from './home/stylePreviewRoom';
import { Wanderer, WANDER_START } from './characters/wander';
import { HUMAN_SKIN_TONES as TONE, HumanModel, type HumanLook } from './characters/humanModel';
import { t } from './data/strings';

// Art-direction preview: a cosy kos room and a character that moves naturally.

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const hud = document.querySelector<HTMLDivElement>('#hud');
const controlsEl = document.querySelector<HTMLDivElement>('#controls');
const slidersEl = document.querySelector<HTMLDivElement>('#sliders');
if (!canvas || !hud || !controlsEl || !slidersEl) throw new Error('Missing page elements');

hud.innerHTML = '<h1></h1><p></p>';
hud.querySelector('h1')!.textContent = t('style.title');
hud.querySelector('p')!.textContent = t('style.hint');

const view = createRoomView(canvas, createPreviewRoom());
const room = view.room;
// A few everyday Indonesian looks; each tap shows the next person.
const LOOKS: HumanLook[] = [
  { body: 'male', skinTone: TONE[2], hair: 'Hair_SimpleParted', hairColor: '#1a1310', shirtColor: '#f2c14e', pantsColor: '#2f3a52', shoesColor: '#f2f2f2' },
  { body: 'female', skinTone: TONE[1], hair: 'Hair_Long', hairColor: '#1c1411', shirtColor: '#e8747c', longSleeve: true, pantsColor: '#efe8dc', shoesColor: '#8a5a3a' },
  { body: 'male', skinTone: TONE[3], hair: 'Hair_Buzzed', hairColor: '#120e0c', beard: true, shirtColor: '#4f9a8a', pantsColor: '#3b3b40', shorts: true, shoesColor: '#222222' },
  { body: 'female', skinTone: TONE[0], hair: 'Hair_Buns', hairColor: '#2a1c15', shirtColor: '#9cc5e8', pantsColor: '#4a3d6b', shoesColor: '#ffffff' },
  { body: 'male', skinTone: TONE[4], hair: 'Hair_SimpleParted', hairColor: '#0f0c0a', shirtColor: '#ffffff', longSleeve: true, pantsColor: '#5d6b4c', shoesColor: '#3a2a1e' },
];

let character: HumanModel | null = null;
const shape = { muscle: 0.1, fat: 0.3 };

// Body shape sliders: preview of how exercise and diet will change the body.
function addSlider(label: string, key: keyof typeof shape): void {
  const row = document.createElement('label');
  const text = document.createElement('span');
  text.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '100';
  input.value = String(Math.round(shape[key] * 100));
  input.addEventListener('input', () => {
    shape[key] = Number(input.value) / 100;
    character?.setBodyShape(shape.muscle, shape.fat);
  });
  row.append(text, input);
  slidersEl!.append(row);
}
addSlider(t('style.muscle'), 'muscle');
addSlider(t('style.fat'), 'fat');
let modelIndex = 0;
let loading = false;

async function loadCharacter(index: number): Promise<void> {
  loading = true;
  const next = await HumanModel.load(LOOKS[index]);
  if (character) {
    next.root.position.copy(character.root.position);
    next.root.rotation.y = character.root.rotation.y;
    character.dispose();
  } else {
    next.root.position.set(WANDER_START[0], 0, WANDER_START[1]);
  }
  room.scene.add(next.root);
  next.setBodyShape(shape.muscle, shape.fat);
  character = next;
  loading = false;
}
void loadCharacter(modelIndex);

// Night/day toggle and back link
let night = false;
const toggle = document.createElement('button');
toggle.textContent = t('style.toNight');
toggle.addEventListener('click', () => {
  night = !night;
  room.setNight(night);
  toggle.textContent = night ? t('style.toDay') : t('style.toNight');
});
const back = document.createElement('a');
back.href = './';
back.textContent = t('style.back');
const swap = document.createElement('button');
swap.textContent = t('style.swap');
swap.addEventListener('click', () => {
  if (loading) return;
  modelIndex = (modelIndex + 1) % LOOKS.length;
  void loadCharacter(modelIndex);
});
controlsEl.append(back, swap, toggle);

const wanderer = new Wanderer();
view.start((dt) => {
  if (character) wanderer.update(character, dt);
});
