/* =====================================================================
   [CONTENT] VILLA VALEN'S GROUNDS: the Valen Vault's doors and the staff
   (owner, 2026-11-17)
   - The Valen Vault (the bunker in the hill behind the house, 128): its front
     is a steel slab that rolls shut across the portal and locks; inside the
     strongroom the money and the gold are behind a walk-in safe's round door.
     Both open and close for the owner (anyone else finds them as they are).
     The doors are meshes of their own with colliders that follow them; their
     state is saved (save.villa).
   - The staff, in place of the people who stood about: the butler at the front
     door (your stash: put away what you carry, take cash, open the stash), the
     valet at the gate (brings any car of yours round to the motor court, takes
     yours away to its space) and four security guards who walk the grounds,
     armed, and fight whoever comes onto the property against you (the crew's
     own guard brain, 470). None of them can be walked through.
   ===================================================================== */
const VILLA_STAFF = {
  butler: { x: -614.6, z: -898.2, h: 0, look: { shirt: 0x14161a, pants: 0x14161a, tie: 0x14161a } },
  valet: { x: -605.2, z: -853.6, h: 0, look: { shirt: 0x7a1a2a, pants: 0x1a1c20, cap: 0x7a1a2a } },
  // the guards' rounds (each walks its loop of points round the grounds)
  rounds: [
    [[-680, -860], [-680, -930], [-640, -930], [-640, -860]],
    [[-530, -862], [-530, -930], [-575, -930], [-575, -862]],
    [[-690, -1045], [-610, -1045], [-610, -975], [-690, -975]],
    [[-600, -965], [-525, -965], [-525, -985], [-600, -985]]
  ]
};
const VillaGrounds = {
  built: false,
  S(g) { const s = g.save; if (!s.villa || typeof s.villa !== 'object') s.villa = { vault: false, safe: true }; return s.villa; },
  owned(g) { return VillaValen.owned(g); },
  // ---------------------------------------------------------------- the vault's doors
  build(scene, world, g) {
    const V = VILLA_VALEN, Q = V.vault, y = world.isle && world.isle.villa ? world.isle.villa.y : V.y;
    const steel = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.35, metalness: 0.75 }), dark = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.4, metalness: 0.7 }), gold = new THREE.MeshStandardMaterial({ color: 0xd8b04a, roughness: 0.25, metalness: 0.9 });
    // the front: a slab across the portal (10 m by 5.2), ribbed, a wheel and a gold crest; it rolls east behind the wall
    const front = new THREE.Group(), dw = 10.2, dh = 5.25;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.6), steel); slab.position.y = dh / 2; front.add(slab);
    for (let i = 0; i < 5; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(dw - 0.4, 0.14, 0.12), dark); r.position.set(0, 0.6 + i * 1.0, 0.34); front.add(r); }
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.09, 8, 28), dark); wheel.position.set(0, 2.6, 0.45); front.add(wheel);
    for (let s = 0; s < 3; s++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.08), dark); sp.position.set(0, 2.6, 0.45); sp.rotation.z = s * Math.PI / 3; front.add(sp); }
    const crest = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 20).rotateX(Math.PI / 2), gold); crest.position.set(0, 2.6, 0.5); front.add(crest);
    front.traverse(o => { o.castShadow = o.receiveShadow = true; });
    front.position.set(Q.door, y, Q.z1 - 0.75); scene.add(front);
    // the safe's round door: a thick disc on a hinge at its west edge, bolts round the rim, a wheel
    const sd = new THREE.Group(), R = 1.35, hingeX = -544.4;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.4, 32).rotateX(Math.PI / 2), steel); disc.position.set(R, 0, 0); sd.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R - 0.12, 0.05, 8, 32), dark); ring.position.set(R, 0, 0.21); sd.add(ring);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8).rotateZ(Math.PI / 2), dark); b.position.set(R + Math.cos(a) * (R - 0.02), Math.sin(a) * (R - 0.02), 0); b.rotation.z = a; sd.add(b); }
    const w2 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 24), gold); w2.position.set(R, 0, 0.3); sd.add(w2);
    for (let s = 0; s < 3; s++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.05, 0.05), gold); sp.position.set(R, 0, 0.3); sp.rotation.z = s * Math.PI / 3; sd.add(sp); }
    sd.traverse(o => { o.castShadow = o.receiveShadow = true; });
    sd.position.set(hingeX, y + 1.45, -1040); scene.add(sd);
    this.doors = {
      vault: { obj: front, t: 0, want: 0, base: front.position.clone(), slide: 10.4, col: null, box: { x0: Q.door - dw / 2, x1: Q.door + dw / 2, z0: Q.z1 - 1.05, z1: Q.z1 - 0.45, y0: y, y1: y + dh }, dur: 4 },
      safe: { obj: sd, t: 0, want: 0, swing: -1.75, col: null, box: { x0: hingeX, x1: hingeX + 2 * R, z0: -1040.25, z1: -1039.75, y0: y, y1: y + 2.8 }, dur: 2.2 }
    };
    this.world = world; this.y = y; this.built = true;
    const st = this.S(g);
    this._set('vault', st.vault ? 0 : 1); this._set('safe', st.safe ? 0 : 1);
  },
  _pose(D) {
    const e = smoothstep(0, 1, D.t);
    if (D.slide) D.obj.position.x = D.base.x + D.slide * e; else D.obj.rotation.y = D.swing * e;
  },
  // t 0 shut … 1 open; a shut door has its collider, an open one none
  _set(id, t) {
    const D = this.doors[id], grid = this.world.grid; D.t = D.want = t; this._pose(D);
    if (D.col) { grid.remove(D.col); D.col = null; }
    if (t === 0 || (id === 'vault' && t === 0)) D.col = grid.add({ ...D.box, kind: 'det' });
  },
  _go(id, open, g) {
    const D = this.doors[id]; if (!D || D.want === (open ? 1 : 0)) return;
    D.want = open ? 1 : 0; if (D.col) { this.world.grid.remove(D.col); D.col = null; }
    g.audio.play('thud', { x: D.obj.position.x, z: D.obj.position.z });
    const st = this.S(g); if (id === 'vault') st.vault = !open; else st.safe = !open;
  },
  update(dt, g) {
    if (this.built) for (const id in this.doors) {
      const D = this.doors[id]; if (D.t === D.want) continue;
      D.t = D.want > D.t ? Math.min(D.want, D.t + dt / D.dur) : Math.max(D.want, D.t - dt / D.dur);
      this._pose(D); if (D.t === D.want) this._set(id, D.t);
    }
    this.staff(g, dt);
  },
  // the prompts at the vault's doors and by the staff (from the content's action search, 360)
  action(g) {
    const p = g.player; if (p.state !== 'foot' || p.interior || !this.built) return null;
    const Q = VILLA_VALEN.vault, own = this.owned(g), near = (x, z, r) => Math.hypot(p.pos.x - x, p.pos.z - z) < r && Math.abs(p.pos.y - this.y) < 3;
    const D = this.doors;
    if (near(Q.door, Q.z1 + 3, 3.2) || near(Q.door, Q.z1 - 3, 3.2)) {
      if (D.vault.t !== D.vault.want) return null;
      if (own) return { label: D.vault.t ? 'Close and lock the vault' : 'Open the vault', act: () => this._go('vault', !D.vault.t, g) };
      if (!D.vault.t) return { label: 'The Valen Vault · locked', act: () => g.ui.toast('A slab of steel the width of the portal. Nobody opens this but the owner.') };
    }
    if (near(-543, -1038.4, 2.2)) {
      if (D.safe.t !== D.safe.want) return null;
      if (own) return { label: D.safe.t ? 'Close the safe' : 'Open the safe', act: () => this._go('safe', !D.safe.t, g) };
      if (!D.safe.t) return { label: 'The safe · locked', act: () => g.ui.toast('A time lock and a twelve-digit combination. Whatever is behind it belongs to whoever owns the house.') };
    }
    const S = VILLA_STAFF;
    if (this.people && near(S.butler.x, S.butler.z + 0.6, 2.2)) return { label: 'The butler', act: () => this.butler(g) };
    if (this.people && near(S.valet.x, S.valet.z + 0.6, 2.2)) return { label: 'The valet', act: () => this.valet(g) };
    return null;
  },
  // ---------------------------------------------------------------- the staff
  staff(g, dt) {
    const p = g.player, V = VILLA_VALEN, d = Math.hypot(p.pos.x - (V.x0 + V.x1) / 2, p.pos.z - (V.z0 + V.z1) / 2), near = d < 190 && !p.interior;
    const gm = g.uw && g.uw.gangs;
    if (near && !this.people && g.peds && gm) {
      const mk = (D, kind) => { const L = Object.assign(randomLook(mulberry32(kind.length * 977)), { shirt: C(D.look.shirt), pants: C(D.look.pants), cap: D.look.cap ? C(D.look.cap) : null, tie: D.look.tie ? C(D.look.tie) : null }); const q = g.peds.make('civ', L); q.x = D.x; q.z = D.z; q.y = groundY(D.x, D.z); q.h = D.h; q.state = 'free'; q.keep = true; q.staff = kind; q.brain = idleBrain; g.peds.peds.push(q); return q; };
      const gr = { key: 'villa', kind: 'villa', fid: 'pc', x: -610, z: -900, members: [], hostile: false, crew: true };
      gm.groups.set('villa', gr);
      const guards = VILLA_STAFF.rounds.map((R, i) => { const L = crewLook(0); L.shades = true; L.jacket = C(0x111214); L.shirt = C(0x111214); L.tie = C(0x111214); L.build = 1.2; const m = gm.makeMember(gr, L, 'guard', R[0][0], R[0][1], 0); m.gun = true; m.health = m.maxHealth = 180; m.skill = 0.8; m.patrol = R; m.pi = i % R.length; m.staff = 'guard'; return m; });
      this.people = [mk(VILLA_STAFF.butler, 'butler'), mk(VILLA_STAFF.valet, 'valet'), ...guards];
    } else if (!near && this.people && d > 240) {
      for (const q of this.people) { const i = g.peds.peds.indexOf(q); if (i >= 0) g.peds.peds.splice(i, 1); }
      if (gm) gm.groups.delete('villa'); this.people = null;
    }
    if (!this.people) return;
    // the butler and the valet turn to you as you come up; nobody on the staff can be walked through
    for (const q of this.people) {
      if (q.state === 'down') continue;
      if (q.staff !== 'guard') { const dp = Math.hypot(p.pos.x - q.x, p.pos.z - q.z); if (dp < 6) { q.faceX = p.pos.x; q.faceZ = p.pos.z; } else { q.faceX = q.x + Math.sin(VILLA_STAFF[q.staff].h); q.faceZ = q.z + Math.cos(VILLA_STAFF[q.staff].h); } }
      if (p.state === 'foot') { const dx = p.pos.x - q.x, dz = p.pos.z - q.z, dd = Math.hypot(dx, dz); if (dd < 0.62 && dd > 1e-4 && Math.abs(p.pos.y - q.y) < 1.5) { p.pos.x = q.x + dx / dd * 0.62; p.pos.z = q.z + dz / dd * 0.62; } }
    }
  },
  // the butler: your stash without walking to it
  butler(g) {
    const C2 = g.content, uw = g.uw;
    if (!this.owned(g)) { g.ui.toast('“Welcome to Villa Valen. When the house is yours, so am I.”'); g.audio.play('ui'); return; }
    const goods = () => GOOD_IDS.filter(k => Inv.has(uw.S.inv, k) > 0), guns = () => WEAPONS.filter(w => w.id !== 'fists' && uw.armory.where(w.id) === 'carried');
    const acts = {
      goods: () => { const st = uw.S.storage.villa || (uw.S.storage.villa = {}); let any = false; for (const k of goods()) { const n = Math.min(Inv.has(uw.S.inv, k), Math.floor(uw.props.storageFree('villa') / GOODS[k].size)); if (n > 0) { const c = Inv.remove(uw.S.inv, k, n); Inv.add(st, k, n, c); any = true; } } return any ? 'Put away in the stash.' : 'You carry nothing to put away.'; },
      cash: () => { const m = Money.move({ key: 'inv' }, { prop: 'villa' }, Money.onMe); return m ? `${fmtMoney(m)} put in the vault.` : 'You carry no cash.'; },
      guns: () => { const L = guns(); for (const w of L) uw.armory.leave(w.id, 'villa'); return L.length ? `${L.length} gun${L.length > 1 ? 's' : ''} put on the racks.` : 'You carry no guns.'; },
      c10: () => { const m = Money.move({ prop: 'villa' }, { key: 'inv' }, 1e4); return m ? `${fmtMoney(m)} brought out to you.` : 'There is no cash in the stash.'; },
      c100: () => { const m = Money.move({ prop: 'villa' }, { key: 'inv' }, 1e5); return m ? `${fmtMoney(m)} brought out to you.` : 'There is no cash in the stash.'; },
      stash: () => { uw.ui.openProp('villa'); return null; }
    };
    const render = () => `<div class="stats"><span>Carried cash</span><span>${fmtMoney(Money.onMe)}</span><span>Cash in the stash</span><span>${fmtMoney(Money.dirtyAtProp('villa'))}</span><span>Carried goods</span><span>${goodsList(uw.S.inv)}</span><span>Guns on you</span><span>${guns().map(w => w.name).join(', ') || 'none'}</span></div>
      <div class="btns"><button class="sbtn gold" data-act="goods">Put my goods away</button><button class="sbtn gold" data-act="cash">Put my cash away</button><button class="sbtn" data-act="guns">Put my guns on the racks</button></div>
      <div class="btns"><button class="sbtn" data-act="c10">Bring me $10,000</button><button class="sbtn" data-act="c100">Bring me $100,000</button><button class="sbtn" data-act="stash">Open the stash</button></div>`;
    C2.openSvc('The butler', '“Sir. What shall I put away?”', render, act => { const f = acts[act]; if (!f) return; const msg = f(); if (msg === null) return; g.audio.play('pickup'); C2.refreshSvc(msg); });
  },
  // the valet: a car of yours brought round to the motor court; the one you came in, taken away to its space
  valet(g) {
    const C2 = g.content, R = g.vreg, s = g.save;
    if (!this.owned(g)) { g.ui.toast('“The cars are the owner’s, sir. When the house is yours, so are the keys.”'); g.audio.play('ui'); return; }
    const spot = { x: -596.5, z: -868, h: Math.PI, y: this.y };
    const mine = () => { const v = g.player.lastVehicle; return v && v.garageUid && g.vehicles.list.includes(v) && Math.hypot(v.pos.x - spot.x, v.pos.z - spot.z) < 40 ? v : null; };
    const ok = e => !e.imp && !(e.dmg >= 100);
    const render = () => {
      const v = mine();
      return `${v ? `<div class="btns"><button class="sbtn gold" data-act="away">Take the ${VEHICLES[v.type].name} away</button></div>` : ''}<h3>Bring one round</h3><div class="btns">${s.garage.filter(ok).map(e => `<button class="sbtn" data-act="bring:${e.uid}">${VEHICLES[e.type].name}</button>`).join('') || '<div class="hint">You have no cars yet.</div>'}</div>`;
    };
    C2.openSvc('The valet', '“Which one shall I bring round?”', render, act => {
      const [a, uid] = act.split(':');
      if (a === 'away') { const v = mine(), e = v && R.entryOf(v); if (!e) return; g.vehicles.despawn(v); R.cars.delete(e.uid); e.out = false; e.loc = null; if (g.player.lastVehicle === v) g.player.lastVehicle = null; g.audio.play('ui'); C2.refreshSvc(`The ${VEHICLES[e.type].name} is on its way to its space.`); return; }
      if (a === 'bring') {
        const e = s.garage.find(x => String(x.uid) === uid); if (!e) return;
        const live = R.live(e); if (live && live !== g.player.vehicle) g.vehicles.despawn(live); R.cars.delete(e.uid);
        for (const v of g.vehicles.nearby(spot.x, spot.z, 4)) if (v !== g.player.vehicle && v.garageUid && v.garageUid !== e.uid) { const o = R.entryOf(v); g.vehicles.despawn(v); R.cars.delete(v.garageUid); if (o) { o.out = false; o.loc = null; } }
        e.out = true; e.loc = { ...spot }; R.spawnFor(e, e.loc); g.audio.play('ui'); C2.refreshSvc(`The ${VEHICLES[e.type].name} is waiting in the motor court.`);
      }
    });
  }
};
