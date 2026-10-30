// Post-processing: ambient occlusion, bloom, ACES tone mapping, a cold washed-out grade,
// vignette and film grain. Heavier effects switch off at lower quality settings.

import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  Effect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import type { QualitySettings } from './quality';

const gradeFrag = /* glsl */ `
  uniform float saturation;
  uniform float contrast;
  uniform vec3 lift;
  uniform vec3 gain;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 c = inputColor.rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, saturation);
    // Flatten contrast around mid-grey, but keep blacks black.
    c = mix(c, (c - 0.45) * contrast + 0.45, smoothstep(0.02, 0.3, l));
    c = c * gain + lift * (1.0 - c) * smoothstep(0.0, 0.25, l);
    outputColor = vec4(max(c, 0.0), inputColor.a);
  }
`;

/** Desaturates, flattens contrast and pushes shadows slightly cold for a weathered look. */
class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', gradeFrag, {
      uniforms: new Map<string, THREE.Uniform>([
        ['saturation', new THREE.Uniform(0.78)],
        ['contrast', new THREE.Uniform(0.94)],
        ['lift', new THREE.Uniform(new THREE.Vector3(0.002, 0.003, 0.006))],
        ['gain', new THREE.Uniform(new THREE.Vector3(0.98, 0.99, 1.0))],
      ]),
    });
  }
}

export class PostFX {
  readonly composer: EffectComposer;
  private readonly ao: N8AOPostPass | null = null;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, quality: QualitySettings) {
    // Tone mapping happens in the effect chain, not the renderer.
    renderer.toneMapping = THREE.NoToneMapping;
    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: quality.msaa,
    });
    this.composer.addPass(new RenderPass(scene, camera));

    if (quality.ao !== 'off') {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const ao = new N8AOPostPass(scene, camera, size.x, size.y);
      ao.configuration.aoRadius = 1.4;
      ao.configuration.distanceFalloff = 0.6;
      ao.configuration.intensity = 2.2;
      ao.configuration.color = new THREE.Color(0x0b0906);
      ao.configuration.halfRes = quality.ao === 'half';
      ao.configuration.gammaCorrection = false;
      ao.setQualityMode(quality.ao === 'full' ? 'Medium' : 'Low');
      this.composer.addPass(ao);
      this.ao = ao;
    }

    const effects: Effect[] = [];
    if (quality.bloom) {
      effects.push(
        new BloomEffect({
          intensity: 0.75,
          luminanceThreshold: 0.9,
          luminanceSmoothing: 0.25,
          mipmapBlur: true,
          radius: 0.65,
        }),
      );
    }
    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));
    effects.push(new GradeEffect());
    effects.push(new VignetteEffect({ offset: 0.32, darkness: 0.55 }));
    const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
    grain.blendMode.opacity.value = 0.09;
    effects.push(grain);
    this.composer.addPass(new EffectPass(camera, ...effects));
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }

  get hasAO(): boolean {
    return this.ao !== null;
  }
}
