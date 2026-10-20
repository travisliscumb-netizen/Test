/* =====================================================================
   [CORE] CONTACT SHADOWS (soft blobs under every car and person)
   ===================================================================== */
class ShadowBlobs {
  constructor(scene, max = 260) {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({ map: makeBlobTexture(), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    scene.add(this.mesh); this.max = max; this.n = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
  }
  begin() { this.n = 0; }
  add(x, y, z, sx, sz, h = 0) {
    if (this.n >= this.max) return;
    this._q.setFromAxisAngle(this._up, h);
    this._m.compose(this._p.set(x, y + 0.03, z), this._q, this._s.set(sx, 1, sz));
    this.mesh.setMatrixAt(this.n++, this._m);
  }
  end(night) { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; this.mat.opacity = 0.62 - night * 0.22; }
}

