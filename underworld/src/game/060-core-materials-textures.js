/* =====================================================================
   [CORE] SHARED UNIFORMS, PROCEDURAL MATERIALS & TEXTURES
   ===================================================================== */
const U = {
  uNight: { value: 0 }, uWet: { value: 0 }, uTime: { value: 0 }, uRain: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) }, uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
  uZenith: { value: new THREE.Color(0.25, 0.45, 0.8) }, uHorizon: { value: new THREE.Color(0.7, 0.8, 0.9) },
  uCloud: { value: 0.3 }, uCloudDark: { value: 0 }, uFogCol: { value: new THREE.Color() }, uFogDen: { value: 0.002 },
  uCam: { value: new THREE.Vector3() }, uStars: { value: 0 }, uMoonDir: { value: new THREE.Vector3(-0.3, 0.6, -0.2) },
  uWind: { value: 0.4 }, uHaze: { value: 0.002 }, uAO: { value: null }, uCloudShadow: { value: 0.3 }
};

const GLSL_NOISE = `
float pvh(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float pvn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(pvh(i),pvh(i+vec2(1.0,0.0)),f.x), mix(pvh(i+vec2(0.0,1.0)),pvh(i+vec2(1.0,1.0)),f.x), f.y); }
float pvf(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*pvn(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
`;
// derivative bump mapping: h is a height in metres sampled per pixel
const GLSL_BUMP = `
// where the screen derivatives degenerate (ground far off at a grazing angle) det and the height gradient are both 0:
// normalize(0) is NaN, and bloom smears one NaN pixel over half the screen as black. Keep the plain normal there.
vec3 pvBump(vec3 sp, vec3 sn, float h, float k){
  vec3 sx = dFdx(sp), sy = dFdy(sp);
  vec3 r1 = cross(sy, sn), r2 = cross(sn, sx);
  float det = dot(sx, r1);
  vec2 dh = vec2(dFdx(h), dFdy(h)) * k;
  vec3 g = sign(det) * (dh.x * r1 + dh.y * r2);
  vec3 v = abs(det) * sn - g; float l2 = dot(v, v);
  return l2 > 1e-30 ? v * inversesqrt(l2) : sn;
}
float pvRect(vec2 f, vec4 r, vec2 fw){
  return smoothstep(r.x-fw.x, r.x+fw.x, f.x) * (1.0-smoothstep(r.y-fw.x, r.y+fw.x, f.x))
       * smoothstep(r.z-fw.y, r.z+fw.y, f.y) * (1.0-smoothstep(r.w-fw.y, r.w+fw.y, f.y));
}
`;
// moving cloud shadows across the city
const GLSL_CLOUDSHADOW = `
float pvCloudShadow(vec2 p){
  float c = pvn(p * 0.0045 + vec2(uTime * 0.004, uTime * 0.0016)) * 0.65 + pvn(p * 0.011 - vec2(uTime * 0.006, 0.0)) * 0.35;
  return 1.0 - smoothstep(0.45, 0.75, c) * uCloudShadow;
}`;

/* ---------------- Atmosphere: height fog + sun in-scatter on every world material ---------------- */
THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth; varying vec3 vFogWorld;
#endif`;
THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorld = (mvPosition.xyz - viewMatrix[3].xyz) * mat3(viewMatrix);
#endif`;
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor; varying float vFogDepth; varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear; uniform float fogFar;
  #endif
  #ifdef PV_ATMOS
    uniform vec3 pvSunDir; uniform vec3 pvSunCol; uniform float pvHaze; uniform float pvNight;
  #endif
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  vec3 fogC = fogColor;
  #ifdef PV_ATMOS
    vec3 fdir = normalize(vFogWorld - cameraPosition);
    // low-lying haze thickens toward the ground and the water
    float hh = max(min(vFogWorld.y, cameraPosition.y), 0.0);
    float haze = (1.0 - exp(-vFogDepth * pvHaze)) * exp(-hh * 0.045);
    fogFactor = clamp(fogFactor + haze * 0.42, 0.0, 1.0);
    float sunAmt = pow(max(dot(fdir, pvSunDir), 0.0), 6.0) * (1.0 - pvNight);
    fogC = mix(fogColor, pvSunCol * 1.15, sunAmt * 0.45);
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );
#endif`;
// patch any built-in material so the fog chunk can read the live atmosphere uniforms
function atmos(m, extra) {
  m.defines = Object.assign(m.defines || {}, { PV_ATMOS: '' });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    sh.uniforms.pvSunDir = U.uSunDir; sh.uniforms.pvSunCol = U.uSunCol; sh.uniforms.pvHaze = U.uHaze; sh.uniforms.pvNight = U.uNight;
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev(sh, r);
    if (extra) extra(sh, r);
  };
  return m;
}

function patchWorldVaryings(sh, extraAttribs = '') {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>
      ${extraAttribs}
      varying vec3 vPW; varying vec3 vPN;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      { vec4 pw = vec4(transformed, 1.0); vec3 pn = objectNormal;
        #ifdef USE_INSTANCING
          pw = instanceMatrix * pw; pn = mat3(instanceMatrix) * pn;
        #endif
        pw = modelMatrix * pw; vPW = pw.xyz; vPN = normalize(mat3(modelMatrix) * pn); }`);
}

/* ---------------- Buildings: ten facade families, recessed bump-mapped windows ----------------
   aB = (style + 16*groundType, seed, floorHeight, bayX)   aO = (originX, originY, originZ, bayZ)
   styles: 0 glass 1 office 2 brick 3 stucco 4 industrial 5 siding 6 deco 7 apartment 8 parking 9 warehouse
   ground: 0 same as upper 1 shopfront 2 lobby 3 loading/garage doors                                   */
function makeBuildingMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, envMapIntensity: 0.55 });
  m.defines = { PV_HQ: '' };
  atmos(m, sh => {
    sh.uniforms.uNight = U.uNight; sh.uniforms.uWet = U.uWet; sh.uniforms.uTime = U.uTime; sh.uniforms.uCloudShadow = U.uCloudShadow;
    patchWorldVaryings(sh, 'attribute vec4 aB; attribute vec4 aO; varying vec4 vB; varying vec4 vBO;');
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vB = aB; vBO = aO;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight; uniform float uWet; uniform float uTime; uniform float uCloudShadow;
        varying vec3 vPW; varying vec3 vPN; varying vec4 vB; varying vec4 vBO;
        ${GLSL_NOISE}
        ${GLSL_BUMP}
        ${GLSL_CLOUDSHADOW}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec3 n = normalize(vPN);
        float code = floor(vB.x + 0.5);
        float style = mod(code, 16.0); float gtype = floor(code / 16.0);
        float seed = floor(vB.y + 0.5); float fh = vB.z;
        vec3 base = diffuseColor.rgb;
        vec3 col = base; float rough = 0.86; float metal = 0.0; vec3 emis = vec3(0.0);
        float hgt = 0.0; float ao = 1.0;
        if (abs(n.y) < 0.45) {
          float side = abs(n.x) > 0.5 ? 1.0 : 0.0;
          float bw = side > 0.5 ? vBO.w : vB.w;
          float u = side > 0.5 ? (vPW.z - vBO.z) : (vPW.x - vBO.x);
          float v = vPW.y - vBO.y;
          vec2 cell = vec2(u / bw, v / fh);
          vec2 id = floor(cell); vec2 f = fract(cell);
          vec2 fw = fwidth(cell) * 0.8 + 0.002;
          float far = smoothstep(0.12, 0.45, max(fw.x, fw.y));
          float facing = side * 2.0 + step(0.0, n.x + n.z);
          float h = pvh(id + vec2(seed * 3.7 + facing * 17.0, seed * 1.3));
          float h2 = pvh(id.yx * 1.31 + seed + facing);
          float h3 = pvh(id * 0.77 + vec2(facing, seed * 9.1));
          float nz = pvn(vec2(u, v) * 0.7);
          col *= 0.9 + 0.2 * nz;
          // weathering: dirt runs and base grime
          float streak = pvn(vec2(u * 2.6 + seed, v * 0.12));
          col *= 1.0 - 0.13 * smoothstep(0.55, 0.92, streak) * (1.0 - far);
          ao *= 0.62 + 0.38 * smoothstep(0.0, 1.8, v);
          vec4 wr = vec4(0.2, 0.8, 0.24, 0.82);
          float litFrac = 0.5, panes = 1.0, transom = 0.0, depth = 0.12;
          vec3 frameCol = base * 0.55;
          float glassStyle = 0.0;
          bool ground = v < fh && gtype > 0.5;
          if (style < 0.5) { // modern glass curtain wall
            wr = vec4(0.015, 0.985, 0.1, 0.96); litFrac = 0.42; depth = 0.03; frameCol = vec3(0.1, 0.11, 0.13); glassStyle = 1.0;
            col = mix(base * 0.5, base, 0.4);
          } else if (style < 1.5) { // office ribbon windows over concrete bands
            wr = vec4(0.0, 1.0, 0.32, 0.86); litFrac = 0.45; depth = 0.09; frameCol = vec3(0.16, 0.17, 0.19); panes = 2.0;
            hgt += smoothstep(0.06, 0.0, f.y) * 0.04;
            hgt += (pvn(vec2(u, v) * 6.0) - 0.5) * 0.004;
          } else if (style < 2.5 || style > 8.5) { // brick (older walk-ups and warehouses)
            vec2 bp = vec2(u * 4.1 + step(0.5, fract(v * 3.3 * 0.5)) * 0.5, v * 3.3);
            vec2 bf = abs(fract(bp) - 0.5);
            float mortar = max(1.0 - smoothstep(0.0, 0.06, 0.5 - bf.y - 0.02), 1.0 - smoothstep(0.0, 0.05, 0.5 - bf.x - 0.015));
            mortar *= 1.0 - far;
            col *= (0.84 + 0.26 * pvh(floor(bp))) * (1.0 - mortar * 0.32);
            hgt -= mortar * 0.008;
            if (style > 8.5) { wr = vec4(0.12, 0.88, 0.45, 0.86); litFrac = 0.22; panes = 3.0; transom = 0.7; if (mod(id.x, 2.0) > 0.5) wr = vec4(0.0); }
            else { wr = vec4(0.3, 0.7, 0.24, 0.78); litFrac = 0.62; panes = 2.0; transom = 0.72; }
            frameCol = mix(vec3(0.92, 0.9, 0.84), vec3(0.18, 0.2, 0.18), step(0.6, pvh(vec2(seed, 2.0))));
            // stone lintel and sill
            float lintel = pvRect(f, vec4(wr.x - 0.04, wr.y + 0.04, wr.w, wr.w + 0.06), fw);
            float sill = pvRect(f, vec4(wr.x - 0.05, wr.y + 0.05, wr.z - 0.05, wr.z), fw);
            col = mix(col, vec3(0.74, 0.71, 0.65), max(lintel, sill) * (1.0 - far));
            hgt += (lintel + sill) * 0.03;
          } else if (style < 3.5) { // painted stucco with pilasters
            wr = vec4(0.18, 0.82, 0.22, 0.84); litFrac = 0.5; panes = 2.0; depth = 0.1;
            float pil = 1.0 - smoothstep(0.0, 0.03 + fw.x, min(f.x, 1.0 - f.x) - 0.04);
            hgt += pil * 0.05; col *= 1.0 + pil * 0.06;
            hgt += (pvn(vec2(u, v) * 14.0) - 0.5) * 0.003;
            frameCol = mix(vec3(0.15, 0.2, 0.16), vec3(0.32, 0.2, 0.14), step(0.5, pvh(vec2(seed, 5.0))));
          } else if (style < 4.5) { // corrugated industrial cladding
            float rib = sin(u * 6.2832 * 2.6);
            hgt += rib * 0.02 * (1.0 - far);
            col *= 0.88 + 0.12 * smoothstep(-0.3, 0.3, rib);
            col *= 1.0 - 0.18 * smoothstep(0.6, 0.95, pvn(vec2(u * 0.6, v * 0.25 + seed))); // rust stains
            wr = vec4(0.08, 0.92, 0.66, 0.88); litFrac = 0.18; panes = 4.0; depth = 0.05; metal = 0.25; rough = 0.6;
            if (mod(id.x + seed, 3.0) > 0.5) wr = vec4(0.0);
            frameCol = vec3(0.3, 0.32, 0.34);
          } else if (style < 5.5) { // clapboard siding houses
            float cb = fract(v * 3.6);
            hgt += cb * 0.012 * (1.0 - far); col *= 0.9 + 0.12 * cb;
            wr = vec4(0.3, 0.7, 0.28, 0.76); litFrac = 0.6; panes = 2.0; transom = 0.5; depth = 0.07;
            if (h3 > 0.78) wr = vec4(0.0);
            frameCol = vec3(0.95);
            float shut = (pvRect(f, vec4(wr.x - 0.11, wr.x - 0.02, wr.z, wr.w), fw) + pvRect(f, vec4(wr.y + 0.02, wr.y + 0.11, wr.z, wr.w), fw)) * step(0.4, pvh(vec2(seed, 7.0)));
            col = mix(col, mix(vec3(0.12, 0.2, 0.32), vec3(0.15, 0.28, 0.17), step(0.5, pvh(vec2(seed, 8.0)))), shut * (1.0 - far));
            hgt += shut * 0.015;
          } else if (style < 6.5) { // art deco stone with piers
            wr = vec4(0.24, 0.76, 0.14, 0.9); litFrac = 0.4; depth = 0.16; panes = 2.0;
            float pier = 1.0 - smoothstep(0.0, 0.02 + fw.x, abs(f.x - 0.5) - 0.44);
            pier = max(pier, 1.0 - smoothstep(0.0, 0.02 + fw.x, min(f.x, 1.0 - f.x) - 0.06));
            hgt += pier * 0.08; col *= 1.0 + pier * 0.1;
            frameCol = vec3(0.2, 0.18, 0.15);
          } else if (style < 7.5) { // apartment panels
            vec2 pj = abs(fract(vec2(u / (bw * 0.5), v / fh)) - 0.5);
            float joint = 1.0 - smoothstep(0.47, 0.49, max(pj.x * 1.0, pj.y));
            joint = (1.0 - joint) * (1.0 - far);
            hgt -= joint * 0.01; col *= 1.0 - joint * 0.15;
            col = mix(col, col * vec3(1.05, 0.98, 0.9), step(0.5, mod(id.x + id.y, 2.0)) * 0.3);
            wr = vec4(0.12, 0.62, 0.2, 0.86); litFrac = 0.65; panes = 2.0; transom = 0.0; depth = 0.1;
            frameCol = vec3(0.22, 0.23, 0.25);
          } else { // open parking deck
            wr = vec4(0.0, 1.0, 0.32, 0.9); litFrac = 1.0; depth = 0.5; glassStyle = 2.0;
            float col2 = 1.0 - smoothstep(0.0, 0.02 + fw.x, min(f.x, 1.0 - f.x) - 0.05);
            wr.x = 0.07; wr.y = 0.93;
            col *= 0.95 + 0.1 * pvn(vec2(u, v) * 3.0);
            hgt += col2 * 0.05;
          }
          // ground floor treatments
          float door = 0.0;
          if (ground) {
            if (gtype < 1.5) { // shopfront
              wr = vec4(0.04, 0.96, 0.04, 0.8); panes = 1.0; transom = 0.0; depth = 0.14; litFrac = 0.85; glassStyle = 0.0;
              frameCol = mix(vec3(0.1), vec3(0.55, 0.12, 0.1), step(0.7, h2));
              if (h < 0.3) { door = pvRect(f, vec4(0.36, 0.64, 0.0, 0.78), fw); }
              float band = pvRect(f, vec4(0.0, 1.0, 0.84, 0.98), fw);
              col = mix(col, mix(vec3(0.12, 0.13, 0.15), vec3(0.65, 0.18, 0.12), step(0.55, h3)), band * (1.0 - far));
            } else if (gtype < 2.5) { // lobby glass
              wr = vec4(0.02, 0.98, 0.0, 0.92); panes = 3.0; depth = 0.08; litFrac = 0.95; frameCol = vec3(0.12);
              if (mod(id.x, 3.0) < 0.5) door = pvRect(f, vec4(0.25, 0.75, 0.0, 0.7), fw);
            } else { // loading / garage doors
              wr = vec4(0.0); litFrac = 0.0;
              float rd = pvRect(f, vec4(0.1, 0.9, 0.0, 0.85), fw);
              hgt -= rd * 0.06; hgt += rd * sin(v * 6.2832 * 6.0) * 0.006;
              col = mix(col, vec3(0.42, 0.44, 0.46) * (0.9 + 0.1 * sin(v * 6.2832 * 6.0)), rd);
              metal = mix(metal, 0.35, rd);
            }
          }
          float win = pvRect(f, wr, fw);
          float outer = pvRect(f, wr + vec4(-0.035, 0.035, -0.035, 0.035), fw);
          float frame = clamp(outer - win, 0.0, 1.0);
          // mullions and transoms
          float mull = 0.0;
          if (panes > 1.5 && win > 0.0) {
            float px = (f.x - wr.x) / max(wr.y - wr.x, 1e-3) * panes;
            float db = min(fract(px), 1.0 - fract(px)) * (wr.y - wr.x) / panes;
            mull = (1.0 - smoothstep(0.012, 0.012 + fw.x, db)) * step(0.5, px) * step(px, panes - 0.5);
          }
          if (transom > 0.0) mull = max(mull, 1.0 - smoothstep(0.0, 0.012 + fw.y, abs(f.y - (wr.z + (wr.w - wr.z) * transom))));
          if (glassStyle > 0.5 && glassStyle < 1.5) mull = max(mull, (1.0 - smoothstep(0.0, 0.01 + fw.y, abs(f.y - 0.55))) * 0.7);
          mull *= win * (1.0 - far);
          frame = max(frame, mull); win *= 1.0 - mull;
          win = mix(win, (wr.y - wr.x) * (wr.w - wr.z) * 0.85, far);
          frame *= 1.0 - far;
          // recess: glass sits behind the wall plane, frame stands proud
          hgt += -win * depth + frame * 0.02;
          float recessShadow = smoothstep(wr.w - 0.16, wr.w, f.y) * win * (1.0 - far) + smoothstep(wr.x + 0.08, wr.x, f.x) * win * 0.4 * (1.0 - far);
          // glass appearance
          vec3 glass = mix(vec3(0.035, 0.05, 0.065), vec3(0.15, 0.19, 0.24), h2 * 0.7);
          if (glassStyle > 0.5 && glassStyle < 1.5) glass = mix(glass, base * 0.6, 0.55);
          float blind = step(0.68, h2) * step(f.y, wr.w - 0.02) * step(wr.w - (h3 * 0.55 + 0.12) * (wr.w - wr.z), f.y);
          glass = mix(glass, mix(vec3(0.6, 0.57, 0.5), vec3(0.35, 0.42, 0.5), step(0.5, h3)), blind * 0.7);
          glass *= 1.0 - recessShadow * 0.5;
          if (glassStyle > 1.5) glass = vec3(0.05, 0.05, 0.055) * (0.6 + 0.4 * f.y);
          // night: interiors light up progressively, with furniture silhouettes and the odd flickering TV
          float lit = step(h, uNight * litFrac);
          vec3 litCol = mix(vec3(1.0, 0.7, 0.38), vec3(0.72, 0.84, 1.0), step(0.84, h2));
          if (ground && gtype < 1.5) litCol = mix(vec3(1.0, 0.85, 0.62), vec3(0.85, 0.93, 1.0), step(0.6, h2));
          if (glassStyle > 1.5) litCol = vec3(0.75, 0.85, 0.95) * step(0.35, h);
          float tv = step(0.93, h2) * (0.75 + 0.25 * sin(uTime * 11.0 + h * 60.0) * sin(uTime * 3.7 + h3 * 20.0));
          litCol *= (0.3 + 0.5 * h3) * (1.0 + tv);
          float furn = pvRect(f, vec4(wr.x + 0.1 + h3 * 0.3, wr.x + 0.35 + h3 * 0.3, wr.z, wr.z + 0.12 + h * 0.15), fw) * (1.0 - far);
          float grad = (ground ? 0.45 + 0.65 * f.y * f.y : 0.7 + 0.4 * f.y) * (1.0 - furn * 0.7) * (1.0 - blind * 0.45);
          col = mix(col, frameCol, frame);
          col = mix(col, glass, win);
          col = mix(col, vec3(0.08, 0.07, 0.065), door);
          rough = mix(rough, 0.45, frame);
          rough = mix(rough, 0.06 + blind * 0.4 + (glassStyle > 1.5 ? 0.8 : 0.0), win);
          metal = mix(metal, 0.4, frame * step(style, 1.5));
          metal = mix(metal, glassStyle > 1.5 ? 0.0 : 0.82 - blind * 0.6, win);
          emis += litCol * lit * win * grad * (ground ? 0.9 : 0.85) * (1.0 - far * 0.3);
          emis += litCol * lit * door * 0.25;
          hgt -= door * 0.08;
          ao *= 1.0 - recessShadow * 0.25;
        } else if (n.y > 0.45) {
          if (n.y > 0.97) {
            // roofs (G3): each building picks a covering from its seed (white membrane with welded seams, black
            // tar, pale gravel, a planted green roof on the newer towers, or bare concrete in the building's tone)
            float g = pvn(vPW.xz * 3.0), rk = pvh(vec2(seed * 1.7, 31.0)), wear = pvn(vPW.xz * 1.3);
            vec3 rc;
            if (rk < 0.3) { // membrane: light, with seams every 1.8 m
              rc = vec3(0.7, 0.7, 0.68); float sm = abs(fract(vPW.x / 1.8 + seed) - 0.5); rc *= 1.0 - (1.0 - smoothstep(0.0, 0.02 + fwidth(vPW.x / 1.8), sm)) * 0.12; hgt -= (1.0 - smoothstep(0.0, 0.03, sm)) * 0.004;
              rc *= 0.86 + 0.18 * wear; rough = 0.7;
            } else if (rk < 0.55) { rc = vec3(0.16, 0.16, 0.17) * (0.85 + 0.3 * wear); rc += step(0.97, pvh(floor(vPW.xz * 6.0))) * 0.05; rough = 0.62; } // tar
            else if (rk < 0.78) { rc = vec3(0.46, 0.44, 0.4) * (0.8 + 0.3 * g) * (0.88 + 0.2 * wear); hgt += g * 0.012; rough = 0.95; } // gravel
            else if (rk < 0.86 && (style < 1.5 || style > 5.5 && style < 7.5)) { // a green roof
              float tuft = pvn(vPW.xz * 2.2 + seed); rc = mix(vec3(0.2, 0.31, 0.12), vec3(0.34, 0.42, 0.17), tuft) * (0.85 + 0.25 * g); hgt += tuft * 0.02; rough = 0.95;
              rc = mix(rc, vec3(0.5, 0.48, 0.44), (1.0 - smoothstep(0.0, 0.12, abs(fract(vPW.z / 6.0) - 0.5))) * 0.8); // stepping-stone paths
            } else { rc = mix(base, vec3(0.55, 0.54, 0.51), 0.55) * (0.82 + 0.26 * wear); rough = 0.88; } // concrete
            col = rc;
            col *= 1.0 - 0.2 * smoothstep(0.62, 0.86, pvn(vPW.xz * 0.35 + seed)); // weathering patches
            col *= 1.0 - 0.12 * step(0.985, pvh(floor(vPW.xz * 1.5) + seed)); // stains under old units
          } else {
            float tl = fract(vPW.y * 5.0);
            col = base * (0.78 + 0.22 * tl) * (0.9 + 0.2 * pvn(vPW.xz * 2.0));
            hgt += tl * 0.02; rough = 0.78;
          }
        } else { ao = 0.4; }
        col *= ao * pvCloudShadow(vPW.xz);
        col *= 1.0 - uWet * 0.2;
        rough = mix(rough, rough * 0.55, uWet);
        diffuseColor.rgb = col;
        roughnessFactor = rough; metalnessFactor = metal;
        totalEmissiveRadiance += emis;
        #ifdef PV_HQ
          normal = pvBump(-vViewPosition, normal, hgt, 1.0);
        #endif
      }`);
  });
  m.customProgramCacheKey = () => 'pv-building2';
  return m;
}

/* ---------------- Ground: roads, boulevards, markings, sidewalks, lots, parks ----------------
   Boulevards (road index 6 in both directions) carry two lanes per direction. */
const BLVD = 6;
function isBoulevard(axisIndex) { return axisIndex === BLVD; }
function makeGroundMaterial(blockTex, roadTex, localTex) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, envMapIntensity: 0.6 });
  m.defines = { PV_HQ: '' };
  atmos(m, sh => {
    sh.uniforms.uNight = U.uNight; sh.uniforms.uWet = U.uWet; sh.uniforms.uBlock = { value: blockTex }; sh.uniforms.uRoad = { value: roadTex }; sh.uniforms.uLocal = { value: localTex }; sh.uniforms.uTime = U.uTime;
    sh.uniforms.uAO = U.uAO; sh.uniforms.uRain = U.uRain; sh.uniforms.uCloudShadow = U.uCloudShadow; sh.uniforms.uHorizon = U.uHorizon; sh.uniforms.uZenith = U.uZenith;
    patchWorldVaryings(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight; uniform float uWet; uniform sampler2D uBlock; uniform sampler2D uRoad; uniform sampler2D uLocal; uniform float uTime; uniform sampler2D uAO; uniform float uRain; uniform float uCloudShadow; uniform vec3 uHorizon; uniform vec3 uZenith;
        varying vec3 vPW; varying vec3 vPN;
        ${GLSL_NOISE}
        ${GLSL_BUMP}
        ${GLSL_CLOUDSHADOW}
        float lineAA(float d, float w){ float fw = fwidth(d) + 0.001; return 1.0 - smoothstep(w - fw, w + fw, d); }
        float boxAA(vec2 q, vec2 hs){ vec2 d = abs(q) - hs; float s = max(d.x, d.y); float fw = fwidth(s) + 0.001; return 1.0 - smoothstep(-fw, fw, s); }
        // straight arrow painted in lane coordinates (q.x lateral, q.y along toward the junction)
        float arrowS(vec2 q){ float shaft = boxAA(q - vec2(0.0, -0.9), vec2(0.12, 1.1)); vec2 t = q - vec2(0.0, 0.55); float head = step(0.0, t.y) * step(t.y, 0.9) * step(abs(t.x), 0.42 * (1.0 - t.y / 0.9)); return max(shaft, head); }
        float arrowL(vec2 q, float dir){ float shaft = boxAA(q - vec2(0.0, -0.9), vec2(0.12, 1.1)); vec2 t = q - vec2(dir * 0.35, 0.35); t.x *= dir; float bar = boxAA(t - vec2(0.0, 0.0), vec2(0.35, 0.12)); vec2 hq = vec2(t.x - 0.35, t.y); float head = step(0.0, hq.x) * step(hq.x, 0.6) * step(abs(hq.y), 0.38 * (1.0 - hq.x / 0.6)); return max(max(shaft * step(q.y, 0.45), bar), head); }
        float lampPool(vec2 p, float vO, float hO){
          vec2 ci = floor(p / 80.0); vec2 l = p - ci * 80.0;
          float dx = min(min(abs(l.x - 5.3), abs(l.x - 74.7)), min(abs(l.x + 5.3), abs(l.x - 85.3)));
          float dz = min(min(abs(l.y - 16.0), abs(l.y - 40.0)), abs(l.y - 64.0));
          float g1 = exp(-(dx*dx + dz*dz) / 50.0);
          float dz2 = min(min(abs(l.y - 5.3), abs(l.y - 74.7)), min(abs(l.y + 5.3), abs(l.y - 85.3)));
          float dx2 = min(min(abs(l.x - 16.0), abs(l.x - 40.0)), abs(l.x - 64.0));
          float g2 = exp(-(dx2*dx2 + dz2*dz2) / 50.0);
          return max(g1 * step(0.5, vO), g2 * step(0.5, hO));
        }
        // the street lamp nearest a ground point, as the offset from the point to the lamp's foot (0 when its road is
        // closed or the point is outside the city): the same lamp layout as lampPool
        vec2 lampOff(vec2 s){
          if (s.x < -6.0 || s.y < -6.0 || s.x > 966.0 || s.y > 966.0) return vec2(1e3);
          vec2 ci = floor(s / 80.0); vec2 l = s - ci * 80.0;
          vec2 rcl = clamp(floor((s + 40.0) / 80.0), 0.0, 12.0);
          float vO = texture2D(uRoad, (vec2(rcl.x, clamp(ci.y, 0.0, 11.0)) + 0.5) / 16.0).r;
          float hO = texture2D(uRoad, (vec2(clamp(ci.x, 0.0, 11.0), rcl.y) + 0.5) / 16.0).g;
          float ex = l.x < 40.0 ? (l.x < 0.0 ? -5.3 : 5.3) : (l.x > 80.0 ? 85.3 : 74.7);
          float ez = l.y < 40.0 ? (l.y < 0.0 ? -5.3 : 5.3) : (l.y > 80.0 ? 85.3 : 74.7);
          vec2 a = vec2(ex, l.y < 28.0 ? 16.0 : l.y < 52.0 ? 40.0 : 64.0) - l;
          vec2 b = vec2(l.x < 28.0 ? 16.0 : l.x < 52.0 ? 40.0 : 64.0, ez) - l;
          a = vO > 0.5 ? a : vec2(1e3); b = hO > 0.5 ? b : vec2(1e3);
          return dot(a, a) < dot(b, b) ? a : b;
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec2 p = vPW.xz;
        vec2 ci = floor(p / 80.0); vec2 l = p - ci * 80.0;
        vec2 dr = min(l, 80.0 - l);
        vec2 so = vec2(l.x < 40.0 ? l.x : l.x - 80.0, l.y < 40.0 ? l.y : l.y - 80.0);
        vec2 ri = floor((p + 40.0) / 80.0); // nearest road index on each axis
        bool inCity = p.x > -6.0 && p.y > -6.0 && p.x < 966.0 && p.y < 966.0;
        bool rx = dr.x < 6.0; bool rz = dr.y < 6.0;
        // which lattice roads exist here (superblocks close some segments)
        vec2 rcl = clamp(ri, 0.0, 12.0);
        vec4 rnV = texture2D(uRoad, (vec2(rcl.x, clamp(floor(p.y / 80.0), 0.0, 11.0)) + 0.5) / 16.0);
        vec4 rnH = texture2D(uRoad, (vec2(clamp(floor(p.x / 80.0), 0.0, 11.0), rcl.y) + 0.5) / 16.0);
        vec4 rnN = texture2D(uRoad, (rcl + 0.5) / 16.0);
        float vOpen = rnV.r, hOpen = rnH.g, junc = rnN.b;
        if (rx && rz) { rx = rnN.a > 0.5; rz = rx; }
        else { rx = rx && vOpen > 0.5; rz = rz && hOpen > 0.5; }
        if (!inCity) { vOpen = 1.0; hOpen = 1.0; junc = 1.0; }
        vec3 col = vec3(0.5); float rough = 0.9; float isRoad = 0.0; float hgt = 0.0; float puddleMask = 0.0;
        float n1 = pvf(p * 0.35); float n2 = pvn(p * 3.7);
        vec2 auv = (p + 48.0) / 1056.0;
        float aoTex = texture2D(uAO, vec2(auv.x, 1.0 - auv.y)).r;
        float spill = 0.0;
        if (vPN.y < 0.5) {
          col = vec3(0.56, 0.56, 0.54) * (0.88 + 0.12 * n2) * (0.75 + 0.25 * smoothstep(-0.05, 0.12, vPW.y)); rough = 0.85;
        } else if (inCity && (rx || rz)) {
          isRoad = 1.0;
          float grain = pvn(p * 23.0);
          col = vec3(0.15, 0.155, 0.165) * (0.8 + 0.36 * n1) + (n2 - 0.5) * 0.03 + (grain - 0.5) * 0.035;
          // aggregate speckles
          col += step(0.93, pvh(floor(p * 18.0))) * 0.035;
          hgt += grain * 0.004;
          rough = 0.88;
          // repaired patches with darker fresh asphalt and seams
          vec2 pc = floor(p / 7.0); vec2 pf = fract(p / 7.0);
          float ph = pvh(pc + 13.0);
          if (ph > 0.84) { vec2 hs = vec2(0.2 + pvh(pc + 3.0) * 0.25, 0.15 + pvh(pc + 7.0) * 0.3); float rpatch = boxAA(pf - 0.5, hs); col = mix(col, vec3(0.105, 0.11, 0.115) * (0.9 + 0.2 * grain), rpatch * 0.9); float seam = boxAA(pf - 0.5, hs + 0.012) - rpatch; col *= 1.0 - seam * 0.3; }
          // cracks (thin grooves)
          float cr = abs(pvn(p * 0.9) - 0.5);
          float crack = (1.0 - smoothstep(0.0, 0.012 + fwidth(cr), cr)) * step(0.58, pvn(p * 0.21 + 5.0));
          col *= 1.0 - crack * 0.4; hgt -= crack * 0.01;
          if (!(rx && rz)) {
            float roadIdx = rx ? ri.x : ri.y;
            bool blvd = roadIdx > 5.5 && roadIdx < 6.5;
            float off = rx ? so.x : so.y;
            float along = rx ? dr.y : dr.x;
            float alongS = rx ? so.y : so.x;
            float aoff = abs(off);
            vec2 sbi = rx ? vec2(clamp(ri.x, 0.0, 11.0), clamp(floor(p.y / 80.0), 0.0, 11.0)) : vec2(clamp(floor(p.x / 80.0), 0.0, 11.0), clamp(ri.y, 0.0, 11.0));
            float rstyle = inCity ? floor(texture2D(uBlock, (sbi + 0.5) / 12.0).g * 255.0 + 0.5) : 0.0;
            float paint = 1.0;
            if (rstyle > 0.5 && rstyle < 1.5) {
              col *= vec3(1.06, 1.0, 0.92);
              if (aoff > 4.35) { vec2 cq = vec2(alongS / 0.62, (aoff - 4.35) / 0.42); vec2 cf = fract(cq + vec2(0.5 * step(0.5, fract(cq.y * 0.5)), 0.0)); float grout = max(1.0 - smoothstep(0.0, 0.09, min(cf.x, 1.0 - cf.x)), 1.0 - smoothstep(0.0, 0.12, min(cf.y, 1.0 - cf.y))); col = mix(vec3(0.36, 0.33, 0.3) * (0.78 + 0.4 * pvh(floor(cq))), vec3(0.1), grout * 0.7); rough = 0.75; hgt += (1.0 - grout) * 0.01; }
            } else if (rstyle > 1.5 && rstyle < 2.5) { col *= 0.82; rough = 0.8; }
            else if (rstyle > 2.5 && rstyle < 3.5) {
              float slab = pvh(vec2(floor(alongS / 6.0), floor(off / 3.0) + roadIdx * 7.0));
              col = mix(col, vec3(0.2, 0.197, 0.19) * (0.86 + 0.18 * n1) * (0.88 + 0.24 * slab) + (grain - 0.5) * 0.03, 0.9);
              float jf = abs(fract(alongS / 6.0) - 0.5) * 6.0; // 3 at a slab joint
              float joint = max(smoothstep(2.82, 2.95, jf), lineAA(abs(aoff - 3.0), 0.05));
              col *= 1.0 - joint * 0.5; hgt -= joint * 0.012; paint = 0.5; rough = 0.92;
            } else if (rstyle > 3.5 && rstyle < 4.5) { col *= 1.08; rough = 0.82; }
            else if (rstyle > 4.5) { col *= 0.78; rough = 0.62; col += vec3(0.16, 0.03, 0.14) * uNight * (0.08 + 0.25 * uWet) * (0.6 + 0.4 * pvf(p * 0.07)); }
            // tyre wear in the wheel paths
            float wear = blvd ? smoothstep(0.8, 0.0, abs(aoff - 1.0)) + smoothstep(0.8, 0.0, abs(aoff - 2.5)) + smoothstep(0.8, 0.0, abs(aoff - 3.85)) + smoothstep(0.8, 0.0, abs(aoff - 5.35))
                              : smoothstep(0.9, 0.0, abs(aoff - 3.4)) + smoothstep(0.9, 0.0, abs(aoff - 1.8));
            col *= 1.0 - 0.09 * wear; col += vec3(0.02) * wear * step(0.5, n1);
            // oil drips where cars wait at the stop line
            float oil = smoothstep(0.62, 0.8, pvn(p * 1.4)) * smoothstep(22.0, 12.0, along) * smoothstep(0.8, 0.0, abs(aoff - (blvd ? 3.2 : 2.6))) * junc;
            col *= 1.0 - oil * 0.35; rough = mix(rough, 0.4, oil);
            float mk = 0.0; vec3 mc = vec3(0.86);
            if (along > 10.0 || junc < 0.5) {
              float y = lineAA(abs(aoff - 0.17), 0.075);
              if (rstyle > 0.5 && rstyle < 1.5 && !blvd) { y = 0.0; mk = max(mk, lineAA(aoff, 0.07) * step(0.55, fract(alongS / 4.5)) * 0.9); }
              col = mix(col, vec3(0.86, 0.66, 0.16) * 0.9, y * 0.92 * paint);
              if (blvd) {
                float dash = step(0.45, fract(alongS / 6.0));
                mk = max(mk, lineAA(abs(aoff - 3.18), 0.07) * dash);
                mk = max(mk, lineAA(abs(aoff - 5.8), 0.07));
              } else {
                mk = max(mk, lineAA(abs(aoff - 4.05), 0.06) * 0.9);
                // parking bay ticks along the shoulder
                float tick = lineAA(abs(fract((alongS + 2.0) / 6.5 + 0.5) - 0.5) * 6.5, 0.05) * step(4.05, aoff) * step(aoff, 4.7);
                float tickOn = rstyle < 0.5 || (rstyle > 1.5 && rstyle < 3.5) ? 1.0 : 0.0; // no bays in the Old Quarter, the hills or on the Strip
                mk = max(mk, tick * 0.8 * tickOn);
              }
            }
            if (junc > 0.5 && along > 6.6 && along < 9.8 && aoff < 5.6) mk = max(mk, step(0.5, fract(off / 1.1 + 0.25)) * 0.95);
            float approach = rx ? step(0.0, off * alongS) : step(0.0, -off * alongS);
            if (junc > 0.5 && approach > 0.5 && along > 10.35 && along < 10.95 && aoff > 0.35 && aoff < 5.5) mk = 1.0;
            // lane arrows just before the stop line
            if (junc > 0.5 && approach > 0.5 && along > 12.5 && along < 16.5) {
              float aq = along - 14.5;
              if (blvd) {
                mk = max(mk, arrowL(vec2((aoff - 1.75) * sign(off), -aq), rx ? (off > 0.0 ? 1.0 : -1.0) : (off > 0.0 ? -1.0 : 1.0)));
                mk = max(mk, arrowS(vec2(aoff - 4.6, -aq)));
              } else mk = max(mk, arrowS(vec2(aoff - 2.4, -aq)));
            }
            // manhole cover and kerbside storm drains
            float segH = pvh(vec2(floor((alongS + 80.0) / 80.0), roadIdx * 3.0 + (rx ? 0.0 : 50.0)));
            vec2 mh = vec2(aoff - (blvd ? 3.2 : 1.2 + segH * 2.0), along - 25.0 - segH * 12.0);
            float mr = length(mh);
            float manhole = 1.0 - smoothstep(0.38, 0.4 + fwidth(mr), mr);
            float mrim = manhole * smoothstep(0.32, 0.36, mr);
            float mgrid = manhole * step(0.5, fract((mh.x + mh.y) * 6.0));
            col = mix(col, vec3(0.2, 0.19, 0.18) * (0.85 + 0.25 * mgrid), manhole); col *= 1.0 - mrim * 0.4; hgt += manhole * 0.004 - mrim * 0.004; rough = mix(rough, 0.45, manhole);
            float drain = boxAA(vec2(aoff - 5.6, mod(along, 40.0) - 20.0), vec2(0.22, 0.45));
            float slots = drain * step(0.5, fract(along * 7.0));
            col = mix(col, vec3(0.06), drain * (0.6 + 0.4 * slots)); hgt -= drain * 0.03;
            col = mix(col, mc * (0.9 + 0.1 * n2), mk * (0.86 - 0.28 * n1) * (1.0 - manhole) * paint);
            hgt += mk * 0.002;
            // grime gathers along the kerb
            col *= 1.0 - 0.18 * smoothstep(5.3, 6.0, aoff);
          } else {
            col *= 0.95 + 0.1 * pvn(p * 0.5);
          }
          float puddle = smoothstep(0.56, 0.68, pvf(p * 0.11 + 3.0)) * uWet;
          puddleMask = puddle;
          col *= mix(1.0, 0.5, uWet);
          rough = mix(rough, 0.28, uWet); rough = mix(rough, 0.03, puddle);
          col = mix(col, col * 0.7, puddle);
        } else if (inCity) {
          vec2 bi = clamp(ci, 0.0, 11.0);
          float type = floor(texture2D(uBlock, (bi + 0.5) / 12.0).r * 255.0 + 0.5);
          // sidewalks only line roads that exist
          float sw = min(vOpen > 0.5 ? dr.x : 99.0, hOpen > 0.5 ? dr.y : 99.0);
          vec2 lc = l - 40.0;
          if (sw < 10.0) {
            // concrete slabs with joints, expansion gaps and stains
            vec2 tp = p / 1.5;
            vec2 g = abs(fract(tp) - 0.5);
            float joint = 1.0 - smoothstep(0.44, 0.49, max(g.x, g.y));
            vec2 eg = abs(fract(p / 6.0) - 0.5);
            float expj = smoothstep(0.485, 0.497, max(eg.x, eg.y));
            float sh = pvh(floor(tp));
            col = vec3(0.52, 0.51, 0.49) * (0.88 + 0.16 * sh) * (0.9 + 0.1 * n1);
            col *= 0.87 + 0.13 * joint; col *= 1.0 - expj * 0.25;
            hgt -= (1.0 - joint) * 0.004 + expj * 0.006;
            col *= 1.0 - 0.25 * smoothstep(0.7, 0.9, pvn(p * 0.8 + 11.0)); // stains
            col *= 1.0 - step(0.996, pvh(floor(p * 11.0))) * 0.18; // gum spots
            if (sw < 6.4) { col = vec3(0.62, 0.62, 0.6) * (0.9 + 0.1 * n2); hgt += 0.0; }
            col *= 1.0 - 0.22 * smoothstep(9.3, 9.95, sw) * step(type, 2.5);
            rough = 0.84;
            // storefront light spill at night
            float segId = pvh(vec2(floor((dr.x < dr.y ? p.y : p.x) / 7.0), ci.x * 7.0 + ci.y));
            spill = uNight * smoothstep(6.5, 9.9, sw) * step(0.35, segId) * (type < 2.5 ? 1.0 : (type < 3.5 ? 0.5 : 0.0));
          } else if (type < 1.5) { // downtown plaza
            vec2 tp = p / 3.0; vec2 g = abs(fract(tp) - 0.5);
            col = mix(vec3(0.55, 0.53, 0.5), vec3(0.42, 0.42, 0.44), step(0.5, pvh(floor(tp)))) * (0.92 + 0.1 * n1);
            float jt = 1.0 - smoothstep(0.46, 0.49, max(g.x, g.y));
            col *= 0.85 + 0.15 * jt; hgt -= (1.0 - jt) * 0.004;
            rough = 0.55;
          } else if (type < 2.5) {
            vec2 tp = p / 2.0; vec2 g = abs(fract(tp) - 0.5);
            float jt = 1.0 - smoothstep(0.45, 0.49, max(g.x, g.y));
            col = vec3(0.47, 0.46, 0.44) * (0.88 + 0.16 * pvh(floor(tp))) * (0.85 + 0.15 * jt); hgt -= (1.0 - jt) * 0.004;
          } else if (type < 3.5 || (type > 3.5 && type < 4.5) || (type > 5.5 && type < 6.5)) {
            float gn = pvf(p * 0.6) * 0.6 + pvn(p * 6.0) * 0.4;
            float blades = pvn(p * vec2(31.0, 37.0));
            col = mix(vec3(0.16, 0.28, 0.08), vec3(0.31, 0.43, 0.14), gn) * (0.85 + 0.2 * n1) * (0.85 + 0.25 * blades);
            col = mix(col, vec3(0.36, 0.32, 0.2), smoothstep(0.66, 0.8, pvn(p * 0.25 + 4.0)) * 0.6); // worn dry patches
            col += step(0.992, pvh(floor(p * 5.0))) * vec3(0.5, 0.45, 0.1) * step(5.5, type); // flowers in parks
            hgt += blades * 0.01;
            rough = 0.95;
            if (type > 5.5) {
              float path = min(min(abs(lc.x), abs(lc.y)), abs(length(lc) - 19.0));
              path = min(path, abs(abs(lc.x) - abs(lc.y)) * 0.7071);
              float pm = 1.0 - smoothstep(1.3, 1.6, path);
              vec3 gravel = vec3(0.62, 0.56, 0.45) * (0.88 + 0.18 * pvn(p * 12.0));
              col = mix(col, gravel, pm); hgt = mix(hgt, pvn(p * 12.0) * 0.006, pm);
              float pond = 1.0 - smoothstep(6.0, 6.4, length(lc));
              col = mix(col, vec3(0.6, 0.6, 0.58), pond);
            } else if (type < 3.5) {
              float path = min(abs(lc.x), abs(lc.y));
              col = mix(col, vec3(0.5, 0.48, 0.45), 1.0 - smoothstep(1.0, 1.3, path));
            }
          } else if (type < 5.5) { // industrial yard
            col = vec3(0.42, 0.41, 0.39) * (0.75 + 0.35 * n1);
            col *= 1.0 - 0.3 * smoothstep(0.6, 0.8, pvf(p * 0.15 + 7.0));
            float crk = abs(pvn(p * 0.7) - 0.5); col *= 1.0 - (1.0 - smoothstep(0.0, 0.015, crk)) * 0.35;
            float ln = lineAA(abs(lc.y), 0.1) * step(abs(lc.x), 26.0);
            col = mix(col, vec3(0.8, 0.65, 0.15), ln * 0.8);
            rough = 0.9;
          } else if (type < 7.5) { // parking lot
            col = vec3(0.17, 0.175, 0.18) * (0.85 + 0.3 * n1) + (pvn(p * 23.0) - 0.5) * 0.03;
            float rowA = step(-27.0, lc.y) * step(lc.y, -15.8);
            float rowB = step(-8.2, lc.y) * step(lc.y, 3.0);
            float rowC = step(10.6, lc.y) * step(lc.y, 21.8);
            float inRow = max(max(rowA, rowB), rowC) * step(abs(lc.x), 26.2);
            float sl = lineAA(abs(fract((lc.x + 26.0) / 2.8 + 0.5) - 0.5) * 2.8, 0.06) * inRow;
            float mid = lineAA(abs(lc.y + 21.4), 0.06) + lineAA(abs(lc.y + 2.6), 0.06) + lineAA(abs(lc.y - 16.2), 0.06);
            col = mix(col, vec3(0.85), clamp(sl + mid * step(abs(lc.x), 26.2), 0.0, 1.0) * 0.85);
            col *= 1.0 - 0.35 * smoothstep(0.6, 0.8, pvn(p * 1.2)) * inRow;
            float puddle = smoothstep(0.56, 0.68, pvf(p * 0.11 + 3.0)) * uWet;
            puddleMask = puddle;
            col *= mix(1.0, 0.55, uWet); rough = mix(0.9, 0.3, uWet); rough = mix(rough, 0.04, puddle);
            isRoad = 1.0;
          } else if (type > 8.5) {
            float gn = pvf(p * 0.6) * 0.6 + pvn(p * 6.0) * 0.4, blades = pvn(p * vec2(31.0, 37.0));
            vec3 grass = mix(vec3(0.16, 0.28, 0.08), vec3(0.31, 0.43, 0.14), gn) * (0.85 + 0.2 * n1) * (0.85 + 0.25 * blades);
            rough = 0.95; hgt += blades * 0.01;
            if (type < 9.5) { col = grass; }
            else if (type < 10.5) { // Greenway: lush meadow, wildflowers, shade under the canopy
              col = mix(grass * 1.05, vec3(0.2, 0.33, 0.1), smoothstep(0.45, 0.75, pvf(p * 0.05 + 9.0)));
              col += step(0.985, pvh(floor(p * 4.0))) * mix(vec3(0.6, 0.5, 0.1), vec3(0.5, 0.2, 0.4), pvh(floor(p * 4.0) + 3.0));
            } else if (type < 11.5) { // asphalt apron (lots and yards painted by the local layer)
              col = vec3(0.17, 0.175, 0.18) * (0.85 + 0.3 * n1); rough = 0.88; isRoad = 1.0;
            } else if (type < 12.5) { // farmland: crop rows and fallow strips
              float field = pvh(floor(p / vec2(46.0, 33.0)));
              float rows = 0.5 + 0.5 * sin(p.x * 2.4 + field * 9.0);
              vec3 crop = mix(vec3(0.42, 0.36, 0.18), vec3(0.3, 0.42, 0.14), step(0.4, field));
              col = mix(crop * 0.75, crop * 1.1, rows) * (0.9 + 0.15 * n2);
              if (field > 0.82) col = mix(vec3(0.4, 0.3, 0.2), vec3(0.5, 0.42, 0.3), rows);
              hgt += rows * 0.02;
            } else { // Crestmoor: manicured lawn with mowing stripes
              float stripe = step(0.5, fract(p.x / 3.0));
              col = grass * (1.02 + 0.1 * stripe) * vec3(0.95, 1.08, 0.92);
            }
          } else { // construction dirt with tyre ruts
            col = mix(vec3(0.36, 0.28, 0.2), vec3(0.48, 0.4, 0.3), pvf(p * 0.4)) * (0.85 + 0.2 * n2);
            float rut = smoothstep(0.03, 0.0, abs(pvn(p * 0.3) - 0.5)) * step(0.5, n1);
            col *= 1.0 - 0.3 * rut; hgt -= rut * 0.03 - pvn(p * 4.0) * 0.02;
            rough = 0.98;
          }
        }
        // local roads, paths and yards inside blocks (cul-de-sacs, the stadium ring, container lanes)
        if (inCity && !(rx || rz) && vPN.y > 0.5) {
          vec4 lm = texture2D(uLocal, vec2((p.x + 48.0) / 1056.0, 1.0 - (p.y + 48.0) / 1056.0));
          if (lm.r + lm.g + lm.b > 0.02) {
            float lgr = pvn(p * 23.0);
            vec3 conc = vec3(0.5, 0.49, 0.47) * (0.86 + 0.18 * pvh(floor(p / 3.0))) * (0.9 + 0.1 * n1);
            vec2 jg = abs(fract(p / 4.0) - 0.5); conc *= 0.9 + 0.1 * (1.0 - smoothstep(0.46, 0.49, max(jg.x, jg.y)));
            vec3 grav = mix(vec3(0.52, 0.45, 0.34), vec3(0.6, 0.55, 0.44), pvn(p * 9.0)) * (0.85 + 0.2 * n1);
            vec3 asph = vec3(0.15, 0.155, 0.165) * (0.8 + 0.36 * n1) + (lgr - 0.5) * 0.035;
            float ka = smoothstep(0.35, 0.6, lm.r), kg = smoothstep(0.35, 0.6, lm.g), kc = smoothstep(0.35, 0.6, lm.b);
            // asphalt laid like the streets': aggregate speckles, repaired patches, fine cracks; darker when wet
            asph += step(0.93, pvh(floor(p * 18.0))) * 0.035;
            { vec2 pc = floor(p / 7.0); vec2 pf = fract(p / 7.0); float ph = pvh(pc + 13.0);
              if (ph > 0.86) { vec2 hs = vec2(0.2 + pvh(pc + 3.0) * 0.25, 0.15 + pvh(pc + 7.0) * 0.3); asph = mix(asph, vec3(0.105, 0.11, 0.115) * (0.9 + 0.2 * lgr), boxAA(pf - 0.5, hs) * 0.9); } }
            { float cr = abs(pvn(p * 0.9) - 0.5); asph *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.01 + fwidth(cr), cr)) * step(0.68, pvn(p * 0.21 + 5.0)); }
            asph *= mix(1.0, 0.55, uWet);
            col = mix(col, conc, kc); col = mix(col, grav, kg * (1.0 - ka)); col = mix(col, asph, ka);
            // a painted edge line just inside the asphalt edge
            col = mix(col, vec3(0.8, 0.8, 0.76), (1.0 - smoothstep(0.0, 0.07, abs(lm.r - 0.72))) * step(lm.r, 0.95) * 0.7);
            rough = mix(rough, mix(0.88, 0.3, uWet), max(ka, kc)); hgt = mix(hgt, lgr * 0.004, max(ka, max(kg, kc)));
            isRoad = max(isRoad, max(ka, kc));
          }
        }
        if (!inCity && vPN.y >= 0.5) {
          // waterfront promenade boards
          float coordP = (abs(p.x) < 6.0 || abs(p.x - 960.0) < 6.0 || p.x < 0.0 || p.x > 960.0) ? p.y : p.x;
          float plank = step(0.06, fract(coordP / 1.2));
          col = vec3(0.42, 0.33, 0.24) * (0.8 + 0.25 * pvh(floor(p / 1.2))) * (0.75 + 0.25 * plank) * (0.9 + 0.15 * pvn(p * vec2(0.3, 8.0)));
          hgt -= (1.0 - plank) * 0.008;
          rough = 0.8;
        }
        if (isRoad < 0.5 && vPN.y > 0.5) { col *= 1.0 - uWet * 0.3; rough = mix(rough, rough * 0.55, uWet); }
        // contact shadowing from nearby buildings + passing cloud shadows
        float aoK = mix(1.0, aoTex, 0.75);
        col *= aoK * pvCloudShadow(p);
        diffuseColor.rgb = col;
        roughnessFactor = rough;
        float lp = lampPool(p, vOpen, hOpen) * uNight;
        totalEmissiveRadiance += col * vec3(1.0, 0.72, 0.42) * lp * 1.25 + vec3(1.0, 0.72, 0.45) * lp * lp * (0.03 + uWet * 0.3) * (0.4 + 0.6 * isRoad);
        totalEmissiveRadiance += col * vec3(1.0, 0.8, 0.55) * spill * 0.55;
        // wet ground (G7): a film of water mirrors the sky, strongest at a glancing angle and in puddles, dimmer where
        // buildings close in; at night every street lamp throws a long reflected streak toward the eye
        if (uWet > 0.02 && vPN.y > 0.5) {
          vec3 V = normalize(cameraPosition - vPW);
          float ndv = clamp(V.y, 0.0, 1.0), fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
          float film = uWet * clamp(0.25 + 0.5 * isRoad + 0.75 * puddleMask, 0.0, 1.0);
          totalEmissiveRadiance += mix(uHorizon, uZenith, clamp(ndv * 1.6, 0.0, 1.0)) * aoK * fres * film * (0.3 + 1.1 * puddleMask);
          #ifdef PV_HQ
          if (uNight > 0.05) {
            float hc = max(cameraPosition.y - vPW.y, 0.6), hl = 6.0;
            vec2 sp = cameraPosition.xz + (p - cameraPosition.xz) * (hc + hl) / hc;
            vec2 d = lampOff(sp), u = normalize(sp - cameraPosition.xz + 1e-4);
            float along = dot(d, u), perp = dot(d, vec2(-u.y, u.x));
            float streak = exp(-perp * perp / mix(0.6, 3.0, 1.0 - puddleMask) - along * along / mix(260.0, 70.0, puddleMask));
            totalEmissiveRadiance += vec3(1.0, 0.74, 0.46) * streak * uNight * film * (0.35 + 0.65 * fres) * 1.7;
          }
          #endif
        }
        #ifdef PV_HQ
          // rain ripples in standing water
          if (uRain > 0.05 && puddleMask > 0.05) {
            vec2 rc = floor(p * 1.6); vec2 rf = fract(p * 1.6) - 0.5;
            float rt = fract(uTime * 0.9 + pvh(rc) * 7.0);
            float ring = sin((length(rf) - rt * 0.5) * 40.0) * (1.0 - rt) * step(length(rf), rt * 0.5);
            hgt += ring * 0.002 * puddleMask * uRain;
          }
          normal = pvBump(-vViewPosition, normal, hgt, 1.0);
        #endif
      }`);
  });
  m.customProgramCacheKey = () => 'pv-ground2';
  return m;
}

// soft ambient-occlusion map rendered from building footprints (≈1 m per texel)
function makeAOTexture(world) {
  const S = 1056, c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
  const X = x => x + 48;
  // layered expanding rectangles approximate a blur without ctx.filter (unsupported in Safari)
  const layers = [[2.6, 0.1], [1.8, 0.12], [1.1, 0.15], [0.5, 0.2]];
  for (const b of world.blocks) {
    for (const r of b.bld) if (r.y0 <= CURB_H + 0.01) for (const [e, a] of layers) { g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(X(r.x0) - e, X(r.z0) - e, r.x1 - r.x0 + e * 2, r.z1 - r.z0 + e * 2); }
    for (const d of b.det) if (d.col && d.col.x0 !== undefined && d.col.y1 > 1.5) for (const [e, a] of layers.slice(1)) { g.fillStyle = `rgba(0,0,0,${a * 0.6})`; g.fillRect(X(d.col.x0) - e, X(d.col.z0) - e, d.col.x1 - d.col.x0 + e * 2, d.col.z1 - d.col.z0 + e * 2); }
  }
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1.2;
  for (const b of world.blocks) g.strokeRect(X(b.bx * P + ROAD_HALF), X(b.bz * P + ROAD_HALF), P - ROAD_HALF * 2, P - ROAD_HALF * 2);
  // the brightest regions stay white; un-darken the blurred interiors under buildings (never visible)
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

/* ---------------- Foliage with wind sway (instanced) ---------------- */
function makeFoliageMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, envMapIntensity: 0.5 });
  atmos(m, sh => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uWind = U.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float sway = max(0.0, position.y - 1.1);
          vec2 ph = vec2(0.0);
          #ifdef USE_INSTANCING
            ph = instanceMatrix[3].xz * 0.21;
          #endif
          float gust = 0.6 + 0.4 * sin(uTime * 0.31 + ph.x * 0.2);
          transformed.x += (sin(uTime * 1.7 + ph.x + position.y * 0.6) * 0.045 + 0.03 * gust) * sway * uWind;
          transformed.z += cos(uTime * 1.3 + ph.y + position.x) * 0.035 * sway * uWind;
          transformed.y += sin(uTime * 2.3 + ph.x + position.z * 3.0) * 0.01 * sway * uWind;
        }`);
  });
  m.customProgramCacheKey = () => 'pv-foliage';
  return m;
}
// generic prop/detail material with atmosphere + cloud shadow
function makePropMaterial(rough = 0.8, metal = 0.05) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal, envMapIntensity: 0.65 });
  atmos(m);
  return m;
}

/* ---------------- Countryside terrain (Cedar Fields): detail over the height field's vertex colours ----------------
   The vertex colour says which surface a spot is (grass is the green one; dirt, mud, rock and gravel are not), so
   the shader only adds what a 1 m grid can't carry: sun-dried and lush patches, clumps and blades and the odd
   wildflower up close, soil grain and pebbles, bare rock on steep slopes, darker ground and puddles in the rain, and
   the passing cloud shadows the city has. The height field and the physics are untouched. */
function makeTerrainMaterial(opt = {}) {
  const { mown, ...mo } = opt;
  const m = new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.55 }, mo));
  atmos(m, sh => {
    sh.uniforms.uWet = U.uWet; sh.uniforms.uTime = U.uTime; sh.uniforms.uCloudShadow = U.uCloudShadow;
    patchWorldVaryings(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uWet; uniform float uTime; uniform float uCloudShadow;
        varying vec3 vPW; varying vec3 vPN;
        ${GLSL_NOISE}
        ${GLSL_BUMP}
        ${GLSL_CLOUDSHADOW}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec2 p = vPW.xz;
        vec3 base = diffuseColor.rgb;
        float gr = clamp((base.g - max(base.r, base.b)) * 14.0, 0.0, 1.0);
        float near = 1.0 - smoothstep(22.0, 80.0, length(vPW - cameraPosition));
        // fine detail only where a pixel is small enough to show it (no shimmer at a glancing angle)
        vec2 fwp = fwidth(p); float fw = max(fwp.x, fwp.y);
        float fine = 1.0 - smoothstep(0.025, 0.09, fw), mesoF = 1.0 - smoothstep(0.08, 0.3, fw);
        float macro = pvf(p * 0.017), mid = pvn(p * 0.23), n1 = pvn(p * 1.9);
        // grass: big sun-dried and lush patches, clumps, blades and wildflowers near the eye
        vec3 g = base * (0.8 + 0.34 * mid);
        g = mix(g, g * vec3(1.42, 1.16, 0.62), smoothstep(0.56, 0.8, macro) * 0.7);
        g = mix(g, g * vec3(0.72, 0.92, 0.7), smoothstep(0.42, 0.2, macro) * 0.6);
        float blades = pvn(p * vec2(9.0, 11.0)) * 0.6 + pvn(p * vec2(17.0, 15.0) + 3.0) * 0.4;
        g *= mix(1.0, 0.76 + 0.48 * blades, near * fine);
        g *= mix(1.0, 0.88 + 0.24 * pvn(p * vec2(3.1, 2.7)), mesoF);
        // the odd wildflower: a small round head somewhere in a 40 cm cell (none on the mown grass of a circuit)
        vec2 fc = floor(p * 2.5), fo = fract(p * 2.5) - 0.5 - (vec2(pvh(fc + 1.7), pvh(fc + 4.3)) - 0.5) * 0.5;
        float fl = step(0.975, pvh(fc)) * (1.0 - smoothstep(0.1, 0.16, length(fo))) * near * mesoF * smoothstep(0.35, 0.55, macro);
        #ifdef PV_MOWN
          fl = 0.0;
        #endif
        g = mix(g, mix(vec3(0.62, 0.52, 0.08), vec3(0.55, 0.2, 0.42), step(0.5, pvh(fc + 5.0))), fl);
        // soil and gravel: grain and pebbles
        vec3 s = base * (0.8 + 0.32 * pvf(p * 0.33)) * (0.9 + 0.2 * n1);
        float peb = step(0.88, pvh(floor(p * 5.0))) * near * mesoF * (1.0 - smoothstep(0.25, 0.45, dot(base, vec3(0.33))));
        s = mix(s, s * 1.4 + 0.02, peb * 0.55);
        vec3 col = mix(s, g, gr);
        // asphalt (Valen Point): fine aggregate and the odd glint; paint and kerbs stay clean
        float lum = dot(base, vec3(0.3, 0.59, 0.11));
        float asph = (1.0 - smoothstep(0.035, 0.07, lum)) * (1.0 - gr), bright = smoothstep(0.35, 0.6, lum);
        col = mix(col, max(base, vec3(0.115, 0.12, 0.125)) * (0.86 + 0.28 * pvn(p * 7.0)) + step(0.94, pvh(floor(p * 17.0))) * 0.02 * near * fine, asph); // the city roads' asphalt tone, not black
        col = mix(col, base * (0.95 + 0.06 * n1), bright);
        #ifdef PV_MOWN
          col *= 1.0 + gr * (0.075 * (smoothstep(-0.3, 0.3, sin((p.x - p.y * 0.18) * 0.8976)) * 2.0 - 1.0) + 0.03 * (pvn(p * vec2(0.6, 4.0)) - 0.5)); // mowing stripes
        #endif
        // bare rock on steep ground
        float slope = 1.0 - clamp(vPN.y, 0.0, 1.0);
        float rk = smoothstep(0.32, 0.55, slope + (mid - 0.5) * 0.12);
        vec3 rock = vec3(0.3, 0.29, 0.27) * (0.75 + 0.4 * pvn(vec2(p.x + p.y, vPW.y * 3.0) * vec2(0.4, 1.0))) * (0.9 + 0.2 * n1);
        col = mix(col, rock, rk);
        float rough = mix(0.97, 0.88, rk);
        float hgt = (blades * 0.014 * gr * fine + (peb * 0.012 + n1 * 0.02) * (1.0 - gr) * (1.0 - asph) * (1.0 - bright)) * near + rk * pvn(p * 3.0) * 0.04;
        rough = mix(rough, 0.86, asph);
        // rain: everything darkens and gains a sheen; puddles collect on bare ground
        float puddle = smoothstep(0.6, 0.7, pvf(p * 0.14 + 7.0)) * (1.0 - gr) * (1.0 - rk) * uWet;
        col *= 1.0 - uWet * mix(mix(0.22, 0.3, 1.0 - gr), 0.42, asph);
        col = mix(col, col * 0.6, puddle);
        rough = mix(rough, rough * mix(0.62, 0.36, asph), uWet); rough = mix(rough, 0.06, puddle);
        hgt *= 1.0 - puddle;
        col *= pvCloudShadow(p);
        diffuseColor.rgb = col;
        roughnessFactor = rough;
        normal = pvBump(-vViewPosition, normal, hgt, 1.0);
      }`);
  });
  if (opt.mown) { m.defines = Object.assign(m.defines || {}, { PV_MOWN: '' }); }
  m.customProgramCacheKey = () => 'pv-terrain' + (opt.polygonOffset ? '-off' : '') + (opt.mown ? '-mown' : '');
  return m;
}

/* ---------------- Contact shadows: soft dark blobs under cars and people ---------------- */
function makeBlobTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

/* ---------------- Sky dome: gradient, sun halo, layered lit clouds, stars, moon ---------------- */
function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: `
      uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uZenith; uniform vec3 uHorizon; uniform float uCloud; uniform float uCloudDark;
      uniform float uTime; uniform float uStars; uniform vec3 uMoonDir; uniform float uNight; uniform float uWind;
      varying vec3 vDir;
      ${GLSL_NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 sdir = normalize(uSunDir);
        vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
        col = mix(col, uHorizon * 0.5, smoothstep(0.0, -0.25, h));
        float sd = max(dot(d, sdir), 0.0);
        float sunVis = clamp(sdir.y * 4.0 + 0.4, 0.0, 1.0);
        // horizon glow concentrated around the sun azimuth at dawn/dusk
        float az = max(dot(normalize(d.xz + 1e-4), normalize(sdir.xz + 1e-4)), 0.0);
        float lowSun = 1.0 - smoothstep(0.0, 0.35, abs(sdir.y));
        col += uSunCol * pow(az, 4.0) * exp(-max(h, 0.0) * 7.0) * lowSun * 0.55;
        col += uSunCol * (pow(sd, 5.0) * 0.22 + pow(sd, 48.0) * 0.55) * sunVis;
        col += uSunCol * smoothstep(0.9993, 0.9997, sd) * 9.0 * clamp(sdir.y * 6.0 + 0.6, 0.0, 1.0);
        if (uStars > 0.01 && h > 0.0) {
          vec3 sp = d * 280.0; vec3 si = floor(sp);
          float s = pvh(si.xy + si.z * 7.13);
          float tw = 0.6 + 0.4 * sin(uTime * 3.0 + s * 50.0);
          float star = step(0.9985, s) * smoothstep(0.45, 0.0, length(fract(sp) - 0.5));
          col += vec3(0.9, 0.95, 1.0) * star * tw * uStars * 1.6 * (1.0 - uCloud);
          // faint milky band
          col += vec3(0.05, 0.06, 0.09) * smoothstep(0.75, 1.0, pvf(d.xz * 3.0 + d.y)) * uStars * (1.0 - uCloud) * smoothstep(0.2, 0.0, abs(d.x * 0.6 - d.z * 0.8));
        }
        float md = max(dot(d, normalize(uMoonDir)), 0.0);
        col += vec3(0.85, 0.9, 1.0) * smoothstep(0.9990, 0.9994, md) * 2.2 * uStars;
        col += vec3(0.3, 0.35, 0.45) * pow(md, 40.0) * 0.4 * uStars;
        if (h > 0.0) {
          vec2 wind = vec2(uTime * 0.006, uTime * 0.0025) * (1.0 + uWind);
          vec2 uv = d.xz / (h + 0.12) * 1.6 + wind;
          float c = pvf(uv) * 0.62 + pvf(uv * 2.7 + 3.1) * 0.3 + pvn(uv * 9.0) * 0.08;
          float cov = smoothstep(1.0 - uCloud * 0.95, 1.12 - uCloud * 0.6, c);
          // self-shadowed underside: sample toward the sun
          float c2 = pvf(uv + sdir.xz * 0.06) * 0.62 + pvf((uv + sdir.xz * 0.06) * 2.7 + 3.1) * 0.3;
          float lightK = clamp(0.55 + (c - c2) * 3.0, 0.15, 1.0);
          vec3 cl = mix(vec3(1.0), uSunCol, 0.4) * (0.45 + 0.65 * clamp(sdir.y + 0.25, 0.0, 1.0)) * lightK;
          cl = mix(cl, uHorizon * 0.95, 0.3);
          cl *= 1.0 - uCloudDark * 0.6;
          cl = mix(cl, vec3(0.05, 0.06, 0.08) + uHorizon * 0.4, uNight * 0.85);
          cl += uSunCol * pow(sd, 6.0) * 0.55 * (1.0 - uNight) * (1.0 - cov * 0.5);
          // high thin cirrus
          float ci = smoothstep(0.55, 0.85, pvf(d.xz / (h + 0.3) * vec2(0.4, 3.0) + wind * 0.5)) * (1.0 - uCloud) * 0.35;
          col = mix(col, cl, cov * smoothstep(0.0, 0.12, h) * 0.96);
          col += ci * mix(vec3(0.9), uSunCol, 0.4) * (1.0 - uNight * 0.9) * smoothstep(0.0, 0.2, h);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}
function makeWaterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uCam;
      uniform vec3 uFogCol; uniform float uFogDen; uniform float uNight; uniform float uRain;
      varying vec3 vW;
      ${GLSL_NOISE}
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        float e = 0.15;
        float hA = pvn(p * 0.18 + vec2(t * 0.12, t * 0.05)) + pvn(p * 0.6 - vec2(t * 0.2, -t * 0.15)) * 0.5 + pvn(p * 2.1 + t * 0.4) * 0.15 * (1.0 + uRain * 2.0);
        float hB = pvn((p + vec2(e, 0.0)) * 0.18 + vec2(t * 0.12, t * 0.05)) + pvn((p + vec2(e, 0.0)) * 0.6 - vec2(t * 0.2, -t * 0.15)) * 0.5 + pvn((p + vec2(e, 0.0)) * 2.1 + t * 0.4) * 0.15 * (1.0 + uRain * 2.0);
        float hC = pvn((p + vec2(0.0, e)) * 0.18 + vec2(t * 0.12, t * 0.05)) + pvn((p + vec2(0.0, e)) * 0.6 - vec2(t * 0.2, -t * 0.15)) * 0.5 + pvn((p + vec2(0.0, e)) * 2.1 + t * 0.4) * 0.15 * (1.0 + uRain * 2.0);
        vec3 n = normalize(vec3((hA - hB) * 1.6, 1.0, (hA - hC) * 1.6));
        vec3 V = normalize(uCam - vW);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
        vec3 R = reflect(-V, n);
        vec3 sky = mix(uHorizon, uZenith, clamp(R.y, 0.0, 1.0));
        vec3 deep = mix(vec3(0.02, 0.09, 0.11), vec3(0.01, 0.02, 0.04), uNight);
        vec3 col = mix(deep, sky, fres * 0.85);
        float spec = pow(max(dot(R, normalize(uSunDir)), 0.0), 220.0);
        col += uSunCol * spec * 4.0 * clamp(uSunDir.y * 5.0, 0.0, 1.0);
        // city glow shimmering at night near the shore
        float shore = smoothstep(80.0, 0.0, min(min(abs(p.x + 18.0), abs(p.x - 978.0)), min(abs(p.y + 18.0), abs(p.y - 978.0))));
        col += vec3(1.0, 0.7, 0.4) * uNight * shore * 0.25 * (0.5 + 0.5 * pvn(p * vec2(0.5, 3.0) + t));
        float dist = length(uCam - vW);
        float fogF = 1.0 - exp(-uFogDen * uFogDen * dist * dist);
        col = mix(col, uFogCol, fogF);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}

/* ---------------- Vehicles: one draw call per car, parts via attribute ----------------
   part ids: 0 paint, 1 glass, 2 trim, 3 chrome, 4 headlight, 5 taillight, 6 reverse, 7 siren red, 8 siren blue,
             9 roof sign, 10 paint2, 11 interior, 12 indicator, 13 plate, 14 matte plastic, 15 grille
   uLights  = (headlights, brake, reverse, siren phase)
   uLights2 = (left indicator, right indicator, broken-light bitmask FL1 FR2 RL4 RR8, wet)
   uMisc    = (burnt, siren on, damage, road dirt)                                                   */
function makeVehicleMaterial(physical) {
  const m = physical
    ? new THREE.MeshPhysicalMaterial({ roughness: 0.35, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.05 })
    : new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 });
  const u = {
    uPaint: { value: new THREE.Color(0.6, 0.1, 0.1) }, uPaint2: { value: new THREE.Color(1, 1, 1) },
    uLights: { value: new THREE.Vector4(0, 0, 0, 0) }, uLights2: { value: new THREE.Vector4(0, 0, 0, 0) }, uMisc: { value: new THREE.Vector4(0, 0, 0, 0) },
    uFinish: { value: new THREE.Vector4(0.25, 0.45, 0.2, 0) }, uFinish2: { value: new THREE.Vector4(-1, 0, 0, 0) }
  };
  m.userData.u = u;
  atmos(m, sh => {
    Object.assign(sh.uniforms, u); sh.uniforms.uNight = U.uNight; sh.uniforms.uWet = U.uWet;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPart; varying float vPart; varying vec3 vLP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = aPart; vLP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uPaint; uniform vec3 uPaint2; uniform vec4 uLights; uniform vec4 uLights2; uniform vec4 uMisc; uniform vec4 uFinish; uniform vec4 uFinish2; uniform float uNight; uniform float uWet;
        varying float vPart; varying vec3 vLP;
        float vh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        float pp = vPart;
        float siren = uMisc.y;
        float ph = uLights.w;
        float broken = uLights2.z;
        // which corner light is this fragment on? (front = +z, left = +x)
        float corner = (vLP.z > 0.0 ? (vLP.x > 0.0 ? 1.0 : 2.0) : (vLP.x > 0.0 ? 4.0 : 8.0));
        float isBroken = step(0.5, mod(floor(broken / corner), 2.0));
        float grime = smoothstep(0.75, 0.25, vLP.y) * 0.35;
        if (pp < 0.5) {
          // paint by tier: flake sparkle and gloss rise with value; beaters fade, rust and get grimy
          vec3 pc = uPaint;
          float flake = vh(floor(vLP.xz * 140.0 + vLP.y * 40.0));
          pc *= 0.97 + flake * (0.03 + uFinish.x * 0.12);
          float wear = uFinish.z;
          float g2 = grime * (0.6 + wear * 0.9) * (0.3 + uMisc.w * 1.4);
          vec3 faded = mix(pc, vec3(dot(pc, vec3(0.33))) * 1.08 + 0.05, wear * 0.45);
          float rustN = vh(floor(vLP.xz * 7.0 + vLP.y * 3.0)) * vh(floor(vLP.zy * 11.0));
          float rust = wear * step(0.55, rustN + smoothstep(0.75, 0.3, vLP.y) * 0.35) * smoothstep(1.0, 0.35, vLP.y);
          diffuseColor.rgb = mix(mix(faded, faded * vec3(0.55, 0.5, 0.45), g2), vec3(0.32, 0.17, 0.08), rust * 0.8);
          roughnessFactor = mix(mix(0.5, 0.1, uFinish.y), 0.7, max(g2, rust));
          metalnessFactor = (uFinish2.x >= 0.0 ? uFinish2.x : mix(0.3, 0.62, uFinish.x)) * (1.0 - rust); // a one-off's own metal (gold leaf)
        }
        else if (pp < 1.5) { diffuseColor.rgb = vec3(0.025, 0.03, 0.04); roughnessFactor = 0.03; metalnessFactor = 0.9; }
        else if (pp < 2.5) { diffuseColor.rgb = vec3(0.04); roughnessFactor = 0.55; metalnessFactor = 0.1; }
        else if (pp < 3.5) { diffuseColor.rgb = vec3(0.8); roughnessFactor = 0.14; metalnessFactor = 1.0; }
        else if (pp < 4.5) {
          diffuseColor.rgb = vec3(0.9); roughnessFactor = 0.08; metalnessFactor = 0.3;
          float on = (1.0 - isBroken) * uLights.x;
          totalEmissiveRadiance += vec3(1.0, 0.95, 0.85) * (0.06 + on * 5.0) * (1.0 - isBroken);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12), isBroken);
        }
        else if (pp < 5.5) {
          diffuseColor.rgb = mix(vec3(0.32, 0.02, 0.02), vec3(0.08, 0.02, 0.02), isBroken); roughnessFactor = 0.15;
          totalEmissiveRadiance += vec3(1.0, 0.04, 0.02) * (0.05 + uLights.x * 1.1 + uLights.y * 4.0) * (1.0 - isBroken);
        }
        else if (pp < 6.5) { diffuseColor.rgb = vec3(0.8); totalEmissiveRadiance += vec3(1.0) * uLights.z * 3.0 * (1.0 - isBroken); }
        else if (pp < 7.5) { float on = siren * step(0.0, sin(ph * 18.0)) * step(0.0, sin(ph * 4.5)); diffuseColor.rgb = vec3(0.4, 0.02, 0.02); totalEmissiveRadiance += vec3(1.0, 0.05, 0.05) * on * 9.0; }
        else if (pp < 8.5) { float on = siren * step(0.0, sin(ph * 18.0 + 3.14)) * step(0.0, -sin(ph * 4.5)); diffuseColor.rgb = vec3(0.02, 0.05, 0.4); totalEmissiveRadiance += vec3(0.1, 0.3, 1.0) * on * 9.0; }
        else if (pp < 9.5) { diffuseColor.rgb = vec3(0.95, 0.85, 0.4); totalEmissiveRadiance += vec3(1.0, 0.8, 0.3) * (0.25 + uNight * 1.8) * (1.0 - uMisc.x); }
        else if (pp < 10.5) { diffuseColor.rgb = mix(uPaint2, uPaint2 * 0.6, grime); roughnessFactor = 0.3; metalnessFactor = 0.3; }
        else if (pp < 11.5) { diffuseColor.rgb = vec3(0.07); roughnessFactor = 0.9; metalnessFactor = 0.0; }
        else if (pp < 12.5) {
          float side = vLP.x > 0.0 ? uLights2.x : uLights2.y;
          diffuseColor.rgb = vec3(0.55, 0.3, 0.05); roughnessFactor = 0.15;
          totalEmissiveRadiance += vec3(1.0, 0.45, 0.02) * side * 4.0 * (1.0 - isBroken);
        }
        else if (pp < 13.5) {
          vec2 pq = vec2(vLP.x * 6.0, vLP.y * 14.0);
          float glyph = step(0.55, vh(floor(pq))) * step(0.2, fract(pq.x)) * step(0.15, fract(pq.y));
          diffuseColor.rgb = mix(vec3(0.92, 0.92, 0.88), vec3(0.08, 0.12, 0.3), glyph * 0.85); roughnessFactor = 0.4; metalnessFactor = 0.2;
        }
        else if (pp < 14.5) { diffuseColor.rgb = vec3(0.025); roughnessFactor = 0.85; metalnessFactor = 0.0; }
        else if (pp < 15.5) { diffuseColor.rgb = vec3(0.02) + step(0.5, fract(vLP.y * 18.0)) * 0.05; roughnessFactor = 0.4; metalnessFactor = 0.6; }
        else if (pp < 16.5) {
          // daytime running light strip / projector rings: soft white, brighter with the headlights
          diffuseColor.rgb = vec3(0.85); roughnessFactor = 0.1; metalnessFactor = 0.2;
          totalEmissiveRadiance += vec3(0.85, 0.92, 1.0) * (0.35 + uLights.x * 2.5) * (1.0 - isBroken);
        }
        else { diffuseColor.rgb = vec3(0.012); roughnessFactor = 0.18; metalnessFactor = 0.35; } // gloss black / carbon trim
        float burnt = uMisc.x;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.028, 0.026), burnt * 0.92);
        roughnessFactor = mix(roughnessFactor, 0.95, burnt);
        totalEmissiveRadiance *= 1.0 - burnt;
        float dmg = uMisc.z;
        float sc = vh(floor(vLP.xz * 9.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.25, 0.24, 0.22), step(1.0 - dmg * 0.5, sc) * step(pp, 0.5) * 0.7);
        roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.5, uWet * step(pp, 0.5));
      }`);
  });
  m.customProgramCacheKey = () => physical ? 'pv-veh3-p' : 'pv-veh3-s';
  return m;
}

/* ---------------- Particles (soft round sprites) ---------------- */
function makeParticleMaterial(additive) {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 800 }, uFogCol: U.uFogCol, uFogDen: U.uFogDen },
    transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vCol; varying float vDist;
      void main(){ vCol = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 1.0, 256.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec4 vCol; varying float vDist; uniform vec3 uFogCol; uniform float uFogDen;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = smoothstep(0.5, 0.15, d);
        vec4 col = vCol; ${additive ? '' : 'float fogF = 1.0 - exp(-uFogDen*uFogDen*vDist*vDist); col.rgb = mix(col.rgb, uFogCol, fogF);'}
        gl_FragColor = vec4(col.rgb, col.a * a);
        ${additive ? 'gl_FragColor.rgb *= gl_FragColor.a; gl_FragColor.a = 1.0;' : ''}
        #include <colorspace_fragment>
      }`
  });
}

/* ---------------- Rain streaks (GPU animated around camera) ---------------- */
function makeRainMesh(count) {
  const pos = new Float32Array(count * 2 * 3), seed = new Float32Array(count * 2 * 4);
  for (let i = 0; i < count; i++) {
    const sx = Math.random(), sy = Math.random(), sz = Math.random(), sp = 0.8 + Math.random() * 0.4;
    for (let k = 0; k < 2; k++) {
      pos.set([0, k, 0], (i * 2 + k) * 3);
      seed.set([sx, sy, sz, sp], (i * 2 + k) * 4);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uCam: U.uCam, uRain: U.uRain, uWind: { value: new THREE.Vector2(1.5, 0.6) }, uNight: U.uNight },
    transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 aSeed; uniform float uTime; uniform vec3 uCam; uniform vec2 uWind; varying float vA;
      void main(){
        float box = 36.0; float hgt = 26.0;
        float fall = 22.0 * aSeed.w;
        float y = uCam.y + mod(aSeed.y * hgt - uTime * fall, hgt) - hgt * 0.4;
        vec2 wp = uCam.xz + mod(aSeed.xz * box - uCam.xz, box) - box * 0.5;
        vec3 base = vec3(wp.x, y, wp.y);
        vec3 dir = normalize(vec3(uWind.x, -fall, uWind.y));
        base += dir * position.y * 0.55;
        vA = 1.0 - position.y * 0.6;
        gl_Position = projectionMatrix * viewMatrix * vec4(base, 1.0);
      }`,
    fragmentShader: `uniform float uRain; uniform float uNight; varying float vA;
      void main(){ gl_FragColor = vec4(mix(vec3(0.75, 0.8, 0.88), vec3(0.35, 0.38, 0.45), uNight), 0.28 * uRain * vA); }`
  });
  const mesh = new THREE.LineSegments(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}

/* ---------------- Canvas textures ---------------- */
function makeBillboardAtlas() {
  const W = 1024, H = 512, cw = 256, ch = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const ads = [
    { bg: ['#d7263d', '#8b0d1f'], t1: 'VOLTA', t2: 'COLA', s: 'taste the current', fg: '#fff', shape: 'can' },
    { bg: ['#1b4f8a', '#0b223f'], t1: 'NORTHWIND', t2: 'AIR', s: 'fly the coast · from $49', fg: '#e8f3ff', shape: 'plane' },
    { bg: ['#f4f1ea', '#d6d0c2'], t1: 'HALCYON', t2: 'BANK', s: 'your money, calmer', fg: '#173d35', shape: 'wave' },
    { bg: ['#3b2416', '#1c110a'], t1: 'KAFFI', t2: 'ROAST', s: 'open 6am – late', fg: '#f3d7a7', shape: 'cup' },
    { bg: ['#111317', '#2a2f38'], t1: 'VIREO', t2: 'GT', s: 'meridian motors', fg: '#ffb547', shape: 'car' },
    { bg: ['#6a1b9a', '#1d0b33'], t1: 'COASTLINE', t2: '101.7', s: 'night drive radio', fg: '#7ff3e5', shape: 'sun' },
    { bg: ['#0f8b8d', '#06454a'], t1: 'SEAGLASS', t2: 'RESORT', s: 'weekends on the bay', fg: '#fffbe6', shape: 'sun' },
    { bg: ['#ffd84d', '#f0a500'], t1: 'QUIK', t2: 'MART', s: 'always open', fg: '#1b1b1b', shape: 'bag' }
  ];
  ads.forEach((a, i) => {
    const x = (i % 4) * cw, y = Math.floor(i / 4) * ch;
    const gr = g.createLinearGradient(x, y, x + cw, y + ch); gr.addColorStop(0, a.bg[0]); gr.addColorStop(1, a.bg[1]);
    g.fillStyle = gr; g.fillRect(x, y, cw, ch);
    g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip();
    g.globalAlpha = 0.18; g.fillStyle = a.fg;
    if (a.shape === 'sun') { g.beginPath(); g.arc(x + cw * 0.75, y + ch * 0.32, 60, 0, Math.PI * 2); g.fill(); }
    if (a.shape === 'wave') { for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(x + cw * 0.7, y + 40 + k * 22, 90, 16, 0, 0, Math.PI); g.fill(); } }
    if (a.shape === 'plane') { g.beginPath(); g.moveTo(x + 150, y + 40); g.lineTo(x + 250, y + 80); g.lineTo(x + 150, y + 120); g.lineTo(x + 175, y + 80); g.fill(); }
    if (a.shape === 'can') { g.fillRect(x + 180, y + 20, 56, 110); }
    if (a.shape === 'cup') { g.fillRect(x + 175, y + 40, 60, 70); g.beginPath(); g.arc(x + 240, y + 75, 18, 0, Math.PI * 2); g.fill(); }
    if (a.shape === 'car') { g.fillRect(x + 120, y + 80, 130, 26); g.fillRect(x + 150, y + 62, 70, 22); }
    if (a.shape === 'bag') { g.fillRect(x + 175, y + 50, 60, 70); }
    g.globalAlpha = 1;
    g.fillStyle = a.fg; g.textBaseline = 'alphabetic';
    g.font = 'italic 900 52px Arial, sans-serif'; g.fillText(a.t1, x + 16, y + 150, cw - 30);
    g.font = '900 40px Arial, sans-serif'; g.fillText(a.t2, x + 18, y + 192, cw - 30);
    g.font = '600 17px Arial, sans-serif'; g.globalAlpha = 0.85; g.fillText(a.s.toUpperCase(), x + 18, y + 228, cw - 30);
    g.globalAlpha = 1; g.restore();
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 6; g.strokeRect(x + 3, y + 3, cw - 6, ch - 6);
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
function makeRadialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128, stretch = false) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, stretch ? size * 0.15 : size / 2, 0, size / 2, stretch ? size * 0.15 : size / 2, stretch ? size * 0.85 : size / 2);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); return t;
}
function makeSignTexture(lines, bg, fg, w = 512, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${Math.floor(h * 0.55)}px Arial, sans-serif`;
  g.fillText(lines, w / 2, h / 2 + 2, w - 20);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

