// Loads the CC0 PBR texture sets and the HDR sky (see public/CREDITS.md).
// Everything is loaded once at startup, behind the loading screen.

import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export const TEXTURE_SETS = ['rock_face', 'mossy_rock', 'forrest_ground_01', 'bark_brown_02', 'dark_rock_02', 'snow_02', 'brown_planks_04'] as const;
export type TextureSetId = (typeof TEXTURE_SETS)[number];

/** A PBR texture set: albedo (sRGB), OpenGL normal map, and packed AO/Roughness/Metal. */
export interface PbrSet {
  diff: THREE.Texture;
  nor: THREE.Texture;
  arm: THREE.Texture;
}

class AssetStore {
  private sets = new Map<TextureSetId, PbrSet>();
  skyHdr: THREE.DataTexture | null = null;
  private anisotropy = 4;

  set(id: TextureSetId): PbrSet {
    const s = this.sets.get(id);
    if (!s) throw new Error(`Texture set not loaded: ${id}`);
    return s;
  }

  async loadAll(renderer: THREE.WebGLRenderer, onProgress: (frac: number) => void): Promise<void> {
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => onProgress(loaded / total);
    const texLoader = new THREE.TextureLoader(manager);
    const base = import.meta.env.BASE_URL;

    const load = (url: string, srgb: boolean) =>
      texLoader.loadAsync(base + url).then((t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = this.anisotropy;
        return t;
      });

    const setPromises = TEXTURE_SETS.map(async (id) => {
      const [diff, nor, arm] = await Promise.all([
        load(`textures/${id}/diff.jpg`, true),
        load(`textures/${id}/nor.jpg`, false),
        load(`textures/${id}/arm.jpg`, false),
      ]);
      this.sets.set(id, { diff, nor, arm });
    });

    const hdrPromise = new HDRLoader(manager)
      .setDataType(THREE.FloatType)
      .loadAsync(base + 'hdri/sky_1k.hdr')
      .then((tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        // The HDRI's own sun would fight our moving sun, so squash its hotspot.
        const d = tex.image.data as Float32Array;
        for (let i = 0; i < d.length; i += 4) {
          const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          if (l > 3) {
            const k = 3 / l;
            d[i] *= k;
            d[i + 1] *= k;
            d[i + 2] *= k;
          }
        }
        tex.needsUpdate = true;
        this.skyHdr = tex;
      });

    await Promise.all([...setPromises, hdrPromise]);
  }
}

export const Assets = new AssetStore();
