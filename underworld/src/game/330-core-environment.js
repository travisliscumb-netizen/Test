/* =====================================================================
   [CORE] ENVIRONMENT: day/night cycle, sky, lighting, weather, env map
   ===================================================================== */
const WEATHER = {
  clear: { cloud: 0.18, rain: 0, fog: 0, dark: 0 },
  cloudy: { cloud: 0.78, rain: 0, fog: 0.15, dark: 0.35 },
  rain: { cloud: 0.9, rain: 0.6, fog: 0.25, dark: 0.6 },
  heavy: { cloud: 1, rain: 1, fog: 0.5, dark: 0.9 },
  fog: { cloud: 0.6, rain: 0, fog: 1, dark: 0.3 }
};
// the player's headlights: the spots' strength (scaled by how dark it is) and reach, and the lit road ahead
const HEAD_I = 110, HEAD_REACH = 95;
const HEAD_POOL = { cols: 7, along: [1.6, 3, 5, 7.5, 10, 13, 16.5, 20, 24, 28.5, 33], w0: 2.6, spread: 0.36, lift: 0.07, peak: 0.6 };
function makeHeadPool() {
  const P = HEAD_POOL, nu = P.cols, nv = P.along.length, pos = new Float32Array(nu * nv * 3), col = new Float32Array(nu * nv * 3), idx = [];
  for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) { const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1; idx.push(a, c, b, b, c, d); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 2; return m;
}
// lay the fan on the ground ahead of the car: each vertex dropped onto the surface under it (the car's own level as the
// reference, so a bridge deck or a roof above is not taken); a vertex over a drop (a ledge, the sea) goes dark
function layHeadPool(m, pv, k) {
  const P = HEAD_POOL, nu = P.cols, pa = m.geometry.attributes.position, ca = m.geometry.attributes.color, last = P.along[P.along.length - 1];
  const sinH = Math.sin(pv.h), cosH = Math.cos(pv.h), zf = pv.vg.zf, y0 = pv.pos.y;
  for (let j = 0; j < P.along.length; j++) {
    const sAl = P.along[j], half = (P.w0 + sAl * P.spread) / 2;
    // brightness along: up from nothing at the bumper to full by 5 m, then a long gentle fall to the far end
    const along = Math.min(1, (sAl - 1.2) / 4) * Math.pow(1 - sAl / (last + 0.5), 1.15);
    for (let i = 0; i < nu; i++) {
      const u = i / (nu - 1) * 2 - 1, lx = u * half, lz = zf + sAl;
      const x = pv.pos.x + sinH * lz + cosH * lx, z = pv.pos.z + cosH * lz - sinH * lx;
      const gy = groundY(x, z, y0 + 1.5), drop = y0 - gy;
      const e = (1 - u * u) * (1 - u * u) * along * P.peak * k * (drop > 3 ? 0 : 1);
      const o = (j * nu + i) * 3;
      pa.array[o] = x; pa.array[o + 1] = gy + P.lift; pa.array[o + 2] = z;
      ca.array[o] = e; ca.array[o + 1] = e * 0.93; ca.array[o + 2] = e * 0.8;
    }
  }
  pa.needsUpdate = true; ca.needsUpdate = true;
}
class Environment {
  constructor(game) {
    const g = this.g = game;
    this.time = g.save.timeOfDay; this.timeScale = 1;
    this.weather = 'clear'; this.wTimer = rand(80, 160); this.dynamic = true;
    this.cloud = 0.18; this.rain = 0; this.fog = 0; this.dark = 0; this.wet = 0; this.night = 0;
    this.gripMul = 1; this.trafficMul = 1; this.pedMul = 1;
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 400;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    g.scene.add(this.sun); g.scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0x4a4238, 0.8); g.scene.add(this.hemi);
    // player headlights (always present so the shader light count never changes)
    // (they reach 95 m and fall off gently: what stands ahead of the car (a wall, a pole, a parked car) is lit well before
    // you reach it, and the beam's brightest part is aimed ahead of the bonnet, not at the bumper)
    this.headL = new THREE.SpotLight(0xfff1dd, 0, HEAD_REACH, 0.44, 0.6, 1.15); this.headR = this.headL.clone();
    g.scene.add(this.headL, this.headR, this.headL.target, this.headR.target);
    // the road lit ahead of the player's car: a fan of light laid on the ground (conformed to it every frame: hills,
    // cambers, bridges), brightest a few metres out and fading to its far end; what the spot lights at a glancing angle
    // is too faint on a dark road to drive by
    this.headPool = makeHeadPool(); this.headPool.visible = false; g.scene.add(this.headPool);
    // how dark it is for driving: night, or a dark sky (heavy cloud, rain, fog) by day
    this.gloom = 0;
    this.police = new THREE.PointLight(0xff2020, 0, 30, 1.6); g.scene.add(this.police);
    this.rainMesh = makeRainMesh(IS_MOBILE ? 1400 : 2600); g.scene.add(this.rainMesh);
    this.pmrem = new THREE.PMREMGenerator(g.renderer);
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), makeSkyMaterial()));
    this.envKey = ''; this.envRT = null; this.flashT = 0; this.thunderT = rand(8, 20);
    this.c1 = new THREE.Color(); this.c2 = new THREE.Color();
  }
  setWeather(w, instant = false) {
    this.weather = w; this.wTimer = rand(100, 240);
    if (instant) { const t = WEATHER[w]; this.cloud = t.cloud; this.rain = t.rain; this.fog = t.fog; this.dark = t.dark; }
  }
  timeString() { const h = Math.floor(this.time) % 24, m = Math.floor((this.time % 1) * 60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); }
  update(dt) {
    const g = this.g;
    const dayLen = g.save.settings.dayLength * 60;
    // the street clock stands still while the player serves time (jail runs its own clock)
    if (!(g.uw && g.uw.inJail)) this.time = (this.time + dt * 24 / dayLen * this.timeScale) % 24;
    // weather state machine
    if (this.dynamic && g.save.settings.weather) {
      this.wTimer -= dt * Math.max(1, this.timeScale);
      if (this.wTimer <= 0) {
        const r = Math.random();
        this.setWeather(r < 0.4 ? 'clear' : r < 0.66 ? 'cloudy' : r < 0.82 ? 'rain' : r < 0.9 ? 'heavy' : 'fog');
      }
    }
    const tw = WEATHER[this.weather], k = 1 - Math.exp(-dt / 12);
    this.cloud = lerp(this.cloud, tw.cloud, k); this.rain = lerp(this.rain, tw.rain, k); this.fog = lerp(this.fog, tw.fog, k); this.dark = lerp(this.dark, tw.dark, k);
    this.wet = this.rain > this.wet ? Math.min(this.rain, this.wet + dt * 0.04) : Math.max(this.rain, this.wet - dt * 0.006);
    // sun & moon
    const t = this.time;
    const el = Math.sin((t - 6) / 12 * Math.PI);
    const az = (t - 6) / 12 * Math.PI;
    const sx = Math.cos(az) * Math.cos(Math.asin(clamp(el, -1, 1))) , sy = el, sz = 0.35;
    const sd = U.uSunDir.value.set(sx, sy, sz).normalize();
    U.uMoonDir.value.set(-sd.x, -sd.y * 0.9 + 0.25, -0.3).normalize();
    this.night = smoothstep(0.12, -0.12, sd.y);
    U.uNight.value = this.night; U.uStars.value = smoothstep(0.0, -0.2, sd.y);
    // sky colours
    const dayZ = this.c1.setRGB(0.14, 0.36, 0.84), dayH = this.c2.setRGB(0.52, 0.67, 0.86);
    const setZ = new THREE.Color(0.22, 0.26, 0.5), setH = new THREE.Color(1.0, 0.52, 0.28);
    const nZ = new THREE.Color(0.006, 0.01, 0.03), nH = new THREE.Color(0.03, 0.04, 0.075);
    const dusk = 1 - smoothstep(0.0, 0.35, Math.abs(sd.y));
    const zen = U.uZenith.value, hor = U.uHorizon.value;
    if (sd.y > 0) { zen.copy(dayZ).lerp(setZ, dusk); hor.copy(dayH).lerp(setH, dusk); }
    else { zen.copy(nZ).lerp(setZ, dusk * 0.6); hor.copy(nH).lerp(setH, dusk * 0.55); }
    const grey = new THREE.Color().setScalar(0.5 * (1 - this.night * 0.9) * (1 - this.dark * 0.45) + 0.02);
    zen.lerp(grey, this.cloud * 0.7); hor.lerp(grey, this.cloud * 0.6 + this.fog * 0.3);
    U.uCloud.value = this.cloud; U.uCloudDark.value = this.dark;
    const sunCol = U.uSunCol.value.setRGB(1, 0.93, 0.83).lerp(new THREE.Color(1, 0.55, 0.3), dusk);
    // lights
    const sunUp = sd.y > -0.02;
    const sunI = sunUp ? 3.9 * Math.pow(clamp(sd.y + 0.02, 0, 1), 0.45) * (1 - this.cloud * 0.55) * (1 - this.dark * 0.3) : 0;
    const moonI = 0.35 * this.night * (1 - this.cloud * 0.6);
    if (sunI > moonI) { this.sun.color.copy(sunCol); this.sun.intensity = sunI; this._ld = sd; }
    else { this.sun.color.setRGB(0.55, 0.65, 1.0); this.sun.intensity = moonI; this._ld = U.uMoonDir.value; }
    this.hemi.color.copy(zen).lerp(new THREE.Color(1, 1, 1), 0.35 * (1 - this.night * 0.6));
    this.hemi.groundColor.setRGB(0.28, 0.25, 0.22).multiplyScalar(1 - this.night * 0.8);
    this.hemi.intensity = lerp(0.66, 0.34, this.night) * (1 - this.dark * 0.2) + this.dark * 0.12;
    if (this.flashT > 0) { this.flashT -= dt; this.hemi.intensity += 4 * Math.max(0, this.flashT) / 0.25; }
    // thunder in heavy rain
    if (this.rain > 0.85) { this.thunderT -= dt; if (this.thunderT <= 0) { this.thunderT = rand(12, 30); this.flashT = 0.25; setTimeout(() => g.audio.play('thunder'), 600 + Math.random() * 1500); } }
    // fog
    const fogC = U.uFogCol.value.copy(hor).lerp(new THREE.Color(0.55, 0.57, 0.6).multiplyScalar(1 - this.night * 0.85), this.fog * 0.5 + this.rain * 0.2);
    const den = 0.00075 + this.fog * 0.0085 + this.rain * 0.0024 + this.night * 0.0004;
    U.uFogDen.value = den;
    g.scene.fog.color.copy(fogC); g.scene.fog.density = den;
    U.uWet.value = this.wet; U.uRain.value = this.rain;
    U.uWind.value = 0.35 + this.rain * 0.9 + this.cloud * 0.3 + Math.sin(g.time * 0.05) * 0.15;
    U.uCloudShadow.value = clamp(this.cloud * 0.55 * (1 - this.night) * (1 - this.dark * 0.6), 0, 0.4);
    U.uHaze.value = 0.0007 + this.fog * 0.004 + this.rain * 0.0018 + (1 - Math.abs(sd.y)) * 0.0008;
    this.rainMesh.visible = this.rain > 0.02;
    g.renderer.toneMappingExposure = lerp(1.0, 1.08, this.night);
    this.gripMul = 1 - this.wet * 0.18;
    this.trafficMul = trafficCurve(t) * (1 - this.rain * 0.12) * (1 - this.fog * 0.15);
    this.pedMul = pedCurve(t) * (1 - this.rain * 0.5);
    // shadow camera follows the focus, snapped to texels to avoid shimmer
    const f = g.focus;
    const ld = this._ld;
    const ext = this.sun.shadow.camera.right * 2, texel = ext / this.sun.shadow.mapSize.x;
    const fx = Math.round(f.x / texel) * texel, fz = Math.round(f.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + ld.x * 150, Math.max(20, ld.y * 150), fz + ld.z * 150);
    // environment map refresh (quantised)
    const key = Math.round(this.time * 4) + '|' + Math.round(this.cloud * 6) + '|' + Math.round(this.dark * 4);
    if (key !== this.envKey) {
      this.envKey = key;
      const rt = this.pmrem.fromScene(this.envScene, 0, 1, 1000);
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt; g.scene.environment = rt.texture;
    }
    // player headlights: on whenever it is at all dark to drive (dusk, night, cloud, rain, fog: 240 headOn)
    this.gloom = Math.max(this.night, this.dark * 0.85, this.fog * 0.6);
    const pv = g.player.state === 'vehicle' ? g.player.vehicle : null;
    const on = pv && pv.headOn && !pv.burnt;
    const hk = 0.25 + 0.75 * this.gloom;
    for (const [L, side] of [[this.headL, 1], [this.headR, -1]]) {
      if (on) {
        const a = pv.toWorld(side * (pv.spec.w / 2 - 0.35), pv.vg.zf), b = pv.toWorld(side * 1.4, pv.vg.zf + 30), hy = pv.pos.y + pv.vg.frontTop - 0.1;
        L.position.set(a.x, hy, a.z); L.target.position.set(b.x, hy - 1.35, b.z);
        L.intensity = HEAD_I * hk;
      } else L.intensity = 0;
    }
    this.headPool.visible = !!on;
    if (on) layHeadPool(this.headPool, pv, hk);
    // police light bar glow (nearest active siren)
    let best = null, bd = 60 * 60;
    for (const v of g.vehicles.list) if (v.siren && !v.burnt) { const d = dist2(v.pos.x, v.pos.z, g.cam.pos.x, g.cam.pos.z); if (d < bd) { bd = d; best = v; } }
    if (best) {
      const ph = (g.time + best.sirenPhase) * 4.5;
      const red = Math.sin(ph) > 0;
      this.police.color.setHex(red ? 0xff2020 : 0x2050ff);
      this.police.position.set(best.pos.x, best.pos.y + best.vg.cabTop + 0.6, best.pos.z);
      this.police.intensity = (Math.abs(Math.sin(ph * 4)) > 0.3 ? 30 : 6) * (0.3 + this.night);
    } else this.police.intensity = 0;
  }
}

