/* =====================================================================
   [CORE] PARTICLES (pooled CPU-simulated point sprites, two blend modes)
   ===================================================================== */
class ParticlePool {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max); this.size1 = new Float32Array(max);
    this.c = new Float32Array(max * 4); this.drag = new Float32Array(max); this.grav = new Float32Array(max); this.fadeIn = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3); this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(max * 4), 4); this.aCol.setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1); this.aSize.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos); this.geo.setAttribute('aCol', this.aCol); this.geo.setAttribute('aSize', this.aSize);
    this.mat = makeParticleMaterial(additive);
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = additive ? 4 : 3;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag = 1, grav = 0, fadeIn = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.size0[i] = s0; this.size1[i] = s1;
    this.c[i * 4] = r; this.c[i * 4 + 1] = g; this.c[i * 4 + 2] = b; this.c[i * 4 + 3] = a;
    this.drag[i] = drag; this.grav[i] = grav; this.fadeIn[i] = fadeIn;
  }
  update(dt) {
    let w = 0;
    const P3 = this.aPos.array, C4 = this.aCol.array, S = this.aSize.array;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      if (w !== i) {
        for (let k = 0; k < 3; k++) { this.p[w * 3 + k] = this.p[i * 3 + k]; this.v[w * 3 + k] = this.v[i * 3 + k]; }
        for (let k = 0; k < 4; k++) this.c[w * 4 + k] = this.c[i * 4 + k];
        this.life[w] = this.life[i]; this.maxLife[w] = this.maxLife[i]; this.size0[w] = this.size0[i]; this.size1[w] = this.size1[i];
        this.drag[w] = this.drag[i]; this.grav[w] = this.grav[i]; this.fadeIn[w] = this.fadeIn[i];
      }
      const d = Math.exp(-this.drag[w] * dt);
      this.v[w * 3] *= d; this.v[w * 3 + 1] = this.v[w * 3 + 1] * d - this.grav[w] * dt; this.v[w * 3 + 2] *= d;
      this.p[w * 3] += this.v[w * 3] * dt; this.p[w * 3 + 1] += this.v[w * 3 + 1] * dt; this.p[w * 3 + 2] += this.v[w * 3 + 2] * dt;
      const t = 1 - this.life[w] / this.maxLife[w];
      P3[w * 3] = this.p[w * 3]; P3[w * 3 + 1] = this.p[w * 3 + 1]; P3[w * 3 + 2] = this.p[w * 3 + 2];
      const fi = this.fadeIn[w] > 0 ? Math.min(1, t / this.fadeIn[w]) : 1;
      C4[w * 4] = this.c[w * 4]; C4[w * 4 + 1] = this.c[w * 4 + 1]; C4[w * 4 + 2] = this.c[w * 4 + 2]; C4[w * 4 + 3] = this.c[w * 4 + 3] * (1 - t) * fi;
      S[w] = lerp(this.size0[w], this.size1[w], t);
      w++;
    }
    this.n = w;
    this.geo.setDrawRange(0, w);
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
}

