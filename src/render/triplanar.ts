// Triplanar PBR on top of MeshStandardMaterial.
// Organic meshes (rocks, islands) have no clean UVs, so textures are projected along the
// three world axes and blended by the surface normal. An optional "top" layer (moss, soil,
// snow) is blended onto upward-facing surfaces. Works with InstancedMesh too.

import * as THREE from 'three';
import { Assets, type TextureSetId } from './Assets';

export interface TriLayer {
  set: TextureSetId;
  /** Texture repeats per world unit. */
  scale: number;
  tint?: THREE.ColorRepresentation;
  normalStrength?: number;
}

export interface TriplanarOptions {
  base: TriLayer;
  top?: TriLayer & {
    /** 0..1 how much of the up-facing surface gets the top layer. */
    amount: number;
    /** Normal.y above which the top layer starts (lower = creeps further down the sides). */
    threshold?: number;
  };
  roughness?: number;
  /** Project in object space (textures stick to moving objects) instead of world space. */
  objectSpace?: boolean;
  /** Extra GLSL / uniforms for special materials like the Monolith. */
  extend?: ShaderExtension;
  side?: THREE.Side;
}

export interface ShaderExtension {
  uniforms: Record<string, THREE.IUniform>;
  /** Declarations added to both shaders' headers. */
  vertexHeader?: string;
  fragmentHeader?: string;
  /** Runs in the vertex shader before projection; may modify `transformed`. */
  vertexBody?: string;
  /** Runs after lighting inputs are known; may modify `diffuseColor` and `totalEmissiveRadiance`. */
  fragmentBody?: string;
}

const COMMON = /* glsl */ `
  varying vec3 vTriPos;
  varying vec3 vTriNrm;
  varying vec3 vObjPos;
  #ifdef TRI_OBJECT
    varying mat3 vTriRot;
  #endif
`;

const FRAG_FUNCS = /* glsl */ `
  uniform sampler2D triBaseDiff;
  uniform sampler2D triBaseNor;
  uniform sampler2D triBaseArm;
  uniform float triBaseScale;
  uniform vec3 triBaseTint;
  uniform float triBaseNormal;
  #ifdef TRI_TOP
    uniform sampler2D triTopDiff;
    uniform sampler2D triTopNor;
    uniform sampler2D triTopArm;
    uniform float triTopScale;
    uniform vec3 triTopTint;
    uniform float triTopNormal;
    uniform float triTopAmount;
    uniform float triTopThreshold;
  #endif

  vec3 triWeights(vec3 n) {
    vec3 w = pow(abs(n), vec3(4.0));
    return w / (w.x + w.y + w.z);
  }

  vec4 triSample(sampler2D t, vec3 p, vec3 w, float s) {
    return texture2D(t, p.zy * s) * w.x + texture2D(t, p.xz * s) * w.y + texture2D(t, p.xy * s) * w.z;
  }

  // Whiteout-blended triplanar normal mapping (world space in, world space out).
  vec3 triNormal(sampler2D t, vec3 p, vec3 n, vec3 w, float s, float strength) {
    vec3 tx = texture2D(t, p.zy * s).xyz * 2.0 - 1.0;
    vec3 ty = texture2D(t, p.xz * s).xyz * 2.0 - 1.0;
    vec3 tz = texture2D(t, p.xy * s).xyz * 2.0 - 1.0;
    tx.xy *= strength; ty.xy *= strength; tz.xy *= strength;
    tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
    ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
    tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
    return normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
  }
`;

let uid = 0;

export function makeTriplanarMaterial(opts: TriplanarOptions): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ roughness: opts.roughness ?? 1, metalness: 0, side: opts.side ?? THREE.FrontSide });
  const base = Assets.set(opts.base.set);
  const uniforms: Record<string, THREE.IUniform> = {
    triBaseDiff: { value: base.diff },
    triBaseNor: { value: base.nor },
    triBaseArm: { value: base.arm },
    triBaseScale: { value: opts.base.scale },
    triBaseTint: { value: new THREE.Color(opts.base.tint ?? 0xffffff) },
    triBaseNormal: { value: opts.base.normalStrength ?? 1 },
    ...(opts.extend?.uniforms ?? {}),
  };
  if (opts.top) {
    const top = Assets.set(opts.top.set);
    Object.assign(uniforms, {
      triTopDiff: { value: top.diff },
      triTopNor: { value: top.nor },
      triTopArm: { value: top.arm },
      triTopScale: { value: opts.top.scale },
      triTopTint: { value: new THREE.Color(opts.top.tint ?? 0xffffff) },
      triTopNormal: { value: opts.top.normalStrength ?? 1 },
      triTopAmount: { value: opts.top.amount },
      triTopThreshold: { value: opts.top.threshold ?? 0.45 },
    });
  }
  mat.userData.triUniforms = uniforms;
  mat.defines = { ...(mat.defines ?? {}) };
  if (opts.top) mat.defines.TRI_TOP = '';
  if (opts.objectSpace) mat.defines.TRI_OBJECT = '';
  const ext = opts.extend;

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}\n${ext?.vertexHeader ?? ''}`)
      .replace(
        '#include <project_vertex>',
        /* glsl */ `
        vObjPos = position;
        ${ext?.vertexBody ?? ''}
        #include <project_vertex>
        {
          vec4 tp = vec4(transformed, 1.0);
          vec3 tn = objectNormal;
          #ifdef TRI_OBJECT
            vTriPos = tp.xyz;
            vTriNrm = normalize(tn);
            vTriRot = mat3(normalize(modelMatrix[0].xyz), normalize(modelMatrix[1].xyz), normalize(modelMatrix[2].xyz));
          #else
            #ifdef USE_INSTANCING
              tp = instanceMatrix * tp;
              tn = mat3(instanceMatrix) * tn;
            #endif
            vTriPos = (modelMatrix * tp).xyz;
            vTriNrm = normalize(mat3(modelMatrix) * tn);
          #endif
        }
        `,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}\n${FRAG_FUNCS}\n${ext?.fragmentHeader ?? ''}`)
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        #include <map_fragment>
        vec3 triN = normalize(vTriNrm);
        vec3 triW = triWeights(triN);
        vec4 triAlb = triSample(triBaseDiff, vTriPos, triW, triBaseScale);
        vec4 triArm = triSample(triBaseArm, vTriPos, triW, triBaseScale);
        vec3 triAlbedo = triAlb.rgb * triBaseTint;
        float triTopMask = 0.0;
        #ifdef TRI_TOP
          vec4 topAlb = triSample(triTopDiff, vTriPos, triW, triTopScale);
          vec4 topArm = triSample(triTopArm, vTriPos, triW, triTopScale);
          // Break up the edge with the base texture's brightness so it isn't a clean line.
          float edge = triN.y + (triAlb.g - 0.35) * 0.9;
          triTopMask = smoothstep(triTopThreshold, triTopThreshold + 0.22, edge) * triTopAmount;
          triAlbedo = mix(triAlbedo, topAlb.rgb * triTopTint, triTopMask);
          triArm = mix(triArm, topArm, triTopMask);
        #endif
        diffuseColor.rgb *= triAlbedo;
        `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        roughnessFactor *= triArm.g;
        `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        #include <normal_fragment_maps>
        {
          vec3 nW = triNormal(triBaseNor, vTriPos, triN, triW, triBaseScale, triBaseNormal);
          #ifdef TRI_TOP
            vec3 nTop = triNormal(triTopNor, vTriPos, triN, triW, triTopScale, triTopNormal);
            nW = normalize(mix(nW, nTop, triTopMask));
          #endif
          #ifdef TRI_OBJECT
            nW = normalize(vTriRot * nW);
          #endif
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
          #ifdef DOUBLE_SIDED
            normal *= faceDirection;
          #endif
        }
        `,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `
        #include <emissivemap_fragment>
        ${ext?.fragmentBody ?? ''}
        `,
      )
      .replace(
        '#include <aomap_fragment>',
        /* glsl */ `
        #include <aomap_fragment>
        reflectedLight.indirectDiffuse *= triArm.r;
        reflectedLight.indirectSpecular *= triArm.r;
        `,
      );
  };
  // Each material variant needs its own program (different defines / injected code).
  const key = `tri-${opts.top ? 'top' : 'base'}-${opts.objectSpace ? 'obj' : 'world'}-${ext ? ++uid : 0}`;
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** Swap a material's texture layers in place (used when the Monolith changes phase). */
export function setTriLayers(mat: THREE.MeshStandardMaterial, base: TriLayer, top?: TriLayer & { amount: number; threshold?: number }): void {
  const u = mat.userData.triUniforms as Record<string, THREE.IUniform>;
  const b = Assets.set(base.set);
  u.triBaseDiff.value = b.diff;
  u.triBaseNor.value = b.nor;
  u.triBaseArm.value = b.arm;
  u.triBaseScale.value = base.scale;
  (u.triBaseTint.value as THREE.Color).set(base.tint ?? 0xffffff);
  u.triBaseNormal.value = base.normalStrength ?? 1;
  if (u.triTopDiff) {
    if (top) {
      const t = Assets.set(top.set);
      u.triTopDiff.value = t.diff;
      u.triTopNor.value = t.nor;
      u.triTopArm.value = t.arm;
      u.triTopScale.value = top.scale;
      (u.triTopTint.value as THREE.Color).set(top.tint ?? 0xffffff);
      u.triTopNormal.value = top.normalStrength ?? 1;
      u.triTopAmount.value = top.amount;
      u.triTopThreshold.value = top.threshold ?? 0.45;
    } else {
      u.triTopAmount.value = 0;
    }
  }
}
