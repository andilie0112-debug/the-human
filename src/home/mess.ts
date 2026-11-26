import { CircleGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D } from 'three';
import type { Chores } from '../sim/housework';
import type { KosRoom } from './kosRoom';

// What housework looks like: dusty patches on the floor that fade as it is swept and mopped,
// a stack of dirty plates by the stove, and clothes hanging on the drying rack.

export class HomeMess {
  private readonly dust: Mesh[] = [];
  private readonly dustMat = new MeshBasicMaterial({ color: '#5b4a3a', transparent: true, opacity: 0, depthWrite: false });
  private readonly dustGeo = new CircleGeometry(0.35, 16);
  private readonly plates = new Group();
  private readonly plateGeo = new CylinderGeometry(0.11, 0.09, 0.02, 16);
  private readonly plateMat = new MeshStandardMaterial({ color: '#f2efe8', roughness: 0.4 });
  private timer = 0;

  constructor(private readonly room: KosRoom) {
    const { width, depth } = room.layout;
    for (let i = 0; i < 14; i++) {
      const m = new Mesh(this.dustGeo, this.dustMat);
      m.rotation.x = -Math.PI / 2;
      m.scale.set(0.5 + Math.random() * 0.7, 0.4 + Math.random() * 0.6, 1);
      m.position.set((Math.random() - 0.5) * (width - 1), 0.012, (Math.random() - 0.5) * (depth - 1));
      m.renderOrder = 1;
      room.scene.add(m);
      this.dust.push(m);
    }
    room.scene.add(this.plates);
  }

  private find(id: string): Object3D | null {
    for (const inst of this.room.instances.values()) if (inst.def.id === id) return inst.group;
    return null;
  }

  /** Call every frame; refreshes about once a second. */
  update(dt: number, chores: Chores): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1;
    this.dustMat.opacity = Math.max(0, (70 - chores.floor) / 70) * 0.28;
    // Dirty dishes stacked on the counter next to the stove.
    const stove = this.find('stove_counter');
    while (this.plates.children.length < chores.dishes && this.plates.children.length < 9) {
      const p = new Mesh(this.plateGeo, this.plateMat);
      p.position.y = this.plates.children.length * 0.022;
      this.plates.add(p);
    }
    while (this.plates.children.length > chores.dishes) this.plates.children[this.plates.children.length - 1].removeFromParent();
    if (stove) {
      stove.updateMatrixWorld();
      this.plates.position.set(0.3, 0.92, 0).applyMatrix4(stove.matrixWorld);
    }
    this.plates.visible = !!stove && chores.dishes > 0;
    // Clothes on the drying rack while they hang out.
    const rack = this.find('jemuran')?.getObjectByName('clothes');
    if (rack) rack.children.forEach((c, i) => (c.visible = i < chores.hanging));
  }

  dispose(): void {
    for (const m of this.dust) m.removeFromParent();
    this.dustGeo.dispose();
    this.dustMat.dispose();
    this.plateGeo.dispose();
    this.plateMat.dispose();
    this.plates.removeFromParent();
  }
}
