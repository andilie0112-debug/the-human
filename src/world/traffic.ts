import { Group, Mesh, MeshStandardMaterial, type Scene } from 'three';
import { angkot, bajaj, cityCar, mpv, pickup, scooter } from './vehicles';
import { mergeStatic } from '../home/mergeStatic';
import { quality } from '../engine/graphics';

// Cars and motorbikes on the two lanes of the main road. They loop around the map and stop
// when someone is standing in front of them.

interface Vehicle {
  group: Group;
  lane: -1 | 1;
  speed: number;
  x: number;
}

const LANE_Z = 2;
const END = 64;

/** A motorbike (also used for the player's own bike): a matic scooter. */
export function motorbike(color: string, withRider: boolean): Group {
  return scooter(color, withRider);
}

export class Traffic {
  private readonly vehicles: Vehicle[] = [];

  constructor(scene: Scene, count = 8, opts: { angkotColor?: string; bajaj?: boolean } = {}) {
    const colors = ['#f4f6f7', '#1c1c1e', '#bdc3c7', '#7f8c8d', '#c0392b', '#2e4053', '#b9770e', '#ecf0f1'];
    for (let i = 0; i < count; i++) {
      const lane: -1 | 1 = i % 2 === 0 ? 1 : -1;
      // Motorbikes rule Indonesian roads; then family MPVs, small cars, pick-ups, the city's
      // angkot and (in Jakarta) bajaj.
      const kinds = ['scooter', 'scooter', 'mpv', 'scooter', 'city', 'scooter', opts.angkotColor ? 'angkot' : 'mpv', 'pickup', opts.bajaj ? 'bajaj' : 'scooter'];
      const kind = kinds[i % kinds.length];
      const isBike = kind === 'scooter';
      const color = colors[(i * 3) % colors.length];
      const group =
        kind === 'scooter' ? scooter(color, true)
        : kind === 'mpv' ? mpv(color)
        : kind === 'city' ? cityCar(color)
        : kind === 'pickup' ? pickup(['#ecf0f1', '#2c3e50', '#7f8c8d'][i % 3])
        : kind === 'angkot' ? angkot(opts.angkotColor ?? '#2e86c1')
        : bajaj();
      mergeStatic(group); // one draw call per material
      if (!quality.extraShadows) group.traverse((o) => (o.castShadow = false));
      const v: Vehicle = { group, lane, speed: isBike ? 8 + Math.random() * 3 : 6 + Math.random() * 2, x: -END + (i / count) * END * 2 };
      group.rotation.y = lane === 1 ? 0 : Math.PI;
      group.position.set(v.x, 0, lane * LANE_Z * -1);
      scene.add(group);
      this.vehicles.push(v);
    }
  }

  /** `blockers`: positions of people on the road (vehicles wait for them). */
  update(dt: number, blockers: { x: number; z: number }[]): void {
    for (const v of this.vehicles) {
      const dir = v.lane;
      const z = -v.lane * LANE_Z;
      const ahead = blockers.some((b) => Math.abs(b.z - z) < 1.6 && (b.x - v.x) * dir > 0 && (b.x - v.x) * dir < 5);
      const carAhead = this.vehicles.some((o) => o !== v && o.lane === v.lane && (o.x - v.x) * dir > 0 && (o.x - v.x) * dir < 5);
      if (!ahead && !carAhead) v.x += dir * v.speed * dt;
      if (v.x > END) v.x = -END;
      if (v.x < -END) v.x = END;
      v.group.position.set(v.x, 0, z);
    }
  }

  dispose(): void {
    for (const v of this.vehicles) {
      v.group.removeFromParent();
      v.group.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          (o.material as MeshStandardMaterial).dispose();
        }
      });
    }
  }
}
