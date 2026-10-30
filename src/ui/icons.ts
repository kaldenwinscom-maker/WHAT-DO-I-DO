// Inventory icons: each item's 3D model is rendered once, lit like a product shot,
// into a transparent image used by the HUD.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ITEMS, type ItemId } from '../data/items';
import { makeItemModel } from '../items/itemModels';
import { STRUCTURES, type StructureId } from '../data/structures';
import { makeStructureModel } from '../build/structureModels';

const SIZE = 128;
const urls = new Map<ItemId, string>();
const structureUrls = new Map<StructureId, string>();

/** Wrap a model so it's centred and fits a unit sphere. */
function normalized(model: THREE.Object3D): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  model.position.sub(c);
  const wrap = new THREE.Group();
  wrap.add(model);
  wrap.scale.setScalar(1 / size);
  const outer = new THREE.Group();
  outer.add(wrap);
  return outer;
}

/** Render every item icon. Call once after assets have loaded. */
export function prepareIcons(): void {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  const key = new THREE.DirectionalLight(0xfff0dc, 2.2);
  key.position.set(2, 3, 2.5);
  const rim = new THREE.DirectionalLight(0xa0b4d0, 1.2);
  rim.position.set(-2.5, 1.5, -2);
  scene.add(key, rim);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 10);
  camera.position.set(1.05, 0.78, 1.28);
  camera.lookAt(0, 0, 0);

  for (const id of Object.keys(ITEMS) as ItemId[]) {
    const model = makeItemModel(id);
    model.rotation.y = -0.35;
    scene.add(model);
    renderer.render(scene, camera);
    urls.set(id, renderer.domElement.toDataURL('image/png'));
    scene.remove(model);
  }
  for (const id of Object.keys(STRUCTURES) as StructureId[]) {
    const model = normalized(makeStructureModel(id));
    model.rotation.y = -0.5;
    scene.add(model);
    renderer.render(scene, camera);
    structureUrls.set(id, renderer.domElement.toDataURL('image/png'));
    scene.remove(model);
  }
  pmrem.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
}

export function itemIconUrl(id: ItemId): string {
  return urls.get(id) ?? '';
}

export function structureIconUrl(id: StructureId): string {
  return structureUrls.get(id) ?? '';
}
