import { CylinderGeometry, Group, SphereGeometry, Matrix4, Mesh, MeshStandardMaterial, Quaternion, TorusGeometry, BoxGeometry, Vector3, type SkinnedMesh } from 'three';
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

export type HandProp = 'sapu' | 'pel' | 'lap' | 'pisau' | 'baju' | 'gayung' | 'setrika' | 'spatula' | 'piring' | 'piringKotor' | 'spons' | 'sendok';

/** Builds a tool held in the right hand: the grip at the origin, the long end pointing down. */
function handTool(kind: HandProp): Group {
  const g = new Group();
  const wood = new MeshStandardMaterial({ color: '#b08452', roughness: 0.7 });
  const stick = (len: number): void => {
    const m = new Mesh(new CylinderGeometry(0.013, 0.013, len, 8), wood);
    m.position.y = -len / 2 + 0.25;
    g.add(m);
  };
  if (kind === 'sapu') {
    stick(1.05);
    const head = new Mesh(new CylinderGeometry(0.02, 0.13, 0.32, 12, 1, true), new MeshStandardMaterial({ color: '#6e4b2a', roughness: 0.95, side: 2 }));
    head.scale.z = 0.35;
    head.position.y = -0.95;
    g.add(head);
  } else if (kind === 'pel') {
    stick(1.1);
    const bar = new Mesh(new BoxGeometry(0.34, 0.03, 0.05), new MeshStandardMaterial({ color: '#2e86c1' }));
    bar.position.y = -0.83;
    g.add(bar);
    const rag = new Mesh(new BoxGeometry(0.36, 0.07, 0.12), new MeshStandardMaterial({ color: '#ecf0f1', roughness: 1 }));
    rag.position.y = -0.87;
    g.add(rag);
  } else if (kind === 'lap') {
    const cloth = new Mesh(new BoxGeometry(0.12, 0.02, 0.09), new MeshStandardMaterial({ color: '#f4d03f', roughness: 1 }));
    cloth.position.y = -0.04;
    g.add(cloth);
  } else if (kind === 'pisau') {
    // A kitchen knife big enough to see from the room camera: dark handle, wide bright blade.
    const handle = new Mesh(new BoxGeometry(0.025, 0.11, 0.03), new MeshStandardMaterial({ color: '#3b2314' }));
    g.add(handle);
    const blade = new Mesh(new BoxGeometry(0.006, 0.2, 0.05), new MeshStandardMaterial({ color: '#eef1f3', metalness: 0.6, roughness: 0.25 }));
    blade.position.y = -0.15;
    g.add(blade);
  } else if (kind === 'setrika') {
    // The iron held by its handle, soleplate down.
    const plate = new Mesh(new BoxGeometry(0.2, 0.018, 0.1), new MeshStandardMaterial({ color: '#d5d8dc', metalness: 0.9, roughness: 0.2 }));
    plate.position.y = -0.09;
    g.add(plate);
    const body = new Mesh(new BoxGeometry(0.18, 0.06, 0.09), new MeshStandardMaterial({ color: '#f4f6f7', roughness: 0.35 }));
    body.position.y = -0.05;
    g.add(body);
  } else if (kind === 'spatula') {
    // Sutil: a wooden handle and a flat steel blade, used to stir in the wok.
    stick(0.3);
    const blade = new Mesh(new BoxGeometry(0.07, 0.09, 0.006), new MeshStandardMaterial({ color: '#c3c8cc', metalness: 0.8, roughness: 0.25 }));
    blade.position.y = -0.13;
    g.add(blade);
  } else if (kind === 'piring' || kind === 'piringKotor') {
    // A plate held level, centred on its holder (placed between both hands, see HumanModel):
    // rice and the dish on it, or the leftovers and the spoon after the meal.
    // A dinner plate (about 28 cm): its rim rests on both palms.
    const plate = new Mesh(new CylinderGeometry(0.14, 0.115, 0.02, 24), new MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.3 }));
    g.add(plate);
    if (kind === 'piring') {
      const rice = new Mesh(new SphereGeometry(0.055, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new MeshStandardMaterial({ color: '#f7f5ee', roughness: 0.9 }));
      rice.position.set(-0.03, 0.01, 0);
      g.add(rice);
      const dish = new Mesh(new CylinderGeometry(0.045, 0.05, 0.025, 12), new MeshStandardMaterial({ color: '#c8742d', roughness: 0.7 }));
      dish.position.set(0.045, 0.02, 0);
      g.add(dish);
    } else {
      const smear = new Mesh(new CylinderGeometry(0.05, 0.05, 0.004, 10), new MeshStandardMaterial({ color: '#b9955a', roughness: 0.8 }));
      smear.position.set(0.02, 0.012, 0.01);
      g.add(smear);
      const spoon = new Mesh(new BoxGeometry(0.16, 0.006, 0.02), new MeshStandardMaterial({ color: '#d5d8dc', metalness: 0.8, roughness: 0.2 }));
      spoon.position.set(0, 0.018, -0.02);
      g.add(spoon);
    }
  } else if (kind === 'spons') {
    // Kitchen sponge: yellow with a green scrubbing side, with a little foam.
    const sponge = new Mesh(new BoxGeometry(0.09, 0.03, 0.06), new MeshStandardMaterial({ color: '#f4d03f', roughness: 1 }));
    sponge.position.y = -0.04;
    g.add(sponge);
    const scour = new Mesh(new BoxGeometry(0.09, 0.012, 0.06), new MeshStandardMaterial({ color: '#27ae60', roughness: 1 }));
    scour.position.y = -0.062;
    g.add(scour);
    for (let i = 0; i < 4; i++) {
      const bubble = new Mesh(new SphereGeometry(0.012 + i * 0.003, 8, 6), new MeshStandardMaterial({ color: '#ffffff', roughness: 0.2, transparent: true, opacity: 0.85 }));
      bubble.position.set(-0.03 + i * 0.02, -0.02, (i % 2) * 0.02);
      g.add(bubble);
    }
  } else if (kind === 'sendok') {
    const spoon = new Mesh(new BoxGeometry(0.012, 0.15, 0.004), new MeshStandardMaterial({ color: '#d5d8dc', metalness: 0.8, roughness: 0.2 }));
    spoon.position.y = -0.06;
    g.add(spoon);
  } else if (kind === 'gayung') {
    const cup = new Mesh(new CylinderGeometry(0.07, 0.06, 0.08, 12), new MeshStandardMaterial({ color: '#2e86c1' }));
    cup.position.set(0, -0.06, 0.05);
    g.add(cup);
  } else {
    const cloth = new Mesh(new BoxGeometry(0.3, 0.04, 0.24), new MeshStandardMaterial({ color: '#85c1e9', roughness: 1 }));
    cloth.position.y = -0.05;
    g.add(cloth);
  }
  return g;
}

/** Puts a tool in the right hand (or takes it away with null); returns the attached group. */
export function attachHandProp(body: SkinnedMesh, kind: HandProp): Group | null {
  const i = body.skeleton.bones.findIndex((b) => b.name === 'hand_r');
  if (i < 0) return null;
  // Centre of the hand in mesh (bind) space, from the vertices the hand bone moves.
  const verts = body.geometry.getAttribute('position');
  const si = body.geometry.getAttribute('skinIndex');
  const sw = body.geometry.getAttribute('skinWeight');
  let x = 0, y = 0, z = 0, n = 0;
  for (let v = 0; v < verts.count; v++) {
    for (let k = 0; k < 4; k++) {
      if (si.getComponent(v, k) === i && sw.getComponent(v, k) > 0.6) {
        x += verts.getX(v);
        y += verts.getY(v);
        z += verts.getZ(v);
        n++;
        break;
      }
    }
  }
  if (n === 0) return null;
  // The holder sits at the hand centre in bone space; its rotation is set every frame so that
  // long tools always point down to the floor in front (see HumanModel.holdProp).
  const m = new Matrix4().copy(body.skeleton.boneInverses[i]).multiply(body.bindMatrix);
  const pos = new Vector3(x / n, y / n, z / n).applyMatrix4(m);
  const scale = new Vector3();
  m.decompose(new Vector3(), new Quaternion(), scale);
  const holder = new Group();
  holder.add(handTool(kind));
  holder.position.copy(pos);
  holder.scale.copy(scale);
  body.skeleton.bones[i].add(holder);
  return holder;
}
