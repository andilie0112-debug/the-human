import { Color, ConeGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { NeedStatus } from '../sim/needs';

// The triangle floating above the player's character: green (all fine), orange (a need is low),
// red (a need has run out). It turns slowly and floats a little.

const COLORS: Record<NeedStatus, Color> = {
  ok: new Color('#36c95a'),
  low: new Color('#f39a1e'),
  empty: new Color('#e2403a'),
};

export class StatusMarker {
  readonly root = new Group();
  private readonly mat: MeshStandardMaterial;
  private readonly target = new Color();
  private time = 0;

  constructor(height = 2.12) {
    this.mat = new MeshStandardMaterial({ color: COLORS.ok, emissive: COLORS.ok, emissiveIntensity: 0.55, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92 });
    // Three-sided pyramid pointing down: a flat triangle on top, a point below.
    const tri = new Mesh(new ConeGeometry(0.085, 0.17, 3), this.mat);
    tri.rotation.x = Math.PI;
    this.root.add(tri);
    this.root.position.y = height;
    this.root.userData.baseY = height;
    this.target.copy(COLORS.ok);
  }

  setStatus(s: NeedStatus): void {
    this.target.copy(COLORS[s]);
  }

  update(dt: number): void {
    this.time += dt;
    this.root.rotation.y += dt * 1.1;
    this.root.position.y = (this.root.userData.baseY as number) + Math.sin(this.time * 2) * 0.025;
    const k = Math.min(1, dt * 4);
    this.mat.color.lerp(this.target, k);
    this.mat.emissive.lerp(this.target, k);
  }

  dispose(): void {
    this.mat.dispose();
    (this.root.children[0] as Mesh).geometry.dispose();
  }
}
