import { PerspectiveCamera, Vector3, type Group } from 'three';
import type { HumanModel } from '../characters/humanModel';
import type { Box2 } from './neighborhood';

// Third-person walking (and riding) outside: input relative to the camera, collisions with
// buildings, and a camera that follows from behind. Drag on the screen to turn the camera.

const WALK = 1.45;
const RUN = 3.4;
/** Ground speed of the walk and jog clips at normal playback (measured from the feet). */
const WALK_CLIP_SPEED = 0.94;
const JOG_CLIP_SPEED = 2.3;
const RIDE = 8;
const RADIUS = 0.35;

export class PlayerController {
  readonly camera = new PerspectiveCamera(55, 1, 0.1, 300);
  private yaw = 0;
  private readonly camTarget = new Vector3();
  run = false;
  /** Slower through floods. */
  speedFactor = 1;
  riding = false;
  /** The player's motorbike (visible parked or under the rider). */
  bike: Group | null = null;
  bikeAt = { x: 0, z: 0, heading: 0 };

  constructor(
    private readonly character: HumanModel,
    private readonly colliders: Box2[],
    private readonly bounds: Box2,
    /** Camera distance and height (closer indoors). */
    private readonly cam = { dist: 6.5, height: 3.6 },
    /** Height of the ground under a point (raised sidewalks); flat when omitted. */
    private readonly heightAt: (x: number, z: number) => number = () => 0,
  ) {}

  /** Puts the character at a spot facing `heading`; the camera starts in front, looking back at them. */
  place(x: number, z: number, heading: number, cameraBehind = false): void {
    this.character.root.position.set(x, this.heightAt(x, z), z);
    this.character.root.rotation.set(0, heading, 0);
    this.yaw = cameraBehind ? heading + Math.PI : heading;
    this.snapCamera();
  }

  turnCamera(dx: number): void {
    this.yaw -= dx * 0.006;
  }

  private blocked(x: number, z: number): boolean {
    if (x < this.bounds.x0 || x > this.bounds.x1 || z < this.bounds.z0 || z > this.bounds.z1) return true;
    return this.colliders.some((c) => x > c.x0 - RADIUS && x < c.x1 + RADIUS && z > c.z0 - RADIUS && z < c.z1 + RADIUS);
  }

  /** `input`: joystick (x right, y down) in screen space. */
  update(dt: number, input: { x: number; y: number }): void {
    const root = this.character.root;
    const mag = Math.hypot(input.x, input.y);
    if (mag > 0.08) {
      // Camera-relative direction: up on the stick walks away from the camera.
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw);
      const rz = -Math.sin(this.yaw);
      const dx = rx * input.x - fx * input.y;
      const dz = rz * input.x - fz * input.y;
      const len = Math.hypot(dx, dz) || 1;
      const speed = (this.riding ? RIDE : this.run ? RUN : WALK) * Math.min(1, mag) * this.speedFactor;
      const nx = root.position.x + (dx / len) * speed * dt;
      const nz = root.position.z + (dz / len) * speed * dt;
      // Slide along walls: try both axes separately.
      if (!this.blocked(nx, root.position.z)) root.position.x = nx;
      if (!this.blocked(root.position.x, nz)) root.position.z = nz;
      const target = Math.atan2(dx, dz);
      let d = target - root.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      root.rotation.y += d * Math.min(1, dt * 10);
      if (this.riding) this.character.play('Driving_Loop', 0.2);
      // Cadence follows the ground speed so the feet do not slide.
      else this.character.play(this.run ? 'Jog_Fwd_Loop' : 'Walk_Loop', 0.2, speed / (this.run ? JOG_CLIP_SPEED : WALK_CLIP_SPEED));
      // The camera slowly swings behind the walker.
      let cd = root.rotation.y + Math.PI - this.yaw;
      while (cd > Math.PI) cd -= Math.PI * 2;
      while (cd < -Math.PI) cd += Math.PI * 2;
      this.yaw += cd * Math.min(1, dt * (this.riding ? 2 : 0.8));
    } else {
      this.character.play(this.riding ? 'Driving_Loop' : 'Idle_Loop', 0.25);
    }
    if (this.riding && this.bike) {
      this.bike.position.set(root.position.x, this.heightAt(root.position.x, root.position.z), root.position.z);
      this.bike.rotation.y = root.rotation.y - Math.PI / 2;
      root.position.y = 0.45 + this.heightAt(root.position.x, root.position.z);
    } else {
      // Feet on the surface: step up onto sidewalks smoothly instead of sinking into them.
      const ground = this.heightAt(root.position.x, root.position.z);
      root.position.y += (ground - root.position.y) * Math.min(1, dt * 14);
    }
    this.character.update(dt);
    this.followCamera(dt);
  }

  private snapCamera(): void {
    this.followCamera(1);
  }

  private followCamera(dt: number): void {
    const root = this.character.root;
    const dist = this.riding ? 9 : this.cam.dist;
    const height = this.riding ? 4.5 : this.cam.height;
    // Pull the camera in when a building is between it and the character.
    let free = dist;
    for (let i = 1; i <= 12; i++) {
      const d = (dist * i) / 12;
      const x = root.position.x + Math.sin(this.yaw) * d;
      const z = root.position.z + Math.cos(this.yaw) * d;
      if (this.colliders.some((c) => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1)) {
        free = Math.max(1.2, (dist * (i - 1)) / 12);
        break;
      }
    }
    const want = new Vector3(root.position.x + Math.sin(this.yaw) * free, height * (0.55 + 0.45 * (free / dist)), root.position.z + Math.cos(this.yaw) * free);
    this.camera.position.lerp(want, Math.min(1, dt * (free < dist ? 12 : 5)));
    this.camTarget.set(root.position.x, 1.4, root.position.z);
    this.camera.lookAt(this.camTarget);
  }

  resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
