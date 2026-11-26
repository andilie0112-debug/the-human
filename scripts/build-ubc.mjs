// Builds the game's realistic character files from Quaternius' Universal Base Characters (CC0)
// and the Universal Animation Library (CC0). Both share one 65-bone humanoid skeleton.
//
// Usage: node scripts/build-ubc.mjs   (or: npm run assets:ubc)
// Output:
//   public/assets/characters/ubc_male.glb, ubc_female.glb  body + eyes + eyebrows + every hairstyle
//                                                           (hair meshes are hidden/shown at runtime)
//   public/assets/characters/ubc_anims.glb, ubc_anims2.glb  skeleton + selected animation clips only
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { copyToDocument, dedup, meshopt, prune, resample, textureCompress, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { smoothSkinTexture } from './lib/smooth-skin.mjs';

const UBC = 'assets-src/quaternius-universal-base-characters';
const UAL = 'assets-src/quaternius-universal-animation-library/UAL1_Standard.glb';
const UAL2 = 'assets-src/quaternius-universal-animation-library-2/UAL2_Standard.glb';
const OUT = 'public/assets/characters';

const BODIES = [
  {
    out: 'ubc_male.glb',
    src: 'Superhero_Male_FullBody.gltf',
    skinFrom: 'T_Superhero_Male_Dark.png',
    skinTo: 'T_Superhero_Male_Ligh.png',
    hair: ['Hair_SimpleParted', 'Hair_Buzzed', 'Hair_Beard'],
  },
  {
    out: 'ubc_female.glb',
    src: 'Superhero_Female_FullBody.gltf',
    skinFrom: 'T_Superhero_Female_Dark_BaseColor.png',
    skinTo: 'T_Superhero_Female_Light_BaseColor.png',
    hair: ['Hair_Long', 'Hair_Buns', 'Hair_BuzzedFemale', 'Hair_SimpleParted'],
  },
];

// Clips that fit everyday life. Weapons, combat and death clips are left out (GDD: no violence).
const CLIPS = [
  'Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop',
  'Sitting_Enter', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'Sitting_Exit',
  'Interact', 'PickUp_Table', 'Fixing_Kneeling', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop',
  'Driving_Loop', 'Dance_Loop', 'Push_Loop', 'Swim_Idle_Loop', 'Swim_Fwd_Loop',
  'Jump_Start', 'Jump_Loop', 'Jump_Land',
];

// Everyday clips from the second library (same skeleton): opening the fridge, eating and drinking,
// phone calls, waiting, nodding, carrying bags, getting out of bed, watering plants.
const CLIPS2 = [
  'Chest_Open', 'Consume', 'Idle_TalkingPhone_Loop', 'Idle_FoldArms_Loop', 'Idle_Rail_Loop', 'Idle_Rail_Call',
  'Idle_No_Loop', 'Yes', 'Walk_Carry_Loop', 'LayToIdle', 'Farm_Watering', 'Farm_PlantSeed', 'Farm_Harvest',
];

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const compressTextures = textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 });

for (const body of BODIES) {
  const doc = await io.read(join(UBC, 'body', body.src));
  const root = doc.getRoot();

  // Body skin and the node that holds the body mesh (hair goes next to it).
  const skin = root.listSkins()[0];
  const skinTex = root.listTextures().find((t) => t.getURI() === body.skinFrom);
  if (!skinTex) throw new Error(`texture ${body.skinFrom} not found in ${body.src}`);
  const bodyNode = root.listNodes().find((n) => n.getMesh()?.listPrimitives().some((p) => p.getMaterial()?.getBaseColorTexture() === skinTex));
  const parent = bodyNode.getParentNode();

  // Light skin texture with the painted muscle shading smoothed away (face and hands stay sharp).
  // Skin tones are applied as a tint at runtime.
  const jointNames = skin.listJoints().map((jn) => jn.getName());
  const smoothed = await smoothSkinTexture(await readFile(join(UBC, 'body', body.skinTo)), bodyNode.getMesh().listPrimitives()[0], jointNames);
  skinTex.setImage(smoothed).setURI(body.skinTo).setMimeType('image/png');

  for (const hairName of body.hair) {
    const hairDoc = await io.read(join(UBC, 'hair', `${hairName}.gltf`));
    const hairNode = hairDoc.getRoot().listNodes().find((n) => n.getMesh());
    const map = copyToDocument(doc, hairDoc, [hairNode.getMesh()]);
    const mesh = map.get(hairNode.getMesh());
    mesh.setName(hairName);
    const node = doc.createNode(hairName).setMesh(mesh).setSkin(skin);
    if (parent) parent.addChild(node);
    else root.listScenes()[0].addChild(node);
  }

  await doc.transform(unpartition(), prune(), dedup(), compressTextures, meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(join(OUT, body.out), doc);
  console.log('wrote', body.out);
}

// Animation files: keep the skeleton and the chosen clips, drop the mannequin mesh.
for (const [src, clips, out] of [[UAL, CLIPS, 'ubc_anims.glb'], [UAL2, CLIPS2, 'ubc_anims2.glb']]) {
  const doc = await io.read(src);
  const root = doc.getRoot();
  const keep = new Set(clips);
  for (const anim of root.listAnimations()) if (!keep.has(anim.getName())) anim.dispose();
  const missing = clips.filter((c) => !root.listAnimations().some((a) => a.getName() === c));
  if (missing.length) throw new Error(`missing clips: ${missing.join(', ')}`);
  for (const node of root.listNodes()) {
    node.setMesh(null);
    node.setSkin(null);
  }
  await doc.transform(prune(), resample(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(join(OUT, out), doc);
  console.log('wrote', out, 'with', root.listAnimations().length, 'clips');
}
