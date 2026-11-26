import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, type Scene } from 'three';

// Small effects for houses of worship: incense smoke curling up from burners, and running water
// from the ablution taps (turned on while someone performs wudhu).

const PUFFS = 10;

export class IncenseSmoke {
  private readonly puffs: { mesh: Mesh; mat: MeshBasicMaterial; t: number; life: number; src: number; drift: number }[] = [];
  private readonly geo = new SphereGeometry(0.05, 8, 6);
  private readonly group = new Group();

  constructor(scene: Scene, private readonly sources: { x: number; y: number; z: number }[]) {
    sources.forEach((_, src) => {
      for (let i = 0; i < PUFFS; i++) {
        const mat = new MeshBasicMaterial({ color: '#d8d8d8', transparent: true, opacity: 0, depthWrite: false });
        const mesh = new Mesh(this.geo, mat);
        this.group.add(mesh);
        this.puffs.push({ mesh, mat, t: (i / PUFFS) * 4, life: 4, src, drift: Math.random() * Math.PI * 2 });
      }
    });
    scene.add(this.group);
  }

  update(dt: number): void {
    for (const p of this.puffs) {
      p.t += dt;
      if (p.t > p.life) {
        p.t -= p.life;
        p.drift = Math.random() * Math.PI * 2;
      }
      const k = p.t / p.life;
      const s = this.sources[p.src];
      p.mesh.position.set(s.x + Math.sin(p.drift + p.t * 1.3) * 0.08 * k * 3, s.y + p.t * 0.32, s.z + Math.cos(p.drift + p.t) * 0.06 * k * 3);
      p.mesh.scale.setScalar(0.6 + k * 3);
      p.mat.opacity = 0.35 * Math.sin(Math.PI * k);
    }
  }

  dispose(): void {
    this.geo.dispose();
    for (const p of this.puffs) p.mat.dispose();
    this.group.removeFromParent();
  }
}

export class TapWater {
  private readonly streams: Mesh[] = [];
  private readonly mat = new MeshStandardMaterial({ color: '#cfe8f2', transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.1 });
  private readonly geo = new CylinderGeometry(0.012, 0.018, 1, 8);
  private t = 0;
  on = false;

  constructor(scene: Scene, taps: { x: number; y: number; z: number }[]) {
    for (const tap of taps) {
      const m = new Mesh(this.geo, this.mat);
      // From the spout down to the basin.
      m.scale.y = tap.y - 0.75;
      m.position.set(tap.x, (tap.y + 0.75) / 2, tap.z);
      m.visible = false;
      scene.add(m);
      this.streams.push(m);
    }
  }

  update(dt: number): void {
    this.t += dt;
    for (const m of this.streams) {
      m.visible = this.on;
      if (this.on) m.scale.x = m.scale.z = 1 + Math.sin(this.t * 40 + m.position.z * 9) * 0.15;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    for (const m of this.streams) m.removeFromParent();
  }
}
