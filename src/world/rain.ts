import { BufferAttribute, BufferGeometry, CircleGeometry, Color, Fog, Group, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, PlaneGeometry, type Scene } from 'three';

// Rain and floods for a scene: falling streaks around a point (the player or the house), a grey
// sky and fog, shiny puddles on the ground and, during a flood, muddy water over the streets.
// Allocation-free per frame: one buffer of drops is moved in place.

const COUNT = 1400;
const AREA = 26;
const HEIGHT = 14;

export class Weather {
  private readonly drops: LineSegments;
  private readonly positions: Float32Array;
  private readonly speeds: Float32Array;
  private readonly mat: LineBasicMaterial;
  private readonly puddles = new Group();
  private readonly flood: Mesh;
  private intensity = 0;
  private wet = 0;
  private floodLevel = 0;
  /** Longer, brighter streaks for a far camera (the house seen from above). */
  private readonly length: number;
  private baseBackground: Color | null = null;
  private baseFog: Color | null = null;
  private readonly grey = new Color('#8e979e');

  /** `skyResets`: the scene sets its sky colour every frame itself (day and night). */
  constructor(private readonly scene: Scene, puddleSpots: { x: number; z: number; r: number }[] = [], private readonly floodY = 0.2, private readonly skyResets = true) {
    this.length = skyResets ? 0.45 : 1.1;
    this.positions = new Float32Array(COUNT * 6);
    this.speeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      this.speeds[i] = 14 + Math.random() * 6;
      this.reset(i, 0, 0, Math.random() * HEIGHT);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.mat = new LineBasicMaterial({ color: '#dde5ea', transparent: true, opacity: skyResets ? 0.45 : 0.7, depthWrite: false });
    this.drops = new LineSegments(geo, this.mat);
    this.drops.frustumCulled = false;
    this.drops.visible = false;
    scene.add(this.drops);
    // Puddles: dark, glossy discs that fade in while it rains and dry up slowly after.
    const puddleMat = new MeshStandardMaterial({ color: '#3d464d', roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0, depthWrite: false });
    for (const p of puddleSpots) {
      const m = new Mesh(new CircleGeometry(p.r, 18), puddleMat);
      m.rotation.x = -Math.PI / 2;
      m.scale.y = 0.6 + Math.random() * 0.4;
      m.position.set(p.x, 0.02, p.z);
      this.puddles.add(m);
    }
    this.puddles.visible = false;
    scene.add(this.puddles);
    this.flood = new Mesh(new PlaneGeometry(400, 400), new MeshStandardMaterial({ color: '#7a6a4f', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.8, depthWrite: false }));
    this.flood.rotation.x = -Math.PI / 2;
    this.flood.visible = false;
    scene.add(this.flood);
  }

  /** Keeps rain out of a rectangle (the inside of the house). */
  exclude: { x0: number; z0: number; x1: number; z1: number } | null = null;

  /** Call when the scene's own sky colour changes (day and night at home). */
  resetSky(): void {
    this.baseBackground = null;
    this.baseFog = null;
  }

  private reset(i: number, cx: number, cz: number, y: number): void {
    let x = cx + (Math.random() - 0.5) * AREA;
    let z = cz + (Math.random() - 0.5) * AREA;
    const ex = this.exclude;
    for (let k = 0; ex && k < 4 && x > ex.x0 && x < ex.x1 && z > ex.z0 && z < ex.z1; k++) {
      x = cx + (Math.random() - 0.5) * AREA;
      z = cz + (Math.random() - 0.5) * AREA;
    }
    if (ex && x > ex.x0 && x < ex.x1 && z > ex.z0 && z < ex.z1) y = -10;
    const o = i * 6;
    this.positions[o] = x;
    this.positions[o + 1] = y;
    this.positions[o + 2] = z;
    this.positions[o + 3] = x + 0.04;
    this.positions[o + 4] = y + this.length;
    this.positions[o + 5] = z;
  }

  /** Sets the weather: rain intensity 0..1 and whether the street is flooded. */
  set(intensity: number, flooded: boolean): void {
    this.intensity = intensity;
    this.floodLevel = flooded ? 1 : 0;
  }

  /** How wet the world is (0..1): darker light for the scene's lights. */
  get gloom(): number {
    return Math.min(1, this.intensity * 1.2);
  }

  /** Flooded streets slow walking down. */
  get flooded(): boolean {
    return this.flood.visible;
  }

  update(dt: number, cx: number, cz: number): void {
    // Sky and fog turn grey with the rain.
    const bg = this.scene.background;
    if (bg instanceof Color) {
      if (!this.skyResets) bg.copy((this.baseBackground ??= bg.clone()));
      bg.lerp(this.grey, this.gloom * 0.7);
    }
    const fog = this.scene.fog;
    if (fog instanceof Fog) {
      if (!this.skyResets) fog.color.copy((this.baseFog ??= fog.color.clone()));
      fog.color.lerp(this.grey, this.gloom * 0.7);
    }
    // Drops: only a share of them fall in light rain.
    const active = Math.floor(COUNT * this.intensity);
    this.drops.visible = active > 0;
    if (active > 0) {
      this.drops.geometry.setDrawRange(0, active * 2);
      for (let i = 0; i < active; i++) {
        const o = i * 6;
        const fall = this.speeds[i] * dt;
        this.positions[o + 1] -= fall;
        this.positions[o + 4] -= fall;
        const dx = this.positions[o] - cx;
        const dz = this.positions[o + 2] - cz;
        if (this.positions[o + 1] < 0 || Math.abs(dx) > AREA / 2 || Math.abs(dz) > AREA / 2) this.reset(i, cx, cz, HEIGHT * (0.6 + Math.random() * 0.4));
      }
      (this.drops.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    }
    // Puddles grow while it rains and dry slowly afterwards.
    this.wet += ((this.intensity > 0 ? 1 : 0) - this.wet) * Math.min(1, dt * (this.intensity > 0 ? 0.25 : 0.03));
    const pm = this.puddles.children[0] as Mesh | undefined;
    if (pm) (pm.material as MeshStandardMaterial).opacity = this.wet * 0.75;
    this.puddles.visible = this.wet > 0.02;
    this.flood.visible = this.floodLevel > 0;
    this.flood.position.set(cx, this.floodY, cz);
  }

  dispose(): void {
    this.drops.geometry.dispose();
    this.mat.dispose();
    this.puddles.children.forEach((c) => (c as Mesh).geometry.dispose());
    this.flood.geometry.dispose();
    this.scene.remove(this.drops, this.puddles, this.flood);
  }
}
