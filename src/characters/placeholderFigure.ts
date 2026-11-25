import { CapsuleGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, type Object3D } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export interface FigureColors {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  shoes: string;
}

/** Joints the animation code rotates. Each one is a pivot group. */
export interface FigureRig {
  root: Group;
  hips: Group;
  torso: Group;
  head: Group;
  armL: Group;
  armR: Group;
  elbowL: Group;
  elbowR: Group;
  legL: Group;
  legR: Group;
  kneeL: Group;
  kneeR: Group;
}

function mat(color: string, roughness = 0.7): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness });
}

function shadowed<T extends Object3D>(o: T): T {
  o.traverse((c) => {
    if (c instanceof Mesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

function pivot(parent: Object3D, x: number, y: number, z: number): Group {
  const g = new Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/**
 * A soft, rounded placeholder person built from primitives (about 1.65 m tall).
 * Used to preview art direction and motion until real rigged GLB characters arrive (M3).
 */
export function createFigure(colors: FigureColors): FigureRig {
  const skin = mat(colors.skin, 0.6);
  const root = new Group();
  const hips = pivot(root, 0, 0.88, 0);

  const pelvis = new Mesh(new RoundedBoxGeometry(0.34, 0.16, 0.2, 3, 0.07), mat(colors.pants));
  hips.add(pelvis);

  const torso = pivot(hips, 0, 0.06, 0);
  const chest = new Mesh(new RoundedBoxGeometry(0.38, 0.46, 0.22, 4, 0.09), mat(colors.shirt));
  chest.position.y = 0.23;
  torso.add(chest);

  const neck = new Mesh(new CapsuleGeometry(0.05, 0.05, 4, 8), skin);
  neck.position.y = 0.5;
  torso.add(neck);

  const head = pivot(torso, 0, 0.56, 0);
  const skull = new Mesh(new SphereGeometry(0.13, 24, 16), skin);
  skull.scale.set(1, 1.12, 1.02);
  skull.position.y = 0.12;
  head.add(skull);
  const hair = new Mesh(new SphereGeometry(0.138, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(colors.hair, 0.8));
  hair.scale.set(1, 1.12, 1.05);
  hair.position.set(0, 0.13, -0.01);
  hair.rotation.x = -0.25;
  head.add(hair);
  const eyeMat = mat('#2a211c', 0.3);
  for (const x of [-0.045, 0.045]) {
    const eye = new Mesh(new SphereGeometry(0.016, 10, 8), eyeMat);
    eye.position.set(x, 0.13, 0.122);
    head.add(eye);
  }

  const makeArm = (side: 1 | -1): [Group, Group] => {
    const shoulder = pivot(torso, side * 0.235, 0.42, 0);
    const upper = new Mesh(new CapsuleGeometry(0.055, 0.2, 4, 10), mat(colors.shirt));
    upper.position.y = -0.13;
    shoulder.add(upper);
    const elbow = pivot(shoulder, 0, -0.27, 0);
    const fore = new Mesh(new CapsuleGeometry(0.045, 0.19, 4, 10), skin);
    fore.position.y = -0.12;
    elbow.add(fore);
    const hand = new Mesh(new SphereGeometry(0.05, 12, 10), skin);
    hand.position.y = -0.26;
    elbow.add(hand);
    shoulder.rotation.z = side * 0.08;
    return [shoulder, elbow];
  };

  const makeLeg = (side: 1 | -1): [Group, Group] => {
    const hip = pivot(hips, side * 0.1, -0.04, 0);
    const thigh = new Mesh(new CapsuleGeometry(0.075, 0.3, 4, 10), mat(colors.pants));
    thigh.position.y = -0.2;
    hip.add(thigh);
    const knee = pivot(hip, 0, -0.42, 0);
    const shin = new Mesh(new CapsuleGeometry(0.062, 0.3, 4, 10), mat(colors.pants));
    shin.position.y = -0.18;
    knee.add(shin);
    const shoe = new Mesh(new RoundedBoxGeometry(0.11, 0.08, 0.22, 3, 0.035), mat(colors.shoes, 0.5));
    shoe.position.set(0, -0.4, 0.04);
    knee.add(shoe);
    return [hip, knee];
  };

  const [armL, elbowL] = makeArm(-1);
  const [armR, elbowR] = makeArm(1);
  const [legL, kneeL] = makeLeg(-1);
  const [legR, kneeR] = makeLeg(1);

  shadowed(root);
  return { root, hips, torso, head, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR };
}

/**
 * Procedural idle/walk motion. `walk` blends 0 (idle) to 1 (walking) so transitions stay smooth.
 * `phase` advances with distance walked; `t` is elapsed seconds.
 */
export function poseFigure(rig: FigureRig, t: number, phase: number, walk: number): void {
  const idle = 1 - walk;
  const s = Math.sin(phase);
  const c = Math.cos(phase);

  // Breathing and gentle weight shift when idle; bob and sway when walking.
  const breathe = Math.sin(t * 1.6);
  rig.hips.position.y = 0.88 + walk * (Math.abs(c) * 0.035 - 0.02) + idle * breathe * 0.004;
  rig.hips.position.x = idle * Math.sin(t * 0.4) * 0.015;
  rig.hips.rotation.y = walk * s * 0.12;
  rig.hips.rotation.z = idle * Math.sin(t * 0.4) * 0.03 + walk * c * 0.03;
  rig.torso.rotation.y = -walk * s * 0.18;
  rig.torso.rotation.x = walk * 0.06 + idle * breathe * 0.015;
  rig.torso.scale.set(1, 1 + idle * breathe * 0.012, 1);

  // Head looks around slowly when idle.
  rig.head.rotation.y = idle * Math.sin(t * 0.35) * 0.45 + walk * s * 0.08;
  rig.head.rotation.x = idle * (Math.sin(t * 0.23) * 0.08 - 0.03);

  // Legs: swing with a knee bend on the back swing.
  rig.legL.rotation.x = walk * s * 0.55;
  rig.legR.rotation.x = -walk * s * 0.55;
  rig.kneeL.rotation.x = walk * Math.max(0, -c) * 0.9 + idle * 0.03;
  rig.kneeR.rotation.x = walk * Math.max(0, c) * 0.9 + idle * 0.03;

  // Arms swing opposite to legs, relaxed elbows.
  rig.armL.rotation.x = -walk * s * 0.5 + idle * Math.sin(t * 1.6 + 1) * 0.03;
  rig.armR.rotation.x = walk * s * 0.5 + idle * Math.sin(t * 1.6) * 0.03;
  rig.elbowL.rotation.x = -0.15 - walk * (0.25 + Math.max(0, s) * 0.3);
  rig.elbowR.rotation.x = -0.15 - walk * (0.25 + Math.max(0, -s) * 0.3);
}
