/* Three.js presentation layer.

   The game is played on a flat 10x20 matrix -- that is what Tetris is, and it
   is what keeps it readable at speed -- but everything around it is real 3D:
   bevelled clear-coated blocks lit by an environment map, a well you can view
   flat, tilted or with a live "dynamic" camera, a back panel that catches the
   colour and shadow of the blocks in front of it, bloom, a nebula sky, a star
   tunnel, a synthwave floor and physical particle bursts.

   The renderer never decides anything about the game. Each frame it reads the
   Game's public state and reacts to the events the Game emitted. */

import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, Vector2, Vector3, Quaternion, Euler, Object3D, Group,
  InstancedMesh, InstancedBufferAttribute, BoxGeometry, PlaneGeometry, RingGeometry, SphereGeometry,
  BufferGeometry, Float32BufferAttribute, MeshPhysicalMaterial, MeshBasicMaterial, ShaderMaterial,
  Points, Mesh, CanvasTexture, DataTexture, RGBAFormat, LinearFilter, SRGBColorSpace, ACESFilmicToneMapping,
  HalfFloatType, WebGLRenderTarget, AdditiveBlending, BackSide, PMREMGenerator, FogExp2, Raycaster,
  DynamicDrawUsage, HemisphereLight, DirectionalLight, PointLight,
  EffectComposer, RenderPass, UnrealBloomPass, OutputPass, RoundedBoxGeometry, RoomEnvironment
} from '../vendor/three.js';
import { SHAPES, TYPES, COLORS, BOX, idType } from './pieces.js';
import { COLS, VISIBLE, LINE_CLEAR_DELAY, GREY } from './engine.js';

const DRAW_ROWS = 24;                 // matrix rows ever drawn (20 visible + spawn area)
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

export const THEMES = [
  { name: 'Neon', accent: 0x22e6ff, a: 0x0b1440, b: 0x2a0b4a, glow: 0x6a5cff },
  { name: 'Magenta', accent: 0xff3df0, a: 0x1f0a3a, b: 0x3b0a2a, glow: 0xff5ab4 },
  { name: 'Sunset', accent: 0xff8a2a, a: 0x2a0d18, b: 0x3a1a08, glow: 0xff4a3a },
  { name: 'Aurora', accent: 0x3dffb0, a: 0x04211f, b: 0x0a1f3a, glow: 0x28d7ff },
  { name: 'Gold', accent: 0xffd23a, a: 0x1d1405, b: 0x2c0c1c, glow: 0xff9d2a },
  { name: 'Abyss', accent: 0x4d8bff, a: 0x050d2a, b: 0x0a2a3a, glow: 0x22c8ff },
  { name: 'Crimson', accent: 0xff4a6e, a: 0x2a0512, b: 0x1a0830, glow: 0xff2a55 },
  { name: 'Acid', accent: 0xa6ff3d, a: 0x0a1a08, b: 0x06203a, glow: 0x3dffd0 },
  { name: 'Ember', accent: 0xb86bff, a: 0x140828, b: 0x2a0e08, glow: 0xff8a3d },
  { name: 'Ice', accent: 0xdff6ff, a: 0x0a1624, b: 0x1a1f3a, glow: 0x9ad8ff }
];
export const themeFor = (level) => THEMES[(Math.max(1, level) - 1) % THEMES.length];

/* Camera presets. yaw/pitch in degrees; `sway` enables the live camera. */
export const VIEWS = {
  flat: { yaw: 0, pitch: 0, fov: 12, sway: 0 },
  tilt: { yaw: -16, pitch: 7, fov: 36, sway: 0 },
  dynamic: { yaw: -12, pitch: 6, fov: 42, sway: 1 },
  showcase: { yaw: -24, pitch: 9, fov: 40, sway: 0 }
};

const QUALITY = {
  high: { ratio: 2, bloom: true, samples: 4, particles: 1400, octaves: 5 },
  medium: { ratio: 1.5, bloom: true, samples: 2, particles: 900, octaves: 4 },
  low: { ratio: 1, bloom: false, samples: 0, particles: 500, octaves: 3 }
};

const cellX = (x) => x - (COLS - 1) / 2;
const cellY = (y) => y - (VISIBLE - 1) / 2;

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

/* ---------- procedural textures ---------- */

function gemTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#9a9a9a';
  g.fillRect(0, 0, s, s);
  const face = g.createLinearGradient(0, 0, s, s);
  face.addColorStop(0, '#ffffff');
  face.addColorStop(0.45, '#e2e2e2');
  face.addColorStop(1, '#a0a0a0');
  g.fillStyle = face;
  g.fillRect(14, 14, s - 28, s - 28);
  const inner = g.createLinearGradient(0, s, s, 0);
  inner.addColorStop(0, '#c8c8c8');
  inner.addColorStop(1, '#f4f4f4');
  g.fillStyle = inner;
  g.fillRect(52, 52, s - 104, s - 104);
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 4;
  g.strokeRect(50, 50, s - 100, s - 100);
  const hi = g.createRadialGradient(70, 64, 4, 70, 64, 120);
  hi.addColorStop(0, 'rgba(255,255,255,0.75)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hi;
  g.fillRect(0, 0, s, s);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ---------- shaders ---------- */

const NOISE = /* glsl */`
  float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise3(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
                   mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
                   mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < OCTAVES; i++) { v += a * noise3(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return v;
  }
`;

function skyMaterial(octaves) {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    defines: { OCTAVES: octaves },
    uniforms: {
      uA: { value: new Color() }, uB: { value: new Color() }, uGlow: { value: new Color() },
      uTime: { value: 0 }, uDanger: { value: 0 }, uPulse: { value: 0 }
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uA, uB, uGlow;
      uniform float uTime, uDanger, uPulse;
      varying vec3 vDir;
      ${NOISE}
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y * 0.5 + 0.5;
        vec3 col = mix(uB * 0.55, uA * 0.9, smoothstep(0.15, 0.85, h));
        vec3 q = d * 2.2 + vec3(uTime * 0.012, -uTime * 0.007, uTime * 0.004);
        float n = fbm(q);
        float n2 = fbm(q * 1.9 + n * 1.6 + vec3(0.0, uTime * 0.01, 0.0));
        col += uGlow * pow(n2, 2.6) * 1.0;
        col += uA * pow(n, 3.0) * 0.9;
        // A soft bright band behind the well.
        col += uGlow * 0.18 * exp(-pow(d.y * 3.0, 2.0)) * smoothstep(0.2, -0.9, d.z);
        float pulse = 0.6 + 0.4 * sin(uTime * 4.0);
        col = mix(col, vec3(0.45, 0.02, 0.06), uDanger * 0.35 * pulse);
        col *= 1.0 + uPulse;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}

function starMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uTravel: { value: 0 }, uPixel: { value: 1 }, uColor: { value: new Color(0xcfe0ff) }, uStretch: { value: 0 } },
    vertexShader: /* glsl */`
      uniform float uTime, uTravel, uPixel;
      attribute float aSize, aPhase;
      varying float vA;
      void main() {
        vec3 p = position;
        p.z = mod(p.z + uTravel, 260.0) - 220.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.85 + 0.15 * sin(uTime * (1.5 + aPhase * 2.0) + aPhase * 40.0);
        gl_PointSize = aSize * uPixel * (70.0 / max(1.0, -mv.z));
        vA = tw * smoothstep(-2.0, -14.0, mv.z) * smoothstep(-230.0, -150.0, p.z);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a = a * a;
        gl_FragColor = vec4(uColor * a * vA * 1.8, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}

function floorMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: new Color() }, uTravel: { value: 0 }, uDanger: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uTravel, uDanger;
      varying vec3 vW;
      void main() {
        vec2 g = vW.xz * 0.2;
        g.y += uTravel * 0.2;
        vec2 fw = fwidth(g);
        vec2 a = smoothstep(vec2(0.0), fw * 1.6, abs(fract(g - 0.5) - 0.5));
        float line = 1.0 - min(a.x, a.y);
        float dist = length(vW.xz * vec2(1.0, 0.8));
        float fade = exp(-dist * 0.02) * smoothstep(0.0, 18.0, dist + 6.0);
        vec3 c = mix(uColor, vec3(1.0, 0.1, 0.2), uDanger * 0.6);
        gl_FragColor = vec4(c * line * fade * 0.9, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}

function panelMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uBoard: { value: null }, uAccent: { value: new Color() }, uTime: { value: 0 }, uDanger: { value: 0 },
      uGrid: { value: 1 }, uCol: { value: new Vector2(-9, -9) }, uLightColor: { value: new Color(0, 0, 0) },
      uLightPos: { value: new Vector2(0, 30) }, uWave: { value: 0 }
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uBoard;
      uniform vec3 uAccent, uLightColor;
      uniform float uTime, uDanger, uGrid, uWave;
      uniform vec2 uCol, uLightPos;
      varying vec2 vUv;
      void main() {
        vec2 cell = vUv * vec2(10.0, 20.0);
        vec3 col = mix(vec3(0.0021, 0.0027, 0.0103), vec3(0.004, 0.005, 0.029), vUv.y);

        vec2 f = abs(fract(cell) - 0.5);
        vec2 w = fwidth(cell);
        vec2 l = smoothstep(vec2(0.5) - w * 1.4, vec2(0.5), f);
        col += uAccent * max(l.x, l.y) * 0.022 * uGrid;
        float dots = smoothstep(0.5 - w.x * 2.5, 0.5, f.x) * smoothstep(0.5 - w.y * 2.5, 0.5, f.y);
        col += uAccent * dots * 0.06 * uGrid;

        if (cell.x >= uCol.x && cell.x <= uCol.y) col += uAccent * 0.012;

        vec2 texel = vec2(0.1, 1.0 / 40.0);
        vec2 tuv = vec2(cell.x * 0.1, cell.y / 40.0);
        vec3 glow = vec3(0.0);
        for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
          glow += texture2D(uBoard, tuv + vec2(float(i), float(j)) * texel * 0.95).rgb;
        }
        col += glow / 9.0 * 0.22;
        float occ = texture2D(uBoard, tuv + vec2(-0.16, 0.22) * texel).a;
        col *= 1.0 - occ * 0.6;

        vec2 dl = cell - uLightPos;
        col += uLightColor * exp(-dot(dl, dl) * 0.07) * 0.12;

        float scan = 0.5 + 0.5 * sin(vUv.y * 60.0 - uTime * 3.0);
        col += uAccent * 0.003 * scan;
        float pulse = 0.5 + 0.5 * sin(uTime * 5.0);
        col += vec3(0.7, 0.02, 0.04) * uDanger * (0.02 + 0.04 * pulse) * smoothstep(0.35, 1.0, vUv.y);
        col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))), uWave);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}

/* Additive quad used for line-clear beams and hard-drop trails. Mode 0:
   horizontal beam (bright core along uv.y = 0.5). Mode 1: vertical trail
   (bright at the bottom, fading upward). */
function fxMaterial(mode) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: new Color() }, uAlpha: { value: 0 } },
    defines: { MODE: mode },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uAlpha;
      varying vec2 vUv;
      void main() {
        #if MODE == 0
          float core = exp(-pow((vUv.y - 0.5) * 7.0, 2.0));
          float ends = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
          float a = core * ends;
        #else
          float a = pow(1.0 - vUv.y, 1.6) * smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
        #endif
        gl_FragColor = vec4(uColor * a * uAlpha * 2.5, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}

function ghostMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: new Color() }, uAlpha: { value: 1 }, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uAlpha, uTime;
      varying vec2 vUv;
      void main() {
        vec2 e = min(vUv, 1.0 - vUv);
        float edge = 1.0 - smoothstep(0.0, 0.07, min(e.x, e.y));
        float fill = 0.08;
        gl_FragColor = vec4(uColor * (edge * 0.9 + fill) * uAlpha, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}

/* MeshPhysicalMaterial with a per-instance emissive boost driven by an
   `aGlow` instanced attribute and the instance colour. */
function blockMaterial(map, { glowBase = 0.06, envIntensity = 1.25 } = {}) {
  const m = new MeshPhysicalMaterial({
    color: 0xffffff,
    map,
    roughness: 0.26,
    metalness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.07,
    envMapIntensity: envIntensity,
    iridescence: 0.25,
    iridescenceIOR: 1.4
  });
  const uGlowBase = { value: glowBase };
  m.userData.glowBase = uGlowBase;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGlowBase = uGlowBase;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;\nuniform float uGlowBase;')
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance += vColor.rgb * (uGlowBase + vGlow);\n#endif');
  };
  return m;
}

/* ---------- particles ---------- */

class Particles {
  constructor(max) {
    this.max = max;
    const geo = new BoxGeometry(1, 1, 1);
    this.mesh = new InstancedMesh(geo, new MeshBasicMaterial({ color: 0xffffff }), max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    const c = new Color();
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, c);
    this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.n = 0;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.r = new Float32Array(max * 3);
    this.rv = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    this.dummy = new Object3D();
    this.tmpColor = new Color();
  }

  spawn(x, y, z, vx, vy, vz, life, size, color, gravity = -18, drag = 1.2) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.r[i3] = Math.random() * TAU; this.r[i3 + 1] = Math.random() * TAU; this.r[i3 + 2] = 0;
    this.rv[i3] = (Math.random() - 0.5) * 16; this.rv[i3 + 1] = (Math.random() - 0.5) * 16; this.rv[i3 + 2] = (Math.random() - 0.5) * 16;
    this.life[i] = this.maxLife[i] = life;
    this.size[i] = size;
    this.grav[i] = gravity;
    this.drag[i] = drag;
    this.col[i3] = color.r; this.col[i3 + 1] = color.g; this.col[i3 + 2] = color.b;
  }

  copy(from, to) {
    const f3 = from * 3, t3 = to * 3;
    for (const a of [this.p, this.v, this.r, this.rv, this.col]) {
      a[t3] = a[f3]; a[t3 + 1] = a[f3 + 1]; a[t3 + 2] = a[f3 + 2];
    }
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.size[to] = this.size[from];
    this.grav[to] = this.grav[from];
    this.drag[to] = this.drag[from];
  }

  clear() { this.n = 0; this.mesh.count = 0; }

  update(dt) {
    const d = this.dummy;
    const c = this.tmpColor;
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.copy(--this.n, i); continue; }
      const i3 = i * 3;
      const k = Math.exp(-this.drag[i] * dt);
      this.v[i3] *= k; this.v[i3 + 1] = this.v[i3 + 1] * k + this.grav[i] * dt; this.v[i3 + 2] *= k;
      this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
      this.r[i3] += this.rv[i3] * dt; this.r[i3 + 1] += this.rv[i3 + 1] * dt; this.r[i3 + 2] += this.rv[i3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      const s = this.size[i] * Math.sqrt(t);
      d.position.set(this.p[i3], this.p[i3 + 1], this.p[i3 + 2]);
      d.rotation.set(this.r[i3], this.r[i3 + 1], this.r[i3 + 2]);
      d.scale.set(s, s, s);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      const b = 0.4 + t * 0.9;
      c.setRGB(this.col[i3] * b, this.col[i3 + 1] * b, this.col[i3 + 2] * b);
      this.mesh.setColorAt(i, c);
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/* ---------- a 4-cell piece mesh (active, previews, hold) ---------- */

function pieceMesh(geo, mat) {
  const g = geo.clone();
  g.setAttribute('aGlow', new InstancedBufferAttribute(new Float32Array(4), 1));
  const m = new InstancedMesh(g, mat, 4);
  const c = new Color();
  for (let i = 0; i < 4; i++) m.setColorAt(i, c);
  m.frustumCulled = false;
  return m;
}

/* Cells of `type` in spawn orientation, centred on the shape's own bounding box. */
const CENTRED = {};
function centredCells(type) {
  return CENTRED[type] || (CENTRED[type] = computeCentred(type, 0));
}
function computeCentred(type, rot) {
  const cells = SHAPES[type][rot];
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return {
    cells: cells.map(([x, y]) => [x - cx, y - cy]),
    w: Math.max(...xs) - Math.min(...xs) + 1,
    h: Math.max(...ys) - Math.min(...ys) + 1
  };
}

/* ======================================================================= */

export class Renderer {
  constructor(canvas, { quality = 'high' } = {}) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.85;
    this.renderer.setClearColor(0x000000, 1);

    this.scene = new Scene();
    this.scene.fog = new FogExp2(0x05060f, 0.0065);
    this.camera = new PerspectiveCamera(40, 1, 0.5, 600);

    this.palette = {};
    for (const t of TYPES) this.palette[t] = new Color(COLORS[t]);
    this.grey = new Color(0x4b5263);
    this.white = new Color(0xffffff);

    this.time = 0;
    this.view = 'dynamic';
    this.camState = { ...VIEWS.showcase };
    this.target = new Vector3(0, 0.2, 0);
    this.shake = 0;
    this.spring = { y: 0, vy: 0, rx: 0, vrx: 0, rz: 0, vrz: 0 };
    this.danger = 0;
    this.pulse = 0;
    this.calm = false;          // title-screen demo: no flashes, shake or bursts
    this.travelSpeed = 4;
    this.travel = 0;
    this.warp = 0;
    this.showGhost = true;
    this.showGrid = true;
    this.shakeEnabled = true;
    this.particlesEnabled = true;
    this.fpsWindow = null;
    this.autoQuality = quality === 'auto';

    this.themeFrom = THEMES[0];
    this.themeTo = THEMES[0];
    this.themeT = 1;
    this.themeCur = { accent: new Color(), a: new Color(), b: new Color(), glow: new Color() };

    this.rowDrop = new Float32Array(DRAW_ROWS + 4);
    this.collapseT = 1;
    this.cellFlash = new Float32Array(COLS * DRAW_ROWS);
    this.clearSeen = null;
    this.overT = -1;
    this.pieceVis = null;
    this.rotAnim = 0;
    this.spawnAnim = 1;
    this.holdPop = 0;
    this.lastPieceRef = null;

    this.build();
    this.setQuality(this.autoQuality ? 'high' : quality);
    this.applyTheme(THEMES[0], true);
  }

  /* ---------- construction ---------- */

  build() {
    const r = this.renderer;
    const pmrem = new PMREMGenerator(r);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envMap;
    pmrem.dispose();

    this.scene.add(new HemisphereLight(0x9fb4ff, 0x1a0820, 0.55));
    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(6, 14, 16);
    this.scene.add(key);
    this.rim = new DirectionalLight(0x22e6ff, 1.4);
    this.rim.position.set(-10, 6, -8);
    this.scene.add(this.rim);
    this.pieceLight = new PointLight(0xffffff, 0, 7, 2);
    this.scene.add(this.pieceLight);

    this.gem = gemTexture();
    this.blockGeo = new RoundedBoxGeometry(0.94, 0.94, 0.94, 3, 0.13);
    this.blockMat = blockMaterial(this.gem);
    this.activeMat = blockMaterial(this.gem, { glowBase: 0.1, envIntensity: 1.25 });
    this.previewMat = blockMaterial(this.gem, { glowBase: 0.14, envIntensity: 1.3 });
    this.decoMat = blockMaterial(this.gem, { glowBase: 0.35, envIntensity: 0.6 });

    // Sky, stars, floor.
    this.skyGroup = new Group();
    this.scene.add(this.skyGroup);

    // The well.
    this.board = new Group();
    this.scene.add(this.board);

    this.panel = new Mesh(new PlaneGeometry(COLS, VISIBLE), panelMaterial());
    this.panel.position.set(0, 0, -0.55);
    this.board.add(this.panel);

    this.boardTexData = new Uint8Array(COLS * 40 * 4);
    this.boardTex = new DataTexture(this.boardTexData, COLS, 40, RGBAFormat);
    this.boardTex.magFilter = LinearFilter;
    this.boardTex.minFilter = LinearFilter;
    this.boardTex.colorSpace = SRGBColorSpace;
    this.boardTex.needsUpdate = true;
    this.panel.material.uniforms.uBoard.value = this.boardTex;

    const metal = new MeshPhysicalMaterial({ color: 0x151a2c, metalness: 0.85, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    this.neonMat = new MeshBasicMaterial({ color: 0xffffff });
    this.dangerLineMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
    const frame = new Group();
    const H = VISIBLE + 0.5;
    for (const side of [-1, 1]) {
      const pillar = new Mesh(new RoundedBoxGeometry(0.42, H + 0.9, 1.5, 3, 0.1), metal);
      pillar.position.set(side * (COLS / 2 + 0.27), -0.2, -0.05);
      frame.add(pillar);
      const strip = new Mesh(new BoxGeometry(0.06, H + 0.4, 0.06), this.neonMat);
      strip.position.set(side * (COLS / 2 + 0.07), -0.2, 0.62);
      frame.add(strip);
      const back = new Mesh(new BoxGeometry(0.05, H + 0.4, 0.05), this.neonMat);
      back.position.set(side * (COLS / 2 + 0.5), -0.2, -0.78);
      frame.add(back);
    }
    const base = new Mesh(new RoundedBoxGeometry(COLS + 1.5, 0.55, 1.9, 3, 0.12), metal);
    base.position.set(0, -VISIBLE / 2 - 0.3, -0.05);
    frame.add(base);
    const baseStrip = new Mesh(new BoxGeometry(COLS + 0.2, 0.06, 0.06), this.neonMat);
    baseStrip.position.set(0, -VISIBLE / 2 - 0.04, 0.62);
    frame.add(baseStrip);
    const baseGlow = new Mesh(new BoxGeometry(COLS + 1.4, 0.05, 0.05), this.neonMat);
    baseGlow.position.set(0, -VISIBLE / 2 - 0.58, 0.9);
    frame.add(baseGlow);
    this.dangerLine = new Mesh(new BoxGeometry(COLS, 0.04, 0.04), this.dangerLineMat);
    this.dangerLine.position.set(0, VISIBLE / 2, 0.6);
    frame.add(this.dangerLine);
    this.board.add(frame);

    // Locked blocks.
    const maxCells = COLS * DRAW_ROWS;
    const bgeo = this.blockGeo.clone();
    this.cellGlow = new InstancedBufferAttribute(new Float32Array(maxCells), 1);
    this.cellGlow.setUsage(DynamicDrawUsage);
    bgeo.setAttribute('aGlow', this.cellGlow);
    this.cells = new InstancedMesh(bgeo, this.blockMat, maxCells);
    this.cells.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let i = 0; i < maxCells; i++) this.cells.setColorAt(i, this.white);
    this.cells.instanceColor.setUsage(DynamicDrawUsage);
    this.cells.count = 0;
    this.cells.frustumCulled = false;
    this.board.add(this.cells);

    // Active piece and ghost.
    this.pieceGroup = new Group();
    this.active = pieceMesh(this.blockGeo, this.activeMat);
    this.pieceGroup.add(this.active);
    this.board.add(this.pieceGroup);
    this.ghostMat = ghostMaterial();
    this.ghost = new InstancedMesh(new BoxGeometry(0.94, 0.94, 0.94), this.ghostMat, 4);
    this.ghost.frustumCulled = false;
    this.board.add(this.ghost);

    // Previews: slot 0 = hold, 1..5 = next queue.
    this.previews = [];
    for (let i = 0; i < 6; i++) {
      const g = new Group();
      const m = pieceMesh(this.blockGeo, this.previewMat);
      g.add(m);
      g.visible = false;
      this.scene.add(g);
      this.previews.push({ group: g, mesh: m, type: null, dim: false, spin: Math.random() * TAU });
    }

    // FX quads.
    this.beams = [];
    for (let i = 0; i < 4; i++) {
      const m = new Mesh(new PlaneGeometry(COLS + 1.2, 1.4), fxMaterial(0));
      m.visible = false;
      m.position.z = 0.7;
      this.board.add(m);
      this.beams.push({ mesh: m, t: 1 });
    }
    this.trails = [];
    for (let i = 0; i < 8; i++) {
      const g = new PlaneGeometry(0.9, 1);
      g.translate(0, 0.5, 0);
      const m = new Mesh(g, fxMaterial(1));
      m.visible = false;
      m.position.z = 0.3;
      this.board.add(m);
      this.trails.push({ mesh: m, t: 1 });
    }
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const m = new Mesh(new RingGeometry(0.92, 1, 96), new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false }));
      m.visible = false;
      m.position.z = 0.8;
      this.board.add(m);
      this.rings.push({ mesh: m, t: 1, scale: 10 });
    }

    this.dummy = new Object3D();
    this.tmpColor = new Color();
    this.tmpV = new Vector3();
    this.tmpV2 = new Vector2();
    this.camDir = new Vector3();
    // Bounding box of the well (frame included) that the camera must keep in view.
    const hx = COLS / 2 + 0.55, top = VISIBLE / 2 + 0.6, bottom = -VISIBLE / 2 - 0.65;
    this.wellCorners = [];
    for (const x of [-hx, hx]) for (const y of [bottom, top]) for (const z of [-0.8, 0.8]) this.wellCorners.push(new Vector3(x, y, z));
    this.tmpQ = new Quaternion();
    this.raycaster = new Raycaster();
  }

  buildBackground(q) {
    for (const c of [...this.skyGroup.children]) {
      this.skyGroup.remove(c);
      c.geometry.dispose();
      c.material.dispose();
    }

    this.sky = new Mesh(new SphereGeometry(300, 48, 24), skyMaterial(q.octaves));
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.skyGroup.add(this.sky);

    const N = Math.round(q.particles * 1.5);
    const pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * TAU;
      const rad = 16 + Math.pow(Math.random(), 0.6) * 110;
      pos[i * 3] = Math.cos(a) * rad;
      pos[i * 3 + 1] = Math.sin(a) * rad * 0.7;
      pos[i * 3 + 2] = Math.random() * 260 - 220;
      size[i] = 0.4 + Math.pow(Math.random(), 3) * 2.2;
      phase[i] = Math.random();
    }
    const sg = new BufferGeometry();
    sg.setAttribute('position', new Float32BufferAttribute(pos, 3));
    sg.setAttribute('aSize', new Float32BufferAttribute(size, 1));
    sg.setAttribute('aPhase', new Float32BufferAttribute(phase, 1));
    this.stars = new Points(sg, starMaterial());
    this.stars.frustumCulled = false;
    this.skyGroup.add(this.stars);

    this.floor = new Mesh(new PlaneGeometry(700, 700), floorMaterial());
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -14;
    this.skyGroup.add(this.floor);

    // Distant drifting tetrominoes for depth.
    const DECO = 12;
    const dgeo = this.blockGeo.clone();
    const glow = new Float32Array(DECO * 4).fill(0.12);
    dgeo.setAttribute('aGlow', new InstancedBufferAttribute(glow, 1));
    this.deco = new InstancedMesh(dgeo, this.decoMat, DECO * 4);
    this.deco.instanceMatrix.setUsage(DynamicDrawUsage);
    this.deco.frustumCulled = false;
    this.decoItems = [];
    for (let i = 0; i < DECO; i++) {
      const type = TYPES[i % TYPES.length];
      const side = i % 2 ? 1 : -1;
      const item = {
        type,
        cells: centredCells(type).cells,
        pos: new Vector3(side * (30 + Math.random() * 50), -14 + Math.random() * 44, -80 - Math.random() * 90),
        rot: new Euler(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU),
        spin: new Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3),
        drift: 0.3 + Math.random() * 0.6,
        scale: 1.6 + Math.random() * 1.6
      };
      this.decoItems.push(item);
      for (let k = 0; k < 4; k++) this.deco.setColorAt(i * 4 + k, this.palette[type]);
    }
    this.skyGroup.add(this.deco);
  }

  /* ---------- settings ---------- */

  setQuality(name) {
    const q = QUALITY[name] || QUALITY.high;
    this.qualityName = name in QUALITY ? name : 'high';
    this.q = q;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, q.ratio);
    this.renderer.setPixelRatio(this.pixelRatio);

    if (this.particles) {
      this.board.remove(this.particles.mesh);
      this.particles.mesh.geometry.dispose();
      this.particles.mesh.material.dispose();
    }
    this.particles = new Particles(q.particles);
    this.board.add(this.particles.mesh);
    this.buildBackground(q);

    if (this.composer) {
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
      this.composer = null;
    }
    if (q.bloom) {
      const rt = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: q.samples });
      this.composer = new EffectComposer(this.renderer, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new Vector2(256, 256), 0.4, 0.3, 0.9);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    } else {
      this.bloom = null;
    }
    this.sized = null;
    this.fpsWindow = null;
    this.applyTheme(this.themeTo, true);
  }

  setView(name) {
    if (VIEWS[name]) this.view = name;
  }

  /* ---------- theme ---------- */

  applyTheme(theme, instant = false) {
    const cur = this.themeCur;
    if (!instant) {
      this.themeFrom = {
        accent: cur.accent.getHex(), a: cur.a.getHex(), b: cur.b.getHex(), glow: cur.glow.getHex()
      };
    }
    this.themeTo = theme;
    this.themeT = instant ? 1 : 0;
    if (instant) this.themeFrom = theme;
    this.updateTheme(0);
  }

  updateTheme(dt) {
    this.themeT = Math.min(1, this.themeT + dt / 1.6);
    const t = easeOutCubic(this.themeT);
    const cur = this.themeCur;
    for (const k of ['accent', 'a', 'b', 'glow']) {
      cur[k].set(this.themeFrom[k]).lerp(this.tmpColor.set(this.themeTo[k]), t);
    }
    const s = this.sky.material.uniforms;
    s.uA.value.copy(cur.a);
    s.uB.value.copy(cur.b);
    s.uGlow.value.copy(cur.glow);
    this.floor.material.uniforms.uColor.value.copy(cur.accent);
    this.panel.material.uniforms.uAccent.value.copy(cur.accent);
    this.rim.color.copy(cur.accent);
    const dangerRed = this.tmpColor.setRGB(1, 0.08, 0.15);
    this.neonMat.color.copy(cur.accent).lerp(dangerRed, this.danger * 0.8).multiplyScalar(1.1 + this.pulse);
    this.dangerLineMat.color.copy(cur.accent).lerp(dangerRed, this.danger).multiplyScalar(1.5 + this.danger * 2);
    this.dangerLineMat.opacity = 0.25 + this.danger * 0.75;
    this.stars.material.uniforms.uColor.value.set(0xdfe8ff).lerp(cur.glow, 0.35);
  }

  /* ---------- events ---------- */

  onEvent(e, game) {
    const P = this.particles;
    // The attract-mode demo stays quiet: pieces land and rows clear, nothing flashes.
    if (this.calm && ['hardDrop', 'lock', 'clear', 'gameOver', 'finish'].includes(e.type)) {
      if (e.type === 'hardDrop') this.pieceVis = null;
      return;
    }
    if (this.calm && e.type === 'levelUp') { this.applyTheme(themeFor(e.level)); return; }
    switch (e.type) {
      case 'spawn':
        this.pieceVis = null;
        this.spawnAnim = 0;
        this.rotAnim = 0;
        break;
      case 'rotate':
        if (e.to !== undefined) this.rotAnim = e.dir === 2 ? Math.PI : (e.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        break;
      case 'hardDrop': {
        const col = this.palette[e.piece];
        const byCol = new Map();
        for (const [x, y] of e.cells) byCol.set(x, Math.min(byCol.get(x) ?? 99, y));
        for (const [x, y] of byCol) {
          const tr = this.trails.find((t) => t.t >= 1) || this.trails[0];
          tr.t = 0;
          tr.mesh.visible = true;
          tr.mesh.position.set(cellX(x), cellY(y) - 0.5, 0.3);
          tr.mesh.scale.set(1, Math.max(0.01, e.distance + 1), 1);
          tr.mesh.material.uniforms.uColor.value.copy(col);
          tr.len = e.distance;
        }
        this.pieceVis = null;
        const k = Math.min(e.distance, 20) / 20;
        this.spring.vy -= 2.5 + 7 * k;
        this.spring.vrx += 0.02 + 0.05 * k;
        this.addShake(0.12 + 0.18 * k);
        if (this.particlesEnabled) {
          for (const [x, y] of e.cells) {
            for (let i = 0; i < 3; i++) {
              P.spawn(cellX(x) + (Math.random() - 0.5) * 0.8, cellY(y) - 0.45, 0.3 + Math.random() * 0.4,
                (Math.random() - 0.5) * 6, Math.random() * 4, Math.random() * 4, 0.35 + Math.random() * 0.25,
                0.1 + Math.random() * 0.08, this.tmpColor.copy(col).multiplyScalar(2.2), -14, 2);
            }
          }
        }
        break;
      }
      case 'lock':
        for (const [x, y] of e.cells) if (y < DRAW_ROWS) this.cellFlash[y * COLS + x] = 0.7;
        this.spring.vy -= 0.6;
        break;
      case 'clear': {
        if (!e.lines) {
          // Zero-line T-spin: a purple swirl around the piece.
          this.spinBurst(e);
          break;
        }
        this.clearSeen = { rows: e.rows, spawned: false, lines: e.lines, tspin: e.tspin };
        e.rows.forEach((y, i) => {
          const b = this.beams[i];
          if (!b || y >= DRAW_ROWS) return;
          b.t = 0;
          b.mesh.visible = true;
          b.mesh.position.y = cellY(y);
          b.mesh.material.uniforms.uColor.value.copy(e.tspin !== 'none' ? this.palette.T : (e.lines === 4 ? this.palette.I : this.white));
        });
        const big = e.lines === 4 || e.tspin === 'full' || e.perfect;
        this.addShake(big ? 0.55 : 0.12 + e.lines * 0.06);
        this.spring.vrz += (Math.random() < 0.5 ? -1 : 1) * (big ? 0.06 : 0.015);
        this.spring.vy -= big ? 6 : 2;
        if (big) {
          this.warp = 1;
          this.pulse = 0.6;
          this.ring(cellY(e.rows[0]) + (e.lines - 1) / 2, e.lines === 4 ? this.palette.I : this.palette.T, 1);
          if (e.perfect) this.ring(0, this.palette.O, 1.6);
        } else {
          this.pulse = Math.max(this.pulse, 0.15);
        }
        break;
      }
      case 'collapse': {
        const cleared = new Set(e.rows);
        let ny = 0;
        this.rowDrop.fill(0);
        for (let y = 0; y < DRAW_ROWS + 4; y++) {
          if (cleared.has(y)) continue;
          if (ny < this.rowDrop.length) this.rowDrop[ny] = y - ny;
          ny++;
        }
        this.collapseT = 0;
        // Shift lock flashes with their rows.
        const f = new Float32Array(this.cellFlash.length);
        ny = 0;
        for (let y = 0; y < DRAW_ROWS; y++) {
          if (cleared.has(y)) continue;
          f.set(this.cellFlash.subarray(y * COLS, y * COLS + COLS), ny * COLS);
          ny++;
        }
        this.cellFlash = f;
        this.clearSeen = null;
        break;
      }
      case 'levelUp':
        this.applyTheme(themeFor(e.level));
        this.ring(0, this.tmpColor.set(this.themeTo.accent), 2.2);
        this.warp = 1;
        this.pulse = 0.5;
        break;
      case 'hold':
        this.holdPop = 1;
        this.pieceVis = null;
        break;
      case 'gameOver':
        this.overT = 0;
        this.addShake(0.5);
        break;
      case 'finish':
        this.warp = 1;
        this.pulse = 0.7;
        this.ring(0, this.white, 2.4);
        break;
    }
  }

  spinBurst(e) {
    if (!this.particlesEnabled || !this.lastPieceCells) return;
    const [cx, cy] = this.lastPieceCells;
    const col = this.tmpColor.copy(this.palette.T).multiplyScalar(3);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU;
      this.particles.spawn(cellX(cx) + Math.cos(a) * 1.3, cellY(cy) + Math.sin(a) * 1.3, 0.6,
        -Math.sin(a) * 6, Math.cos(a) * 6, 2, 0.5, 0.12, col, 0, 2.5);
    }
  }

  ring(y, color, scale) {
    const r = this.rings.find((x) => x.t >= 1) || this.rings[0];
    r.t = 0;
    r.scale = 7 * scale;
    r.mesh.visible = true;
    r.mesh.position.set(0, y, 0.9);
    r.mesh.material.color.copy(color).multiplyScalar(2.5);
  }

  addShake(amount) {
    if (!this.shakeEnabled) amount *= 0.15;
    this.shake = Math.min(1, this.shake + amount);
  }

  reset() {
    this.particles.clear();
    this.cellFlash.fill(0);
    this.rowDrop.fill(0);
    this.collapseT = 1;
    this.overT = -1;
    this.clearSeen = null;
    this.pieceVis = null;
    this.danger = 0;
    for (const b of this.beams) { b.t = 1; b.mesh.visible = false; }
    for (const t of this.trails) { t.t = 1; t.mesh.visible = false; }
    for (const r of this.rings) { r.t = 1; r.mesh.visible = false; }
  }

  /* ---------- per-frame ---------- */

  resize(W, H) {
    if (this.sized && this.sized.W === W && this.sized.H === H && this.sized.pr === this.pixelRatio) return;
    this.sized = { W, H, pr: this.pixelRatio };
    this.renderer.setSize(W, H, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(W, H);
      this.bloom.resolution.set(W * this.pixelRatio * 0.5, H * this.pixelRatio * 0.5);
    }
    this.stars.material.uniforms.uPixel.value = this.pixelRatio * Math.min(1.6, H / 800);
  }

  /* Places the camera so the well fills `stage` (a CSS-pixel rect). */
  frameCamera(stage, W, H, dt) {
    const cs = this.camState;
    const v = VIEWS[this.view];
    const lam = 3.2;
    cs.yaw = damp(cs.yaw, v.yaw, lam, dt);
    cs.pitch = damp(cs.pitch, v.pitch, lam, dt);
    cs.fov = damp(cs.fov, v.fov, lam, dt);
    cs.sway = damp(cs.sway, v.sway, lam, dt);

    const cam = this.camera;
    cam.fov = cs.fov;
    cam.aspect = W / H;
    cam.clearViewOffset();
    cam.updateProjectionMatrix();

    const dir = this.camDir.set(
      Math.sin(cs.yaw * DEG) * Math.cos(cs.pitch * DEG),
      Math.sin(cs.pitch * DEG),
      Math.cos(cs.yaw * DEG) * Math.cos(cs.pitch * DEG)
    );
    const ax = Math.max(0.05, stage.w / W), ay = Math.max(0.05, stage.h / H);
    const corners = this.wellCorners;
    let d = 60;
    for (let it = 0; it < 4; it++) {
      cam.position.copy(this.target).addScaledVector(dir, d);
      cam.lookAt(this.target);
      cam.updateMatrixWorld();
      let mx = 0, my = 0;
      for (const c of corners) {
        const p = this.tmpV.copy(c).project(cam);
        mx = Math.max(mx, Math.abs(p.x));
        my = Math.max(my, Math.abs(p.y));
      }
      d *= Math.max(mx / ax, my / ay);
    }
    this.camDist = d;

    // Live camera: slow drift plus a lean toward the active piece.
    let yaw = cs.yaw, pitch = cs.pitch;
    const s = cs.sway;
    if (s > 0.001) {
      yaw += (Math.sin(this.time * 0.31) * 2.2 + (this.pieceLean || 0) * 0.9) * s;
      pitch += Math.sin(this.time * 0.23 + 1.3) * 1.1 * s;
    }
    if (this.view === 'showcase') yaw += Math.sin(this.time * 0.17) * 14;
    dir.set(
      Math.sin(yaw * DEG) * Math.cos(pitch * DEG),
      Math.sin(pitch * DEG),
      Math.cos(yaw * DEG) * Math.cos(pitch * DEG)
    );
    cam.position.copy(this.target).addScaledVector(dir, d);
    cam.lookAt(this.target);

    // Trauma-based shake (squared so small hits stay subtle).
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const tr = this.shake * this.shake;
    if (tr > 0) {
      const t = this.time * 38;
      const n = (o) => Math.sin(t * 1.1 + o) * 0.6 + Math.sin(t * 2.3 + o * 3.1) * 0.4;
      cam.position.x += n(1) * tr * 0.9;
      cam.position.y += n(2) * tr * 0.9;
      cam.rotateZ(n(3) * tr * 0.035);
    }

    const sx = stage.x + stage.w / 2, sy = stage.y + stage.h / 2;
    cam.setViewOffset(W, H, W / 2 - sx, H / 2 - sy, W, H);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  updateSpring(dt) {
    const s = this.spring;
    const k = 140, c = 13;
    s.vy += (-k * s.y - c * s.vy) * dt;
    s.y += s.vy * dt;
    s.vrx += (-k * s.rx - c * s.vrx) * dt;
    s.rx += s.vrx * dt;
    s.vrz += (-k * s.rz - c * s.vrz) * dt;
    s.rz += s.vrz * dt;
    this.board.position.y = s.y * 0.06;
    this.board.rotation.x = s.rx;
    this.board.rotation.z = s.rz;
  }

  syncCells(game, dt) {
    const board = game.board;
    const d = this.dummy;
    const clearing = game.state === 'clearing' ? game.clearingRows : null;
    const clearP = clearing ? 1 - game.clearTimer / LINE_CLEAR_DELAY : 0;
    const clearSet = clearing ? new Set(clearing) : null;
    const waveY = this.overT >= 0 ? DRAW_ROWS - this.overT * 26 : Infinity;

    if (this.collapseT < 1) this.collapseT = Math.min(1, this.collapseT + dt / 0.17);
    const fall = 1 - this.collapseT * this.collapseT;
    if (this.collapseT >= 1 && this.rowDrop.some((v) => v)) {
      this.rowDrop.fill(0);
      this.spring.vy -= 2.2;
    }

    // Spawn shards once, as the cleared rows reach full white.
    if (clearing && this.clearSeen && !this.clearSeen.spawned && clearP > 0.3) {
      this.clearSeen.spawned = true;
      if (this.particlesEnabled) {
        const count = this.clearSeen.lines === 4 ? 7 : 4;
        for (const y of clearing) {
          if (y >= DRAW_ROWS) continue;
          for (let x = 0; x < COLS; x++) {
            const v = board[y * COLS + x];
            const col = this.tmpColor.copy(v === GREY ? this.grey : this.palette[idType(v)] || this.white).multiplyScalar(2.6);
            for (let i = 0; i < count; i++) {
              const dir = (x - 4.5) / 4.5;
              this.particles.spawn(
                cellX(x) + (Math.random() - 0.5) * 0.7, cellY(y) + (Math.random() - 0.5) * 0.7, 0.2 + Math.random() * 0.5,
                dir * 7 + (Math.random() - 0.5) * 9, 2 + Math.random() * 8, 4 + Math.random() * 12,
                0.7 + Math.random() * 0.7, 0.12 + Math.random() * 0.16, col, -16, 0.9);
            }
          }
        }
      }
    }

    let n = 0;
    const glow = this.cellGlow.array;
    const grey = this.grey;
    for (let y = 0; y < DRAW_ROWS; y++) {
      const dropY = this.rowDrop[y] * fall;
      for (let x = 0; x < COLS; x++) {
        const v = board[y * COLS + x];
        const fi = y * COLS + x;
        if (this.cellFlash[fi] > 0) this.cellFlash[fi] = Math.max(0, this.cellFlash[fi] - dt * 4.5);
        if (!v) continue;
        let scale = 1, g = this.cellFlash[fi];
        const col = this.tmpColor.copy(v === GREY ? grey : this.palette[idType(v)]);
        if (clearSet && clearSet.has(y)) {
          const heat = clamp01(clearP / 0.3);
          col.lerp(this.white, heat * (this.calm ? 0.2 : 0.6));
          g += heat * (this.calm ? 0.3 : 1.2);
          const t = clamp01((clearP - 0.3 - Math.abs(x - 4.5) * 0.035) / 0.45);
          scale = 1 - easeOutCubic(t);
          if (scale <= 0.001) continue;
        }
        if (y >= waveY) {
          col.lerp(grey, 0.9);
          g = 0;
        }
        d.position.set(cellX(x), cellY(y) + dropY, 0);
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(scale);
        d.updateMatrix();
        this.cells.setMatrixAt(n, d.matrix);
        this.cells.setColorAt(n, col);
        glow[n] = g;
        n++;
      }
    }
    this.cells.count = n;
    this.cells.instanceMatrix.needsUpdate = true;
    this.cells.instanceColor.needsUpdate = true;
    this.cellGlow.needsUpdate = true;
  }

  syncPiece(game, dt) {
    const p = game.state === 'playing' ? game.piece : null;
    const vis = this.pieceGroup;
    if (!p) {
      vis.visible = false;
      this.ghost.visible = false;
      this.pieceLight.intensity = damp(this.pieceLight.intensity, 0, 10, dt);
      this.panel.material.uniforms.uCol.value.set(-9, -9);
      this.panel.material.uniforms.uLightColor.value.multiplyScalar(Math.exp(-8 * dt));
      return;
    }
    const n = BOX[p.type];
    const c = (n - 1) / 2;
    const tx = cellX(p.x + c), ty = cellY(p.y + c);
    if (!this.pieceVis) this.pieceVis = { x: tx, y: ty };
    const pv = this.pieceVis;
    pv.x = damp(pv.x, tx, 32, dt);
    pv.y = damp(pv.y, ty, 26, dt);
    if (Math.abs(pv.y - ty) > 3) pv.y = ty + Math.sign(pv.y - ty) * 3;

    this.rotAnim = damp(this.rotAnim, 0, 26, dt);
    this.spawnAnim = Math.min(1, this.spawnAnim + dt / 0.12);

    vis.visible = true;
    vis.position.set(pv.x, pv.y, 0);
    vis.rotation.set(0, 0, this.rotAnim);
    const sc = 0.7 + 0.3 * easeOutCubic(this.spawnAnim);
    vis.scale.setScalar(sc);

    const col = this.palette[p.type];
    const d = this.dummy;
    const cells = SHAPES[p.type][p.rot];
    const lockGlow = game.onGround() ? 0.3 * Math.min(1, game.lockTimer / 500) : 0;
    const glowArr = this.active.geometry.getAttribute('aGlow');
    let minX = 99, maxX = -99, sx = 0, sy = 0;
    cells.forEach(([cx, cy], i) => {
      d.position.set(cx - c, cy - c, 0);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.active.setMatrixAt(i, d.matrix);
      this.active.setColorAt(i, col);
      glowArr.array[i] = lockGlow;
      minX = Math.min(minX, p.x + cx);
      maxX = Math.max(maxX, p.x + cx);
      sx += p.x + cx;
      sy += p.y + cy;
    });
    glowArr.needsUpdate = true;
    this.active.instanceMatrix.needsUpdate = true;
    this.active.instanceColor.needsUpdate = true;
    this.lastPieceCells = [sx / 4, sy / 4];
    this.pieceLean = (sx / 4 - 4.5) / 4.5;

    this.pieceLight.color.copy(col);
    this.pieceLight.intensity = damp(this.pieceLight.intensity, this.calm ? 4 : 7, 10, dt);
    this.pieceLight.position.set(pv.x, pv.y, 1.6);
    this.board.localToWorld(this.pieceLight.position);

    const u = this.panel.material.uniforms;
    u.uCol.value.set(minX, maxX + 1);
    u.uLightColor.value.copy(col);
    u.uLightPos.value.set(sx / 4 + 0.5, sy / 4 + 0.5);

    // Ghost.
    const gy = game.ghostY();
    this.ghost.visible = this.showGhost && gy !== p.y;
    if (this.ghost.visible) {
      cells.forEach(([cx, cy], i) => {
        d.position.set(cellX(p.x + cx) + (pv.x - tx), cellY(gy + cy), 0);
        d.updateMatrix();
        this.ghost.setMatrixAt(i, d.matrix);
      });
      this.ghost.instanceMatrix.needsUpdate = true;
      this.ghostMat.uniforms.uColor.value.copy(col);
    }
  }

  /* Colour + occupancy of every cell, sampled by the back panel for its
     reflected glow and contact shadow. */
  syncBoardTexture(game) {
    const data = this.boardTexData;
    data.fill(0);
    const put = (x, y, c, a) => {
      if (y < 0 || y >= 40 || x < 0 || x >= COLS) return;
      const i = (y * COLS + x) * 4;
      data[i] = Math.round(c.r * 255);
      data[i + 1] = Math.round(c.g * 255);
      data[i + 2] = Math.round(c.b * 255);
      data[i + 3] = a;
    };
    const c = this.tmpColor;
    const waveY = this.overT >= 0 ? DRAW_ROWS - this.overT * 26 : Infinity;
    for (let y = 0; y < DRAW_ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = game.board[y * COLS + x];
        if (!v) continue;
        c.copy(v === GREY || y >= waveY ? this.grey : this.palette[idType(v)]).convertLinearToSRGB();
        put(x, y, c, 255);
      }
    }
    if (game.state === 'playing' && game.piece) {
      c.copy(this.palette[game.piece.type]).convertLinearToSRGB();
      for (const [x, y] of game.cellsOf()) put(x, y, c, 255);
    }
    this.boardTex.needsUpdate = true;
  }

  syncPreviews(game, rects, dt) {
    const cam = this.camera;
    const W = this.sized.W, H = this.sized.H;
    const worldPerPx = (2 * this.camDist * Math.tan((cam.fov * DEG) / 2)) / H;
    this.holdPop = Math.max(0, this.holdPop - dt * 4);
    const fwd = this.tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const dist = this.camDist;

    for (let i = 0; i < 6; i++) {
      const pv = this.previews[i];
      const rect = rects && rects[i];
      const type = !game ? null : i === 0 ? game.hold : game.queue[i - 1];
      if (!rect || !type || rect.w < 4) { pv.group.visible = false; continue; }
      pv.group.visible = true;

      const dim = i === 0 && game.holdUsed;
      if (pv.type !== type || pv.dim !== dim) {
        pv.type = type;
        pv.dim = dim;
        const { cells } = centredCells(type);
        const d = this.dummy;
        const col = this.tmpColor.copy(this.palette[type]);
        if (dim) col.lerp(this.grey, 0.75);
        const glowArr = pv.mesh.geometry.getAttribute('aGlow');
        cells.forEach(([x, y], k) => {
          d.position.set(x, y, 0);
          d.rotation.set(0, 0, 0);
          d.scale.setScalar(1);
          d.updateMatrix();
          pv.mesh.setMatrixAt(k, d.matrix);
          pv.mesh.setColorAt(k, col);
          glowArr.array[k] = dim ? -0.1 : 0.05;
        });
        glowArr.needsUpdate = true;
        pv.mesh.instanceMatrix.needsUpdate = true;
        pv.mesh.instanceColor.needsUpdate = true;
        pv.pop = 1;
      }

      const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
      const ndc = this.tmpV2.set((cx / W) * 2 - 1, -(cy / H) * 2 + 1);
      this.raycaster.setFromCamera(ndc, cam);
      const ray = this.raycaster.ray;
      const along = dist / Math.max(0.2, ray.direction.dot(fwd));
      pv.group.position.copy(ray.origin).addScaledVector(ray.direction, along * 0.97);

      const { w, h } = centredCells(type);
      const cellPx = Math.min(rect.w * 0.7 / Math.max(w, 3), rect.h * 0.62 / Math.max(h, 2), 34);
      pv.pop = Math.max(0, (pv.pop || 0) - dt * 5);
      const pop = 1 + 0.25 * Math.sin(pv.pop * Math.PI) + (i === 0 ? 0.2 * Math.sin(this.holdPop * Math.PI) : 0);
      pv.group.scale.setScalar(cellPx * worldPerPx * pop);

      pv.spin += dt;
      pv.group.quaternion.copy(cam.quaternion);
      pv.group.rotateY(Math.sin(pv.spin * 0.9 + i) * 0.45);
      pv.group.rotateX(Math.sin(pv.spin * 0.7 + i * 2) * 0.18);
    }
  }

  updateFx(dt) {
    for (const b of this.beams) {
      if (b.t >= 1) continue;
      b.t = Math.min(1, b.t + dt / 0.5);
      const t = b.t;
      b.mesh.scale.set(Math.min(1, t * 6), 1.2 - t * 0.9, 1);
      b.mesh.material.uniforms.uAlpha.value = (1 - t) * (1 - t) * 1.4;
      if (b.t >= 1) b.mesh.visible = false;
    }
    for (const tr of this.trails) {
      if (tr.t >= 1) continue;
      tr.t = Math.min(1, tr.t + dt / 0.3);
      tr.mesh.material.uniforms.uAlpha.value = (1 - tr.t) * 0.35;
      tr.mesh.scale.x = 1 - tr.t * 0.6;
      if (tr.t >= 1) tr.mesh.visible = false;
    }
    for (const r of this.rings) {
      if (r.t >= 1) continue;
      r.t = Math.min(1, r.t + dt / 0.7);
      const s = 0.5 + easeOutCubic(r.t) * r.scale;
      r.mesh.scale.set(s, s, s);
      r.mesh.material.opacity = 1 - r.t;
      if (r.t >= 1) r.mesh.visible = false;
    }
  }

  updateBackground(dt) {
    this.warp = Math.max(0, this.warp - dt * 0.7);
    this.pulse = Math.max(0, this.pulse - dt * 1.4);
    this.travelSpeed = damp(this.travelSpeed, 4 + this.warp * 90, 6, dt);
    this.travel += this.travelSpeed * dt;
    const su = this.sky.material.uniforms;
    su.uTime.value = this.time;
    su.uDanger.value = this.danger;
    su.uPulse.value = this.pulse * 0.3;
    const st = this.stars.material.uniforms;
    st.uTime.value = this.time;
    st.uTravel.value = this.travel;
    const fl = this.floor.material.uniforms;
    fl.uTravel.value = this.travel * 0.5;
    fl.uDanger.value = this.danger;
    this.skyGroup.position.copy(this.camera.position).multiplyScalar(0.85);
    this.skyGroup.position.y = 0;
    this.floor.position.set(-this.skyGroup.position.x, -14, -this.skyGroup.position.z);

    const d = this.dummy;
    const q = this.tmpQ;
    this.decoItems.forEach((it, i) => {
      it.rot.x += it.spin.x * dt;
      it.rot.y += it.spin.y * dt;
      it.rot.z += it.spin.z * dt;
      it.pos.y += it.drift * dt;
      if (it.pos.y > 30) it.pos.y = -20;
      q.setFromEuler(it.rot);
      it.cells.forEach(([x, y], k) => {
        d.position.set(x, y, 0).multiplyScalar(it.scale).applyQuaternion(q).add(it.pos).sub(this.skyGroup.position);
        d.quaternion.copy(q);
        d.scale.setScalar(it.scale * 0.98);
        d.updateMatrix();
        this.deco.setMatrixAt(i * 4 + k, d.matrix);
      });
    });
    this.deco.instanceMatrix.needsUpdate = true;
  }

  /* Adaptive quality: judge real frame times over 1.5 s windows and step
     down a tier when the average is below ~45 fps. A gap over 3 s (tab was
     hidden, device asleep) restarts the window instead of counting. */
  watchFrameRate() {
    if (!this.autoQuality) return;
    const now = performance.now();
    const w = this.fpsWindow;
    if (!w || now - w.last > 3000 || document.hidden) {
      this.fpsWindow = { t0: now, last: now, n: 0 };
      return;
    }
    w.n++;
    w.last = now;
    if (now - w.t0 < 1500) return;
    const avg = (now - w.t0) / w.n;
    this.fpsWindow = null;
    if (avg > 1000 / 45) {
      if (this.qualityName === 'high') this.setQuality('medium');
      else if (this.qualityName === 'medium') this.setQuality('low');
    }
  }

  setAutoQuality(on, fallback) {
    this.autoQuality = on;
    this.fpsWindow = null;
    if (!on) this.setQuality(fallback);
    else this.setQuality('high');
  }

  frame(dt, game, stage, previewRects) {
    this.time += dt;
    const W = Math.max(1, window.innerWidth), H = Math.max(1, window.innerHeight);
    this.resize(W, H);

    if (game) {
      const h = game.stackHeight();
      this.danger = damp(this.danger, game.state !== 'over' && h >= 15 ? 1 : 0, 3, dt);
    }
    if (this.overT >= 0) this.overT += dt;
    this.updateTheme(dt);
    this.updateSpring(dt);
    this.frameCamera(stage, W, H, dt);

    if (game) {
      this.syncCells(game, dt);
      this.syncPiece(game, dt);
      this.syncBoardTexture(game);
    }
    const pu = this.panel.material.uniforms;
    pu.uTime.value = this.time;
    pu.uDanger.value = this.danger;
    pu.uGrid.value = this.showGrid ? 1 : 0;
    pu.uWave.value = this.overT >= 0 ? Math.min(1, this.overT) * 0.7 : 0;
    this.ghostMat.uniforms.uTime.value = this.time;

    this.syncPreviews(game, previewRects, dt);
    this.particles.update(dt);
    this.updateFx(dt);
    this.updateBackground(dt);

    if (this.bloom) this.bloom.strength = 0.38 + this.pulse * 0.45;
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    this.watchFrameRate();
  }
}
