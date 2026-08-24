
/* ============================================================================
   SECTION 04 — CREATURE MODELS
   ----------------------------------------------------------------------------
   D-011 / STEP2_WORLD_SPEC §8: animals and the farmer are detailed stylised
   characters, NOT blocky placeholders. Every species below is built from
   rounded forms and carries its readable anatomy — eyes, ears, snout/beak,
   tail, horns, hooves, comb, wattle, mane, udder — plus a distinct silhouette
   that still reads at gameplay distance and from scout view.

   Each model returns a Group with named parts (head, legs[], tail) so the
   animation layer can drive them without hunting through children.
   ========================================================================== */
var CREATURE = {

  _mat: function (c) { return new THREE.MeshLambertMaterial({ color: c }); },
  _shiny: function (c, s) { return new THREE.MeshPhongMaterial({ color: c, shininess: s || 60 }); },

  /* Eyes with a real highlight — cheap, and does more for appeal than
     anything else on the model. */
  eyes: function (parent, x, y, z, r, spacing) {
    var white = this._mat(0xffffff), black = this._mat(0x14100c);
    [-1, 1].forEach(function (s) {
      var e = new THREE.Mesh(new THREE.SphereBufferGeometry(r, 8, 7), white);
      e.position.set(x, y, z + s * spacing);
      e.scale.z = 0.75;
      parent.add(e);
      var p = new THREE.Mesh(new THREE.SphereBufferGeometry(r * 0.55, 7, 6), black);
      p.position.set(x + r * 0.55, y, z + s * spacing);
      parent.add(p);
      var hl = new THREE.Mesh(new THREE.SphereBufferGeometry(r * 0.22, 5, 5), white);
      hl.position.set(x + r * 0.78, y + r * 0.3, z + s * spacing + r * 0.2);
      parent.add(hl);
    });
  },

  /* Four legs, returned so the walk cycle can swing them. */
  legs: function (parent, def) {
    var out = [];
    var mat = this._mat(def.color);
    var hoofMat = this._mat(def.hoof || 0x3a2c20);
    def.at.forEach(function (p) {
      var leg = new THREE.Group();
      var upper = new THREE.Mesh(
        new THREE.CylinderBufferGeometry(def.r * 0.92, def.r * 0.78, def.len, 7), mat);
      upper.position.y = -def.len / 2;
      leg.add(upper);
      var hoof = new THREE.Mesh(
        new THREE.CylinderBufferGeometry(def.r * 0.86, def.r * 0.95, def.len * 0.22, 7), hoofMat);
      hoof.position.y = -def.len - def.len * 0.06;
      leg.add(hoof);
      leg.position.set(p[0], def.y, p[1]);
      parent.add(leg);
      out.push(leg);
    });
    return out;
  },

  /* ------------------------------------------------------------------ COW -- */
  cow: function (S) {
    var g = new THREE.Group();
    var body = this._mat(S.body), spot = this._mat(S.spot);
    var pink = this._mat(0xe89aa0);

    // barrel body — a stretched sphere reads far softer than a box
    var torso = new THREE.Mesh(new THREE.SphereBufferGeometry(2.05, 14, 11), body);
    torso.scale.set(1.55, 1.0, 1.0);
    torso.position.y = 3.1;
    torso.castShadow = SETTINGS.shadows;
    g.add(torso);
    // shoulder + rump mass so it isn't one uniform blob
    var rump = new THREE.Mesh(new THREE.SphereBufferGeometry(1.85, 12, 10), body);
    rump.position.set(-1.85, 3.25, 0); rump.scale.set(0.95, 1.0, 1.02); g.add(rump);

    // holstein patches
    [[0.9, 3.9, 1.3, 0.95],[-1.2, 3.5, -1.5, 1.15],[1.7, 2.8, -1.0, 0.8],
     [-2.2, 3.9, 0.7, 0.75]].forEach(function (p) {
      var m = new THREE.Mesh(new THREE.SphereBufferGeometry(p[3], 9, 8), spot);
      m.position.set(p[0], p[1], p[2]);
      m.scale.set(1.25, 0.75, 1.0);
      g.add(m);
    });

    // head with muzzle, nostrils, ears, horns
    var head = new THREE.Group();
    var skull = new THREE.Mesh(new THREE.SphereBufferGeometry(1.15, 12, 10), body);
    skull.scale.set(1.15, 1.0, 0.92); head.add(skull);
    var muzzle = new THREE.Mesh(new THREE.SphereBufferGeometry(0.72, 10, 8), pink);
    muzzle.position.set(1.15, -0.28, 0); muzzle.scale.set(0.9, 0.78, 1.0); head.add(muzzle);
    [[0.22],[-0.22]].forEach(function (n) {
      var nos = new THREE.Mesh(new THREE.SphereBufferGeometry(0.13, 6, 5), this._mat(0xbd7078));
      nos.position.set(1.72, -0.24, n[0]); head.add(nos);
    }, this);
    this.eyes(head, 0.72, 0.42, 0, 0.24, 0.62);
    // ears
    [-1, 1].forEach(function (s) {
      var ear = new THREE.Mesh(new THREE.SphereBufferGeometry(0.42, 7, 6), body);
      ear.scale.set(0.45, 0.85, 1.5);
      ear.position.set(-0.15, 0.55, s * 1.15);
      ear.rotation.x = s * 0.45; head.add(ear);
    });
    // stubby horns
    [-1, 1].forEach(function (s) {
      var horn = new THREE.Mesh(new THREE.ConeBufferGeometry(0.17, 0.62, 6), this._mat(0xe4dcc6));
      horn.position.set(0.15, 1.02, s * 0.52);
      horn.rotation.z = -0.3; horn.rotation.x = s * 0.5; head.add(horn);
    }, this);
    head.position.set(3.05, 3.75, 0);
    head.rotation.z = -0.12;
    g.add(head); g.userData.head = head;

    // neck
    var neck = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.85, 1.25, 1.6, 9), body);
    neck.position.set(2.35, 3.5, 0); neck.rotation.z = -1.1; g.add(neck);

    // udder + tail with a tuft
    var udder = new THREE.Mesh(new THREE.SphereBufferGeometry(0.72, 9, 7), pink);
    udder.position.set(-1.1, 2.05, 0); udder.scale.set(1.1, 0.75, 1.0); g.add(udder);
    var tail = new THREE.Group();
    var tseg = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.11, 0.16, 2.2, 6), body);
    tseg.position.y = -1.1; tail.add(tseg);
    var tuft = new THREE.Mesh(new THREE.SphereBufferGeometry(0.32, 7, 6), spot);
    tuft.position.y = -2.3; tail.add(tuft);
    tail.position.set(-3.05, 3.5, 0); tail.rotation.z = 0.28;
    g.add(tail); g.userData.tail = tail;

    g.userData.legs = this.legs(g, {
      color: S.body, hoof: 0x2e2620, r: 0.36, len: 2.2, y: 2.4,
      at: [[1.35, 0.95],[1.35, -0.95],[-1.45, 0.95],[-1.45, -0.95]]
    });
    return g;
  },

  /* ---------------------------------------------------------------- HORSE -- */
  horse: function (S) {
    var g = new THREE.Group();
    var body = this._mat(S.body), dark = this._mat(S.spot);

    var torso = new THREE.Mesh(new THREE.SphereBufferGeometry(1.85, 14, 11), body);
    torso.scale.set(1.6, 1.05, 0.92);
    torso.position.y = 3.6; torso.castShadow = SETTINGS.shadows; g.add(torso);
    var chest = new THREE.Mesh(new THREE.SphereBufferGeometry(1.6, 11, 9), body);
    chest.position.set(1.5, 3.7, 0); chest.scale.set(0.9, 1.05, 0.95); g.add(chest);

    // long arched neck — the thing that makes a horse read as a horse
    var neck = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.62, 1.15, 3.0, 9), body);
    neck.position.set(2.6, 4.9, 0); neck.rotation.z = -0.62; g.add(neck);

    var head = new THREE.Group();
    var skull = new THREE.Mesh(new THREE.SphereBufferGeometry(0.78, 11, 9), body);
    skull.scale.set(1.0, 1.15, 0.85); head.add(skull);
    var jaw = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.34, 0.46, 1.7, 8), body);
    jaw.position.set(0.62, -0.62, 0); jaw.rotation.z = -1.05; head.add(jaw);
    var nose = new THREE.Mesh(new THREE.SphereBufferGeometry(0.36, 8, 7), dark);
    nose.position.set(1.28, -1.05, 0); head.add(nose);
    this.eyes(head, 0.42, 0.34, 0, 0.19, 0.56);
    [-1, 1].forEach(function (s) {
      var ear = new THREE.Mesh(new THREE.ConeBufferGeometry(0.22, 0.72, 6), body);
      ear.position.set(-0.15, 0.95, s * 0.38);
      ear.rotation.x = -s * 0.28; head.add(ear);
    });
    head.position.set(3.7, 6.15, 0); head.rotation.z = -0.22;
    g.add(head); g.userData.head = head;

    // mane along the neck + forelock
    for (var i = 0; i < 9; i++) {
      var t = i / 8;
      var tuft = new THREE.Mesh(new THREE.SphereBufferGeometry(0.30, 6, 5), dark);
      tuft.position.set(2.05 + t * 1.75, 3.95 + t * 2.25, 0);
      tuft.scale.set(0.75, 1.5, 0.55);
      g.add(tuft);
    }
    // flowing tail
    var tail = new THREE.Group();
    for (var k = 0; k < 5; k++) {
      var seg = new THREE.Mesh(new THREE.SphereBufferGeometry(0.42 - k * 0.05, 7, 6), dark);
      seg.position.y = -0.55 * k; seg.scale.set(0.72, 1.25, 0.72);
      tail.add(seg);
    }
    tail.position.set(-2.85, 4.0, 0); tail.rotation.z = 0.42;
    g.add(tail); g.userData.tail = tail;

    g.userData.legs = this.legs(g, {
      color: S.body, hoof: 0x241c14, r: 0.30, len: 2.9, y: 2.9,
      at: [[1.30, 0.78],[1.30, -0.78],[-1.40, 0.82],[-1.40, -0.82]]
    });
    return g;
  },

  /* ---------------------------------------------------------------- SHEEP -- */
  sheep: function (S) {
    var g = new THREE.Group();
    var wool = this._mat(S.body), face = this._mat(S.spot);

    // wool built from clustered spheres — fluffy silhouette, not a capsule
    var core = new THREE.Mesh(new THREE.SphereBufferGeometry(1.75, 12, 10), wool);
    core.scale.set(1.35, 1.0, 1.0); core.position.y = 2.85;
    core.castShadow = SETTINGS.shadows; g.add(core);
    for (var i = 0; i < 10; i++) {
      var a = (i / 10) * Math.PI * 2;
      var pf = new THREE.Mesh(new THREE.SphereBufferGeometry(rand(0.72, 1.05), 8, 7), wool);
      pf.position.set(Math.cos(a) * 1.7, 2.85 + Math.sin(a * 2) * 0.75, Math.sin(a) * 1.15);
      g.add(pf);
    }

    var head = new THREE.Group();
    var skull = new THREE.Mesh(new THREE.SphereBufferGeometry(0.68, 10, 9), face);
    skull.scale.set(1.2, 1.0, 0.85); head.add(skull);
    var snout = new THREE.Mesh(new THREE.SphereBufferGeometry(0.34, 8, 7), face);
    snout.position.set(0.68, -0.18, 0); head.add(snout);
    this.eyes(head, 0.42, 0.22, 0, 0.16, 0.4);
    [-1, 1].forEach(function (s) {
      var ear = new THREE.Mesh(new THREE.SphereBufferGeometry(0.3, 7, 6), face);
      ear.scale.set(0.4, 0.55, 1.3);
      ear.position.set(-0.1, 0.28, s * 0.75);
      ear.rotation.x = s * 0.7; head.add(ear);
    });
    // woolly topknot
    var top = new THREE.Mesh(new THREE.SphereBufferGeometry(0.55, 8, 7), wool);
    top.position.set(-0.15, 0.6, 0); head.add(top);
    head.position.set(2.0, 3.15, 0);
    g.add(head); g.userData.head = head;

    var tail = new THREE.Mesh(new THREE.SphereBufferGeometry(0.42, 7, 6), wool);
    tail.position.set(-2.3, 3.0, 0);
    g.add(tail); g.userData.tail = tail;

    g.userData.legs = this.legs(g, {
      color: S.spot, hoof: 0x2a221a, r: 0.22, len: 1.5, y: 2.0,
      at: [[0.95, 0.65],[0.95, -0.65],[-0.95, 0.65],[-0.95, -0.65]]
    });
    return g;
  },

  /* ----------------------------------------------------------------- GOAT -- */
  goat: function (S) {
    var g = new THREE.Group();
    var body = this._mat(S.body), dark = this._mat(S.spot);

    var torso = new THREE.Mesh(new THREE.SphereBufferGeometry(1.35, 12, 10), body);
    torso.scale.set(1.5, 1.0, 0.92); torso.position.y = 2.75;
    torso.castShadow = SETTINGS.shadows; g.add(torso);

    var neck = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.42, 0.68, 1.5, 8), body);
    neck.position.set(1.5, 3.35, 0); neck.rotation.z = -0.72; g.add(neck);

    var head = new THREE.Group();
    var skull = new THREE.Mesh(new THREE.SphereBufferGeometry(0.62, 10, 9), body);
    skull.scale.set(1.25, 0.95, 0.85); head.add(skull);
    var snout = new THREE.Mesh(new THREE.SphereBufferGeometry(0.3, 8, 7), body);
    snout.position.set(0.7, -0.16, 0); head.add(snout);
    this.eyes(head, 0.45, 0.22, 0, 0.155, 0.4);
    // swept-back horns — goat signature
    [-1, 1].forEach(function (s) {
      var horn = new THREE.Mesh(new THREE.ConeBufferGeometry(0.14, 1.15, 6), this._mat(0xcfc2a6));
      horn.position.set(-0.42, 0.72, s * 0.3);
      horn.rotation.z = 1.05; horn.rotation.x = s * 0.28; head.add(horn);
    }, this);
    // floppy ears + chin beard
    [-1, 1].forEach(function (s) {
      var ear = new THREE.Mesh(new THREE.SphereBufferGeometry(0.26, 7, 6), body);
      ear.scale.set(0.35, 0.5, 1.5);
      ear.position.set(-0.05, 0.28, s * 0.66);
      ear.rotation.x = s * 0.95; head.add(ear);
    });
    var beard = new THREE.Mesh(new THREE.ConeBufferGeometry(0.18, 0.65, 6), dark);
    beard.position.set(0.55, -0.62, 0); beard.rotation.x = Math.PI; head.add(beard);
    head.position.set(2.25, 3.85, 0);
    g.add(head); g.userData.head = head;

    var tail = new THREE.Mesh(new THREE.ConeBufferGeometry(0.2, 0.62, 6), dark);
    tail.position.set(-1.95, 3.1, 0); tail.rotation.z = -0.9;
    g.add(tail); g.userData.tail = tail;

    g.userData.legs = this.legs(g, {
      color: S.spot, hoof: 0x241c14, r: 0.19, len: 1.55, y: 2.0,
      at: [[0.85, 0.55],[0.85, -0.55],[-0.9, 0.55],[-0.9, -0.55]]
    });
    return g;
  },

  /* ------------------------------------------------------------------ PIG -- */
  pig: function (S) {
    var g = new THREE.Group();
    var body = this._mat(S.body), dark = this._mat(S.spot);

    // low rounded barrel
    var torso = new THREE.Mesh(new THREE.SphereBufferGeometry(1.55, 13, 10), body);
    torso.scale.set(1.5, 1.0, 1.05); torso.position.y = 2.15;
    torso.castShadow = SETTINGS.shadows; g.add(torso);

    var head = new THREE.Group();
    var skull = new THREE.Mesh(new THREE.SphereBufferGeometry(0.9, 11, 9), body);
    skull.scale.set(1.05, 0.95, 1.0); head.add(skull);
    // flat disc snout with nostrils — unmistakably a pig
    var snout = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.44, 0.5, 0.42, 12), dark);
    snout.rotation.z = Math.PI / 2; snout.position.set(0.92, -0.14, 0); head.add(snout);
    [-1, 1].forEach(function (s) {
      var n = new THREE.Mesh(new THREE.SphereBufferGeometry(0.09, 6, 5), this._mat(0x9a6060));
      n.position.set(1.15, -0.14, s * 0.18); head.add(n);
    }, this);
    this.eyes(head, 0.6, 0.34, 0, 0.15, 0.44);
    // triangular forward-flopping ears
    [-1, 1].forEach(function (s) {
      var ear = new THREE.Mesh(new THREE.ConeBufferGeometry(0.38, 0.72, 6), body);
      ear.position.set(0.05, 0.78, s * 0.5);
      ear.rotation.z = -0.55; ear.rotation.x = s * 0.35; head.add(ear);
    });
    head.position.set(1.85, 2.4, 0);
    g.add(head); g.userData.head = head;

    // curly tail — a torus arc, not a straight stick
    var tail = new THREE.Group();
    var curl = new THREE.Mesh(new THREE.TorusBufferGeometry(0.32, 0.09, 5, 12, Math.PI * 1.6), body);
    curl.rotation.y = Math.PI / 2; tail.add(curl);
    tail.position.set(-2.1, 2.6, 0);
    g.add(tail); g.userData.tail = tail;

    g.userData.legs = this.legs(g, {
      color: S.body, hoof: 0x6a4a4a, r: 0.24, len: 1.15, y: 1.55,
      at: [[0.9, 0.72],[0.9, -0.72],[-0.95, 0.72],[-0.95, -0.72]]
    });
    return g;
  },

  /* -------------------------------------------------------------- CHICKEN -- */
  chicken: function (S) {
    var g = new THREE.Group();
    var body = this._mat(S.body), comb = this._mat(S.spot);
    var beakMat = this._mat(0xe8a13c);

    var torso = new THREE.Mesh(new THREE.SphereBufferGeometry(1.15, 11, 9), body);
    torso.scale.set(1.15, 1.1, 1.0); torso.position.y = 1.75;
    torso.castShadow = SETTINGS.shadows; g.add(torso);

    // layered wing feathers, not a flat plate
    [-1, 1].forEach(function (s) {
      for (var f = 0; f < 3; f++) {
        var w = new THREE.Mesh(new THREE.SphereBufferGeometry(0.5 - f * 0.08, 7, 6), body);
        w.scale.set(1.25, 0.5, 0.32);
        w.position.set(-0.1 - f * 0.28, 1.85 - f * 0.14, s * 1.02);
        w.rotation.x = s * 0.2;
        g.add(w);
      }
    });
    // tail fan
    for (var t = 0; t < 4; t++) {
      var tf = new THREE.Mesh(new THREE.SphereBufferGeometry(0.5, 7, 6), body);
      tf.scale.set(0.9, 0.22, 0.5);
      tf.position.set(-1.35, 2.15 + t * 0.24, 0);
      tf.rotation.z = 0.65 + t * 0.12;
      g.add(tf);
    }

    var head = new THREE.Group();
    var skull = new THREE.Mesh(new THREE.SphereBufferGeometry(0.55, 10, 8), body);
    head.add(skull);
    var beak = new THREE.Mesh(new THREE.ConeBufferGeometry(0.19, 0.5, 6), beakMat);
    beak.position.set(0.6, -0.05, 0); beak.rotation.z = -Math.PI / 2; head.add(beak);
    this.eyes(head, 0.34, 0.2, 0, 0.115, 0.3);
    // comb (three points) + wattle
    for (var c = 0; c < 3; c++) {
      var cm = new THREE.Mesh(new THREE.SphereBufferGeometry(0.17, 6, 5), comb);
      cm.position.set(0.1 - c * 0.2, 0.56, 0); cm.scale.set(0.7, 1.25, 0.5);
      head.add(cm);
    }
    var wattle = new THREE.Mesh(new THREE.SphereBufferGeometry(0.16, 6, 5), comb);
    wattle.position.set(0.42, -0.42, 0); wattle.scale.set(0.7, 1.2, 0.6); head.add(wattle);
    head.position.set(0.85, 2.75, 0);
    g.add(head); g.userData.head = head;

    // neck
    var neck = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.28, 0.42, 0.9, 8), body);
    neck.position.set(0.62, 2.3, 0); neck.rotation.z = -0.42; g.add(neck);

    // two scrawny legs with splayed toes
    var legMat = beakMat;
    g.userData.legs = [];
    [-1, 1].forEach(function (s) {
      var leg = new THREE.Group();
      var shin = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.08, 0.08, 0.95, 5), legMat);
      shin.position.y = -0.48; leg.add(shin);
      for (var toe = -1; toe <= 1; toe++) {
        var tt = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.05, 0.05, 0.34, 4), legMat);
        tt.position.set(0.13, -0.95, toe * 0.13);
        tt.rotation.z = -1.25; leg.add(tt);
      }
      leg.position.set(0, 1.05, s * 0.42);
      g.add(leg); g.userData.legs.push(leg);
    });
    g.userData.tail = null;
    return g;
  },

  build: function (kind, S) { return this[kind](S); },

  /* ------------------------------------------------------------- FARMER -- */
  /* Detailed stylised human: hat, hair, face, beard, plaid shirt, overalls
     with straps and a buckle, gloves, boots, and a pitchfork. */
  farmer: function () {
    var g = new THREE.Group();
    var skin  = this._mat(0xe0a878);
    var shirt = this._mat(0xc2453c);
    var denim = this._mat(0x3a5a86);
    var boot  = this._mat(0x4a3524);
    var hatM  = this._mat(0xc9a361);
    var hair  = this._mat(0x6b4a2c);
    var metal = this._shiny(0xbfc5ca, 95);

    // torso: shirt with overall bib on top
    var torso = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.92, 1.05, 2.5, 12), shirt);
    torso.position.y = 3.5; torso.castShadow = SETTINGS.shadows; g.add(torso);
    var bib = new THREE.Mesh(new THREE.BoxBufferGeometry(1.35, 1.5, 0.28), denim);
    bib.position.set(0, 3.5, 0.82); g.add(bib);
    [-1, 1].forEach(function (s) {
      var strap = new THREE.Mesh(new THREE.BoxBufferGeometry(0.24, 1.7, 0.16), denim);
      strap.position.set(s * 0.46, 4.35, 0.72); strap.rotation.x = -0.12; g.add(strap);
      var buckle = new THREE.Mesh(new THREE.BoxBufferGeometry(0.22, 0.22, 0.1), metal);
      buckle.position.set(s * 0.46, 4.0, 0.92); g.add(buckle);
    });
    // hips / trousers
    var hips = new THREE.Mesh(new THREE.CylinderBufferGeometry(1.0, 0.88, 1.0, 12), denim);
    hips.position.y = 2.15; g.add(hips);

    // head
    var head = new THREE.Group();
    var skull = new THREE.Mesh(new THREE.SphereBufferGeometry(0.78, 12, 10), skin);
    skull.scale.set(0.95, 1.05, 0.95); head.add(skull);
    var nose = new THREE.Mesh(new THREE.ConeBufferGeometry(0.14, 0.34, 6), skin);
    nose.position.set(0, -0.02, 0.76); nose.rotation.x = Math.PI / 2; head.add(nose);
    // eyes face +Z on the farmer
    [-1, 1].forEach(function (s) {
      var e = new THREE.Mesh(new THREE.SphereBufferGeometry(0.14, 7, 6), this._mat(0xffffff));
      e.position.set(s * 0.28, 0.18, 0.66); e.scale.z = 0.6; head.add(e);
      var p = new THREE.Mesh(new THREE.SphereBufferGeometry(0.075, 6, 5), this._mat(0x1a1410));
      p.position.set(s * 0.28, 0.18, 0.74); head.add(p);
      var brow = new THREE.Mesh(new THREE.BoxBufferGeometry(0.3, 0.09, 0.1), hair);
      brow.position.set(s * 0.28, 0.4, 0.7); brow.rotation.z = -s * 0.22; head.add(brow);
    }, this);
    var beard = new THREE.Mesh(new THREE.SphereBufferGeometry(0.62, 10, 8), hair);
    beard.scale.set(0.95, 0.75, 0.7); beard.position.set(0, -0.42, 0.28); head.add(beard);
    // straw hat: brim + crown + band
    var brim = new THREE.Mesh(new THREE.CylinderBufferGeometry(1.35, 1.42, 0.12, 16), hatM);
    brim.position.y = 0.72; head.add(brim);
    var crown = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.62, 0.74, 0.72, 14), hatM);
    crown.position.y = 1.08; head.add(crown);
    var band = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.76, 0.76, 0.2, 14), this._mat(0x8a4b3a));
    band.position.y = 0.85; head.add(band);
    head.position.y = 5.35;
    g.add(head); g.userData.head = head;

    // arms — grouped at the shoulder so they can swing / aim
    g.userData.arms = [];
    [-1, 1].forEach(function (s) {
      var arm = new THREE.Group();
      var upper = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.26, 0.24, 1.9, 8), shirt);
      upper.position.y = -0.95; arm.add(upper);
      var hand = new THREE.Mesh(new THREE.SphereBufferGeometry(0.3, 8, 7), this._mat(0x8a5f3a));
      hand.position.y = -2.0; arm.add(hand);
      arm.position.set(s * 1.05, 4.4, 0);
      arm.rotation.z = s * 0.18;
      g.add(arm); g.userData.arms.push(arm);
    }, this);

    // legs with boots
    g.userData.legs = [];
    [-1, 1].forEach(function (s) {
      var leg = new THREE.Group();
      var thigh = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.35, 0.3, 1.7, 8), denim);
      thigh.position.y = -0.85; leg.add(thigh);
      var bt = new THREE.Mesh(new THREE.BoxBufferGeometry(0.55, 0.5, 0.9), boot);
      bt.position.set(0, -1.85, 0.14); leg.add(bt);
      leg.position.set(s * 0.42, 1.95, 0);
      g.add(leg); g.userData.legs.push(leg);
    });

    // pitchfork in the right hand
    var fork = new THREE.Group();
    var handle = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.09, 0.09, 4.4, 7), this._mat(0x8a6238));
    fork.add(handle);
    var cross = new THREE.Mesh(new THREE.BoxBufferGeometry(0.9, 0.12, 0.12), metal);
    cross.position.y = 2.2; fork.add(cross);
    [-1, 0, 1].forEach(function (t) {
      var tine = new THREE.Mesh(new THREE.ConeBufferGeometry(0.07, 1.0, 5), metal);
      tine.position.set(t * 0.34, 2.7, 0); fork.add(tine);
    });
    fork.position.set(1.35, 3.3, 0.3);
    fork.rotation.z = -0.22;
    g.add(fork); g.userData.fork = fork;

    return g;
  }
};
