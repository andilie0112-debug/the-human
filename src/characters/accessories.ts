import { CylinderGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, TorusGeometry, BoxGeometry, type SkinnedMesh } from 'three';
import { boundsOf } from './clothing';
import type { HumanLook } from './humanModel';

// Glasses and a peci (songkok), placed from the head's measured bounds in body-mesh space and
// parented to the head bone so they follow every movement.

function attachToHead(body: SkinnedMesh, obj: Group): void {
  const i = body.skeleton.bones.findIndex((b) => b.name === 'Head');
  if (i < 0) return;
  const head = body.skeleton.bones[i];
  // Mesh (bind) space -> head bone space, exactly as skinning maps the head's vertices.
  const m = new Matrix4().copy(body.skeleton.boneInverses[i]).multiply(body.bindMatrix);
  obj.applyMatrix4(m);
  head.add(obj);
}

function glasses(style: Exclude<HumanLook['glasses'], 'none' | undefined>, eyeY: number, frontZ: number, halfW: number): Group {
  const g = new Group();
  const frame = new MeshStandardMaterial({ color: style === 'kotak' ? '#2a211b' : '#3b3e44', roughness: 0.35, metalness: style === 'bulat' ? 0.7 : 0.1 });
  const lens = new MeshStandardMaterial({ color: style === 'hitam' ? '#151515' : '#cfe3ee', roughness: 0.05, metalness: 0.2, transparent: true, opacity: style === 'hitam' ? 0.9 : 0.25 });
  const r = style === 'bulat' ? 0.022 : 0.021;
  for (const side of [-1, 1]) {
    const cx = side * 0.032;
    if (style === 'bulat') {
      const ring = new Mesh(new TorusGeometry(r, 0.0022, 6, 24), frame);
      ring.position.set(cx, eyeY, frontZ);
      g.add(ring);
      const glass = new Mesh(new CylinderGeometry(r, r, 0.001, 24), lens);
      glass.rotation.x = Math.PI / 2;
      glass.position.set(cx, eyeY, frontZ);
      g.add(glass);
    } else {
      const w = 0.05;
      const h = style === 'hitam' ? 0.034 : 0.03;
      for (const [dx, dy, sx, sy] of [[0, h / 2, w, 0.004], [0, -h / 2, w, 0.003], [-w / 2, 0, 0.004, h], [w / 2, 0, 0.004, h]] as const) {
        const bar = new Mesh(new BoxGeometry(sx, sy, 0.004), frame);
        bar.position.set(cx + dx, eyeY + dy, frontZ);
        g.add(bar);
      }
      const glass = new Mesh(new BoxGeometry(w, h, 0.001), lens);
      glass.position.set(cx, eyeY, frontZ);
      g.add(glass);
    }
    // Temple arm back to the ear.
    const arm = new Mesh(new BoxGeometry(0.003, 0.003, 0.1), frame);
    arm.position.set(side * (halfW + 0.004), eyeY + 0.004, frontZ - 0.05);
    g.add(arm);
    const hinge = new Mesh(new BoxGeometry(Math.max(0.004, halfW - 0.054), 0.003, 0.003), frame);
    hinge.position.set(side * (0.057 + (halfW - 0.054) / 2), eyeY + 0.004, frontZ);
    g.add(hinge);
  }
  const bridge = new Mesh(new BoxGeometry(0.016, 0.003, 0.003), frame);
  bridge.position.set(0, eyeY + 0.006, frontZ + 0.002);
  g.add(bridge);
  return g;
}

function peci(topY: number, centerZ: number, halfW: number): Group {
  const g = new Group();
  const velvet = new MeshStandardMaterial({ color: '#141416', roughness: 0.95 });
  // Sits on top of the hair, slightly wider than the skull.
  const cap = new Mesh(new CylinderGeometry(halfW + 0.008, halfW + 0.016, 0.072, 28), velvet);
  cap.scale.z = 1.2;
  cap.position.set(0, topY - 0.004, centerZ);
  cap.rotation.x = -0.12;
  g.add(cap);
  return g;
}

/** Adds the look's accessories; the peci joins the everyday outfit (hidden in pyjamas). */
export function addAccessories(body: SkinnedMesh, look: HumanLook, daily: SkinnedMesh[]): void {
  const head = boundsOf(body, ['Head'], 0.5);
  const eyeY = head.minY + 0.112;
  const halfW = head.maxX;
  if (look.glasses && look.glasses !== 'none') {
    const g = glasses(look.glasses, eyeY, head.maxZ + 0.006, halfW);
    attachToHead(body, g);
  }
  if (look.peci && !look.hijab) {
    const p = peci(head.maxY, (head.maxZ + head.minZ) / 2 - 0.005, halfW);
    attachToHead(body, p);
    daily.push(p as unknown as SkinnedMesh); // switched with the outfit (only the visibility is used)
  }
}
