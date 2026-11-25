import type { Scene } from 'three';
import { HAIRSTYLES, HUMAN_SKIN_TONES, HumanModel, type HumanLook } from '../characters/humanModel';

// A few neighbours walking up and down the sidewalks.

interface Walker {
  model: HumanModel;
  z: number;
  x: number;
  dir: 1 | -1;
  speed: number;
}

const COLORS = ['#e8747c', '#4f9a8a', '#3f6fa8', '#f2c14e', '#ffffff', '#8e6cc0', '#c86b3c'];
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

function randomLook(): HumanLook {
  const body = Math.random() < 0.5 ? 'male' : 'female';
  const hijab = body === 'female' && Math.random() < 0.45;
  return {
    body,
    skinTone: pick(HUMAN_SKIN_TONES),
    hair: pick(HAIRSTYLES[body]),
    hairColor: pick(['#0f0c0a', '#1a1310', '#3a2418']),
    beard: body === 'male' && Math.random() < 0.3,
    hijab,
    hijabColor: pick(['#c46b7a', '#3f6fa8', '#2d2d33', '#efe8dc']),
    shirtColor: pick(COLORS),
    longSleeve: hijab || Math.random() < 0.4,
    pantsColor: pick(['#2f3a52', '#2d2d33', '#5d6b4c', '#efe8dc']),
    shoesColor: pick(['#f2f2f2', '#222222', '#8a5a3a']),
    topStyle: pick(['kaos', 'kaos', 'kemeja', 'batik', 'polo', 'jaket'] as const),
    bottomStyle: body === 'female' ? pick(['jeans', 'chino', 'rokPanjang', 'rok'] as const) : pick(['jeans', 'chino', 'pendek', 'sarung'] as const),
    shoeStyle: pick(['sneakers', 'sandal', 'sandal', 'pantofel'] as const),
    glasses: Math.random() < 0.25 ? pick(['bulat', 'kotak', 'hitam'] as const) : 'none',
    peci: body === 'male' && Math.random() < 0.15,
    height: Math.random() * 2 - 1,
    muscle: Math.random() * 0.3,
    fat: 0.15 + Math.random() * 0.5,
  };
}

export class Pedestrians {
  private readonly walkers: Walker[] = [];

  constructor(private readonly scene: Scene, count = 4, private readonly sidewalks: [number, number] = [-5.3, 5.3], private readonly range = 58) {
    for (let i = 0; i < count; i++) {
      void HumanModel.load(randomLook()).then((model) => {
        const w: Walker = { model, z: this.sidewalks[i % 2], x: (Math.random() * 2 - 1) * this.range * 0.85, dir: Math.random() < 0.5 ? 1 : -1, speed: 1.1 + Math.random() * 0.4 };
        model.root.position.set(w.x, 0, w.z);
        model.play('Walk_Loop', 0);
        this.scene.add(model.root);
        this.walkers.push(w);
      });
    }
  }

  positions(): { x: number; z: number }[] {
    return this.walkers.map((w) => ({ x: w.x, z: w.z }));
  }

  update(dt: number): void {
    for (const w of this.walkers) {
      w.x += w.dir * w.speed * dt;
      if (Math.abs(w.x) > this.range) w.dir = (w.dir * -1) as 1 | -1;
      w.model.root.position.set(w.x, 0, w.z);
      w.model.root.rotation.y = w.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      w.model.update(dt);
    }
  }

  dispose(): void {
    for (const w of this.walkers) w.model.dispose();
  }
}
