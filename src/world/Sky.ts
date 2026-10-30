// Sky dome, sun, lights, fog, drifting clouds and the misty void below the platform.
// `setTimeOfDay(t)` takes 0..1 (0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset).
// The MVP keeps a fixed late-afternoon time; the day/night cycle arrives in a later milestone.

import * as THREE from 'three';
import { CONFIG } from '../config';
import { rng } from './textures';

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // always at the far plane
  }
`;

const skyFrag = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uVoid;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uStars;
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0
      ? mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55))
      : mix(uHorizon, uVoid, pow(clamp(-h, 0.0, 1.0), 0.4));
    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSunColor * (pow(sd, 900.0) * 3.0 + pow(sd, 12.0) * 0.35 + pow(sd, 3.0) * 0.08);
    if (uStars > 0.0 && h > 0.0) {
      vec3 cell = floor(d * 220.0);
      float s = step(0.9965, hash(cell));
      col += vec3(s) * uStars * smoothstep(0.0, 0.25, h);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

interface SkyKey {
  t: number;
  zenith: string;
  horizon: string;
  sun: string;
  sunIntensity: number;
  ambient: number;
  stars: number;
}

// Keyframes for the sky through the day. Interpolated by time of day.
const KEYS: SkyKey[] = [
  { t: 0.0, zenith: '#060a18', horizon: '#18203a', sun: '#6f80b0', sunIntensity: 0.15, ambient: 0.22, stars: 1 },
  { t: 0.22, zenith: '#1a2340', horizon: '#5a4a5a', sun: '#ff9c6a', sunIntensity: 0.3, ambient: 0.3, stars: 0.4 },
  { t: 0.28, zenith: '#5a7590', horizon: '#e0a070', sun: '#ffb070', sunIntensity: 1.6, ambient: 0.5, stars: 0 },
  { t: 0.4, zenith: '#5d84a8', horizon: '#c8c4b0', sun: '#fff0d8', sunIntensity: 2.6, ambient: 0.7, stars: 0 },
  { t: 0.6, zenith: '#5a80a2', horizon: '#cfc2a4', sun: '#ffe6c0', sunIntensity: 2.5, ambient: 0.68, stars: 0 },
  { t: 0.72, zenith: '#4c6688', horizon: '#e39a62', sun: '#ff9a50', sunIntensity: 1.7, ambient: 0.5, stars: 0 },
  { t: 0.78, zenith: '#222a48', horizon: '#6a4050', sun: '#ff7a50', sunIntensity: 0.35, ambient: 0.3, stars: 0.4 },
  { t: 1.0, zenith: '#060a18', horizon: '#18203a', sun: '#6f80b0', sunIntensity: 0.15, ambient: 0.22, stars: 1 },
];

export class Sky {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly clouds = new THREE.Group();
  private readonly mist: THREE.Mesh[] = [];
  private readonly fog: THREE.Fog;
  private readonly sunDir = new THREE.Vector3();
  private readonly lightDir = new THREE.Vector3(0, 1, 0);
  private readonly dome: THREE.Mesh;
  private time = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.fog = new THREE.Fog(0xcfc2a4, CONFIG.graphics.fogNear, CONFIG.graphics.fogFar);
    scene.fog = this.fog;

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms: {
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uVoid: { value: new THREE.Color('#2e3138') },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color() },
        uStars: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), this.skyMat);
    this.dome.renderOrder = -1;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    this.hemi = new THREE.HemisphereLight(0xc8d0d8, 0x4a3e30, 0.6);
    this.group.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    const s = this.sun.shadow;
    s.mapSize.set(CONFIG.graphics.shadowMapSize, CONFIG.graphics.shadowMapSize);
    s.camera.left = -28;
    s.camera.right = 28;
    s.camera.top = 28;
    s.camera.bottom = -28;
    s.camera.near = 1;
    s.camera.far = 140;
    s.bias = -0.0004;
    s.normalBias = 0.03;
    s.radius = 3;
    this.group.add(this.sun);
    this.group.add(this.sun.target);

    this.buildClouds();
    this.buildIslets();
    this.buildMist();
    scene.add(this.group);
    this.setTimeOfDay(0.66);
  }

  private buildClouds(): void {
    const r = rng(4242);
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xe8e2d6, flatShading: true, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 26; i++) {
      const cloud = new THREE.Group();
      const puffs = 4 + Math.floor(r() * 5);
      for (let j = 0; j < puffs; j++) {
        const m = new THREE.Mesh(geo, mat);
        const sz = 3 + r() * 5;
        m.scale.set(sz * 1.6, sz * 0.6, sz);
        m.position.set((j - puffs / 2) * 4 + r() * 3, r() * 2, r() * 6 - 3);
        cloud.add(m);
      }
      const ang = r() * Math.PI * 2;
      const dist = 70 + r() * 140;
      cloud.position.set(Math.cos(ang) * dist, -10 + r() * 50, Math.sin(ang) * dist);
      cloud.rotation.y = r() * Math.PI;
      this.clouds.add(cloud);
    }
    this.group.add(this.clouds);
  }

  /** Far-off floating rocks, mostly lost in the fog, to give the sky some depth. */
  private buildIslets(): void {
    const r = rng(777);
    const mat = new THREE.MeshLambertMaterial({ color: 0x5a5046, flatShading: true });
    const top = new THREE.MeshLambertMaterial({ color: 0x4f5a34, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const islet = new THREE.Group();
      const size = 3 + r() * 6;
      const rock = new THREE.Mesh(new THREE.ConeGeometry(size, size * 2.2, 6 + Math.floor(r() * 3), 2), mat);
      rock.rotation.x = Math.PI;
      rock.position.y = -size * 1.1;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(size * 1.02, size, size * 0.3, 7), top);
      islet.add(rock, cap);
      const ang = r() * Math.PI * 2;
      const dist = 90 + r() * 70;
      islet.position.set(Math.cos(ang) * dist, -25 + r() * 35, Math.sin(ang) * dist);
      islet.rotation.y = r() * Math.PI;
      this.group.add(islet);
    }
  }

  private buildMist(): void {
    // Layered translucent planes below the platform suggest an endless misty void.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const r = rng(99);
    for (let i = 0; i < 90; i++) {
      const x = r() * 256;
      const y = r() * 256;
      const rad = 20 + r() * 50;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    for (let i = 0; i < 3; i++) {
      const layerTex = tex.clone();
      layerTex.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({
        map: layerTex,
        color: 0xb8b4ac,
        transparent: true,
        opacity: 0.55 - i * 0.12,
        depthWrite: false,
        fog: true,
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = -18 - i * 14;
      plane.rotation.z = i * 1.3;
      this.mist.push(plane);
      this.group.add(plane);
    }
  }

  setTimeOfDay(t: number): void {
    this.time = ((t % 1) + 1) % 1;
    let a = KEYS[0];
    let b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (this.time >= KEYS[i].t && this.time <= KEYS[i + 1].t) {
        a = KEYS[i];
        b = KEYS[i + 1];
        break;
      }
    }
    const k = (this.time - a.t) / Math.max(1e-6, b.t - a.t);
    const lerpC = (x: string, y: string) => new THREE.Color(x).lerp(new THREE.Color(y), k);
    const zenith = lerpC(a.zenith, b.zenith);
    const horizon = lerpC(a.horizon, b.horizon);
    const sunColor = lerpC(a.sun, b.sun);

    const u = this.skyMat.uniforms;
    (u.uZenith.value as THREE.Color).copy(zenith);
    (u.uHorizon.value as THREE.Color).copy(horizon);
    (u.uSunColor.value as THREE.Color).copy(sunColor);
    u.uStars.value = a.stars + (b.stars - a.stars) * k;
    (u.uVoid.value as THREE.Color).copy(horizon).multiplyScalar(0.45);

    // Sun path: rises in the east (+x), sets in the west, tilted toward +z.
    const ang = (this.time - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(ang), Math.sin(ang), 0.35).normalize();
    // At night the "sun" light becomes moonlight from the opposite side.
    this.lightDir.copy(this.sunDir);
    if (this.sunDir.y < -0.05) this.lightDir.negate();
    (u.uSunDir.value as THREE.Vector3).copy(this.sunDir);

    this.sun.color.copy(sunColor);
    this.sun.intensity = a.sunIntensity + (b.sunIntensity - a.sunIntensity) * k;
    this.hemi.intensity = a.ambient + (b.ambient - a.ambient) * k;
    this.hemi.color.copy(zenith).lerp(new THREE.Color(0xffffff), 0.5);

    this.fog.color.copy(horizon);
    this.scene.background = null;
    for (const m of this.mist) (m.material as THREE.MeshBasicMaterial).color.copy(horizon).multiplyScalar(0.85);
  }

  get timeOfDay(): number {
    return this.time;
  }

  /** Keep the sky centered on the camera and lights aimed around the player. */
  update(dt: number, focus: THREE.Vector3): void {
    this.dome.position.copy(focus);
    this.clouds.rotation.y += dt * 0.004;
    for (let i = 0; i < this.mist.length; i++) {
      const map = (this.mist[i].material as THREE.MeshBasicMaterial).map!;
      map.offset.x += dt * 0.004 * (i + 1);
      map.offset.y += dt * 0.002;
    }
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.lightDir, 60);
  }
}
