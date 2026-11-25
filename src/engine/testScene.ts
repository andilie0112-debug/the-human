import {
  AmbientLight,
  BoxGeometry,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  type Material,
} from 'three';

/** M0 placeholder scene: a floor, a box and a capsule character. */
export function createTestScene(): { scene: Scene; character: Mesh; dispose: () => void } {
  const scene = new Scene();
  scene.background = new Color('#9fc9e8');
  scene.fog = new Fog('#9fc9e8', 30, 70);

  scene.add(new HemisphereLight('#ffffff', '#6b5a45', 0.8));
  scene.add(new AmbientLight('#ffffff', 0.2));
  const sun = new DirectionalLight('#fff4e0', 2.2);
  sun.position.set(6, 10, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const s = sun.shadow.camera;
  s.left = -10; s.right = 10; s.top = 10; s.bottom = -10; s.near = 1; s.far = 30;
  scene.add(sun);

  const floor = new Mesh(new PlaneGeometry(20, 20), new MeshStandardMaterial({ color: '#d8c8a8', roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new GridHelper(20, 20, '#a8977a', '#c2b394');
  grid.position.y = 0.002;
  scene.add(grid);

  const box = new Mesh(new BoxGeometry(1.2, 0.8, 0.8), new MeshStandardMaterial({ color: '#c0603a', roughness: 0.6 }));
  box.position.set(2, 0.4, -1);
  box.castShadow = true;
  box.receiveShadow = true;
  scene.add(box);

  const character = new Mesh(new CapsuleGeometry(0.3, 1.1, 8, 16), new MeshStandardMaterial({ color: '#3a7bc0', roughness: 0.5 }));
  character.position.set(0, 0.85, 0);
  character.castShadow = true;
  const nose = new Mesh(new SphereGeometry(0.08, 12, 8), new MeshStandardMaterial({ color: '#f0d0a0' }));
  nose.position.set(0, 0.45, 0.3); // shows which way the character faces
  character.add(nose);
  scene.add(character);

  const dispose = (): void => {
    scene.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.geometry.dispose();
        const mats: Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose());
      }
    });
    grid.dispose();
  };

  return { scene, character, dispose };
}
