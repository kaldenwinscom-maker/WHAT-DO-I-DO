// Sky, sun/moon, fog, mist over the void and drifting dust: everything that sets the mood.
// Time of day: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset (driven by DayClock).

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { QualitySettings } from '../render/quality';
import { rng } from './noise';

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const skyFrag = /* glsl */ `
  uniform sampler2D uHdr;
  uniform float uHdrExposure;
  uniform float uHdrRotation;
  uniform vec3 uTint;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunGlow;
  uniform vec3 uFogColor;
  uniform vec3 uVoidColor;
  uniform float uNight;
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 d = normalize(vDir);
    float a = atan(d.z, d.x) + uHdrRotation;
    vec2 uv = vec2(fract(a * 0.15915494 + 0.5), asin(clamp(max(d.y, 0.02), -1.0, 1.0)) * 0.31830988 + 0.5);
    vec3 sky = texture2D(uHdr, uv).rgb * uHdrExposure * uTint;

    // Night: deep blue gradient + stars.
    vec3 night = mix(vec3(0.004, 0.006, 0.012), vec3(0.012, 0.018, 0.035), 1.0 - clamp(d.y, 0.0, 1.0));
    vec3 cell = floor(d * 320.0);
    vec3 f = fract(d * 320.0) - 0.5;
    float star = step(0.9982, hash(cell)) * smoothstep(0.32, 0.0, length(f)) * smoothstep(0.05, 0.35, d.y);
    night += vec3(star) * (0.4 + 0.6 * hash(cell + 3.0)) * 1.4;
    sky = mix(sky, night, uNight);

    // Sun / moon disc and glow.
    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    sky += uSunColor * (pow(sd, 4000.0) * 40.0 + pow(sd, 24.0) * 0.5 * uSunGlow + pow(sd, 4.0) * 0.12 * uSunGlow);
    float md = max(dot(d, -normalize(uSunDir)), 0.0);
    sky += vec3(0.6, 0.7, 0.9) * pow(md, 2500.0) * 6.0 * uNight;

    // Haze into the fog at the horizon, then the misty void below.
    float haze = 1.0 - smoothstep(-0.02, 0.28, d.y);
    sky = mix(sky, uFogColor, haze * 0.85);
    float below = smoothstep(0.0, -0.35, d.y);
    sky = mix(sky, uVoidColor, below);

    gl_FragColor = vec4(sky, 1.0);
  }
`;

interface Key {
  t: number;
  sun: string; // sun (or moon) light colour
  sunI: number;
  env: number; // HDRI ambient strength
  sky: number; // HDRI sky brightness
  tint: string; // colour grade on the HDRI sky
  fog: string;
  night: number; // 0 day .. 1 night sky
  glow: number; // sun halo strength
}

// Muted, dusty palette. Nights are genuinely dark.
const KEYS: Key[] = [
  { t: 0.0, sun: '#6f84b8', sunI: 0.28, env: 0.05, sky: 0.03, tint: '#5a6a90', fog: '#0a0d13', night: 1, glow: 0 },
  { t: 0.2, sun: '#6f84b8', sunI: 0.2, env: 0.07, sky: 0.08, tint: '#6a6a90', fog: '#161a24', night: 0.85, glow: 0 },
  { t: 0.25, sun: '#ff8448', sunI: 0.9, env: 0.22, sky: 0.45, tint: '#ffad84', fog: '#6b5550', night: 0.25, glow: 1.4 },
  { t: 0.3, sun: '#ffc48c', sunI: 2.3, env: 0.5, sky: 0.8, tint: '#ffdcc0', fog: '#8d877d', night: 0, glow: 0.9 },
  { t: 0.42, sun: '#fff0dc', sunI: 3.0, env: 0.65, sky: 0.95, tint: '#f4f0ea', fog: '#9da09d', night: 0, glow: 0.6 },
  { t: 0.6, sun: '#ffe8cc', sunI: 2.9, env: 0.62, sky: 0.95, tint: '#f6efe4', fog: '#a19f97', night: 0, glow: 0.6 },
  { t: 0.7, sun: '#ffc282', sunI: 2.2, env: 0.5, sky: 0.8, tint: '#ffd6b0', fog: '#a08f7c', night: 0, glow: 1 },
  { t: 0.75, sun: '#ff6e30', sunI: 1.0, env: 0.24, sky: 0.5, tint: '#ff9466', fog: '#76574a', night: 0.2, glow: 1.6 },
  { t: 0.8, sun: '#6f84b8', sunI: 0.1, env: 0.07, sky: 0.1, tint: '#6a5a88', fog: '#1e1c26', night: 0.8, glow: 0.3 },
  { t: 1.0, sun: '#6f84b8', sunI: 0.28, env: 0.05, sky: 0.03, tint: '#5a6a90', fog: '#0a0d13', night: 1, glow: 0 },
];

export class Sky {
  readonly group = new THREE.Group();
  readonly sun = new THREE.DirectionalLight(0xffffff, 2);
  readonly hemi = new THREE.HemisphereLight(0x8090a0, 0x3a3228, 0.2);
  /** 0 at night .. 1 at full day; other systems use it (dust, monolith glow, AI later). */
  daylight = 1;
  private readonly fog = new THREE.FogExp2(0x9da09d, CONFIG.graphics.fogDensity);
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly dome: THREE.Mesh;
  private readonly mist: THREE.Mesh[] = [];
  private readonly dust: THREE.Points;
  private readonly dustMat: THREE.PointsMaterial;
  private readonly sunDir = new THREE.Vector3();
  private readonly lightDir = new THREE.Vector3(0, 1, 0);
  private readonly shadowExtent: number;
  private time = 0;

  constructor(
    private readonly scene: THREE.Scene,
    hdr: THREE.Texture,
    quality: QualitySettings,
  ) {
    scene.fog = this.fog;
    this.shadowExtent = quality.shadowExtent;

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms: {
        uHdr: { value: hdr },
        uHdrExposure: { value: 1 },
        uHdrRotation: { value: 2.2 },
        uTint: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color() },
        uSunGlow: { value: 1 },
        uFogColor: { value: new THREE.Color() },
        uVoidColor: { value: new THREE.Color() },
        uNight: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(800, 48, 24), this.skyMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    this.group.add(this.hemi);
    this.sun.castShadow = true;
    const s = this.sun.shadow;
    s.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    const e = quality.shadowExtent;
    Object.assign(s.camera, { left: -e, right: e, top: e, bottom: -e, near: 1, far: 160 });
    s.camera.updateProjectionMatrix();
    s.bias = -0.0003;
    s.normalBias = 0.04;
    s.radius = 4;
    this.group.add(this.sun, this.sun.target);

    this.buildMist();
    this.dustMat = new THREE.PointsMaterial({
      size: 0.035,
      map: softDotTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
      color: 0xd8cbb4,
      fog: true,
    });
    this.dust = this.buildDust(quality.dustMotes);
    this.group.add(this.dust);

    scene.add(this.group);
    this.setTimeOfDay(0.3);
  }

  private buildMist(): void {
    // Big soft cloud layers drifting under the island read as fog filling the void.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const r = rng(99);
    for (let i = 0; i < 70; i++) {
      const x = r() * 512;
      const y = r() * 512;
      const rad = 40 + r() * 130;
      for (const [ox, oy] of [
        [0, 0],
        [512, 0],
        [-512, 0],
        [0, 512],
        [0, -512],
      ]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        g.addColorStop(0, 'rgba(255,255,255,0.3)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 512, 512);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    // Soft circular falloff so the layers fade out long before their edges.
    const fc = document.createElement('canvas');
    fc.width = fc.height = 256;
    const fctx = fc.getContext('2d')!;
    const fg = fctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    fg.addColorStop(0, '#fff');
    fg.addColorStop(0.35, '#ccc');
    fg.addColorStop(1, '#000');
    fctx.fillStyle = fg;
    fctx.fillRect(0, 0, 256, 256);
    const falloff = new THREE.CanvasTexture(fc);
    for (let i = 0; i < 4; i++) {
      const layer = tex.clone();
      layer.needsUpdate = true;
      layer.repeat.set(1.5 + i * 0.7, 1.5 + i * 0.7);
      const mat = new THREE.MeshBasicMaterial({
        map: layer,
        alphaMap: falloff,
        transparent: true,
        opacity: 0.9 - i * 0.15,
        depthWrite: false,
        fog: false,
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.rotation.z = i * 1.7;
      plane.position.y = -12 - i * 11;
      plane.renderOrder = -5 + i;
      this.mist.push(plane);
      this.group.add(plane);
    }
  }

  private buildDust(count: number): THREE.Points {
    const pos = new Float32Array(count * 3);
    const r = rng(31);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (r() - 0.5) * 24;
      pos[i * 3 + 1] = (r() - 0.5) * 12;
      pos[i * 3 + 2] = (r() - 0.5) * 24;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, this.dustMat);
    pts.frustumCulled = false;
    return pts;
  }

  get timeOfDay(): number {
    return this.time;
  }

  setTimeOfDay(t: number): void {
    this.time = ((t % 1) + 1) % 1;
    let a = KEYS[0];
    let b = KEYS[1];
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (this.time >= KEYS[i].t && this.time <= KEYS[i + 1].t) {
        a = KEYS[i];
        b = KEYS[i + 1];
        break;
      }
    }
    const k = THREE.MathUtils.smoothstep((this.time - a.t) / Math.max(1e-6, b.t - a.t), 0, 1);
    const lerp = (x: number, y: number) => x + (y - x) * k;
    const col = (x: string, y: string) => new THREE.Color(x).lerp(new THREE.Color(y), k);

    const fogColor = col(a.fog, b.fog);
    const night = lerp(a.night, b.night);
    this.daylight = 1 - night;

    // Sun path: rises in the east (+x), arcs south (+z), sets in the west.
    const ang = (this.time - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(ang), Math.sin(ang), 0.42).normalize();
    this.lightDir.copy(this.sunDir);
    if (this.sunDir.y < 0.02) this.lightDir.negate(); // moonlight from the other side

    const u = this.skyMat.uniforms;
    (u.uTint.value as THREE.Color).copy(col(a.tint, b.tint));
    u.uHdrExposure.value = lerp(a.sky, b.sky);
    (u.uSunDir.value as THREE.Vector3).copy(this.sunDir);
    (u.uSunColor.value as THREE.Color).copy(col(a.sun, b.sun)).multiplyScalar(this.sunDir.y > -0.03 ? 1 : 0);
    u.uSunGlow.value = lerp(a.glow, b.glow);
    (u.uFogColor.value as THREE.Color).copy(fogColor);
    (u.uVoidColor.value as THREE.Color).copy(fogColor).multiplyScalar(0.4);
    u.uNight.value = night;

    this.sun.color.copy(col(a.sun, b.sun));
    // Fade the light out as the sun crosses the horizon, so shadows don't flip abruptly.
    const horizonFade = THREE.MathUtils.smoothstep(Math.abs(this.sunDir.y), 0.0, 0.08);
    this.sun.intensity = lerp(a.sunI, b.sunI) * horizonFade;
    this.scene.environmentIntensity = lerp(a.env, b.env);
    this.hemi.intensity = 0.05 + this.daylight * 0.15;
    this.hemi.color.copy(fogColor).lerp(new THREE.Color(0xffffff), 0.3);

    this.fog.color.copy(fogColor);
    this.fog.density = CONFIG.graphics.fogDensity * (1 + night * 0.8);
    this.mist.forEach((m, i) => (m.material as THREE.MeshBasicMaterial).color.copy(fogColor).multiplyScalar(1.45 - i * 0.18));
    this.dustMat.opacity = 0.18 + this.daylight * 0.35;
    this.dustMat.color.copy(col(a.sun, b.sun)).lerp(new THREE.Color(0xc8bca8), 0.6);
  }

  /** Keep sky, light and dust centred on the camera. Time is set by the DayClock. */
  update(dt: number, camera: THREE.Camera): void {
    const focus = camera.position;
    this.dome.position.copy(focus);

    // Shadow camera follows the player, snapped to texels to avoid shimmering edges.
    const texel = (this.shadowExtent * 2) / this.sun.shadow.mapSize.x;
    const snap = (v: number) => Math.round(v / texel) * texel;
    this.sun.target.position.set(snap(focus.x), snap(focus.y), snap(focus.z));
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.lightDir, 60);

    for (let i = 0; i < this.mist.length; i++) {
      const map = (this.mist[i].material as THREE.MeshBasicMaterial).map!;
      map.offset.x += dt * 0.0012 * (i + 1);
      map.offset.y += dt * 0.0007 * (2 - i * 0.3);
    }

    // Dust: drift slowly and wrap around the camera.
    const pos = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const t = performance.now() * 0.001;
    for (let i = 0; i < pos.count; i++) {
      const j = i * 3;
      arr[j] += (0.12 + Math.sin(t * 0.3 + i) * 0.05) * dt;
      arr[j + 1] += Math.sin(t * 0.5 + i * 1.7) * 0.03 * dt;
      arr[j + 2] += Math.cos(t * 0.2 + i * 0.7) * 0.06 * dt;
      for (let ax = 0; ax < 3; ax++) {
        const half = ax === 1 ? 6 : 12;
        const rel = arr[j + ax] - focus.getComponent(ax);
        if (rel > half) arr[j + ax] -= half * 2;
        else if (rel < -half) arr[j + ax] += half * 2;
      }
    }
    pos.needsUpdate = true;
  }
}

function softDotTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
