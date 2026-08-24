
/* ============================================================================
   SECTION 03 — WORLD CONSTRUCTION
   ----------------------------------------------------------------------------
   Art Bible §3/§4: stylised is not "simplified to emptiness". Every hero asset
   here is built macro -> meso -> micro: silhouette first, then structure
   (frame, trim, doors, beams), then wear detail. No asset is a coloured box.
   r128 notes: no Geometry, no CapsuleGeometry — BufferGeometry primitives only.
   ========================================================================== */
var WORLD = {
  root: null, colliders: [], windmillBlades: null, water: null,
  grass: null, trees: [], props: [], groundMat: null, _tuftMat: null,

  build: function (map) {
    this.root = new THREE.Group();
    this.colliders = []; this.trees = []; this.props = [];
    this.buildTerrain(map);
    this.buildFence(map);
    this.buildPond(map);
    this.buildPlowedField(map);
    this.buildLandmarks(map);
    this.buildGrove(map);
    this.buildScatter(map);
    this.buildGrass(map);
    this.buildOutside(map);
    return this.root;
  },

  /* ------------------------------------------------------------- TERRAIN -- */
  /* One vertex-coloured plane. Regions and roads are painted with smooth
     falloff so transitions are organic — D-006, no visible quadrant lines. */
  buildTerrain: function (map) {
    var S = map.size, seg = SETTINGS.quality === 'low' ? 96 : 160;
    var g = new THREE.PlaneBufferGeometry(S, S, seg, seg);
    g.rotateX(-Math.PI / 2);
    var pos = g.attributes.position, n = pos.count;
    var colors = new Float32Array(n * 3);
    var base = new THREE.Color(map.ground);
    var tmp = new THREE.Color(), out = new THREE.Color();

    for (var i = 0; i < n; i++) {
      var x = pos.getX(i), z = pos.getZ(i);

      // gentle rolling variation — "mostly flat with subtle detail"
      var h = Math.sin(x * 0.021) * Math.cos(z * 0.017) * 1.15
            + Math.sin(x * 0.058 + z * 0.041) * 0.42;
      pos.setY(i, h);

      out.copy(base);
      // subtle natural grass mottling so the field is never one flat green
      var mot = Math.sin(x * 0.13) * Math.cos(z * 0.11) * 0.5 + Math.sin(x * 0.4 + z * 0.3) * 0.2;
      out.offsetHSL(0, 0.02 * mot, 0.035 * mot);

      // regions, soft radial blend
      for (var r = 0; r < map.regions.length; r++) {
        var R = map.regions[r];
        var d = Math.sqrt(dist2(x, z, R.cx, R.cz));
        var t = 1 - clamp((d - R.r) / R.soft + 1, 0, 1);
        t = t * t * (3 - 2 * t);                       // smoothstep
        if (t > 0) { tmp.setHex(R.c); out.lerp(tmp, t * 0.92); }
      }
      // roads on top
      for (var rd = 0; rd < map.roads.length; rd++) {
        var road = map.roads[rd];
        var dd = this.distToBezier(x, z, road.p);
        var rt = 1 - clamp((dd - road.w) / (road.w * 0.85), 0, 1);
        rt = rt * rt * (3 - 2 * rt);
        if (rt > 0) {
          tmp.setHex(0xa8895c);
          // wheel-rut darkening down the centre
          if (dd < road.w * 0.45) tmp.offsetHSL(0, 0, -0.05);
          out.lerp(tmp, rt * 0.95);
        }
      }
      colors[i*3] = out.r; colors[i*3+1] = out.g; colors[i*3+2] = out.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();

    this.groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    var mesh = new THREE.Mesh(g, this.groundMat);
    mesh.receiveShadow = SETTINGS.shadows;
    mesh.name = 'terrain';
    this.root.add(mesh);
  },

  distToBezier: function (x, z, p) {
    var best = 1e9;
    for (var i = 0; i <= 12; i++) {
      var t = i / 12, mt = 1 - t;
      var bx = mt*mt*p[0][0] + 2*mt*t*p[1][0] + t*t*p[2][0];
      var bz = mt*mt*p[0][1] + 2*mt*t*p[1][1] + t*t*p[2][1];
      var d = dist2(x, z, bx, bz);
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  },

  /* --------------------------------------------------------------- FENCE -- */
  /* White picket around the whole property (D-007). Instanced so ~440 pickets
     cost one draw call — Arch Manual §11 draw-call budget. */
  buildFence: function (map) {
    var half = map.size / 2, spacing = 4.0, h = 4.2;
    var white = new THREE.MeshLambertMaterial({ color: 0xfdfbf4 });

    // picket: a board with the classic pointed top
    var shape = new THREE.Shape();
    shape.moveTo(-0.42, 0); shape.lineTo(0.42, 0);
    shape.lineTo(0.42, h - 0.75); shape.lineTo(0, h);
    shape.lineTo(-0.42, h - 0.75); shape.closePath();
    var pg = new THREE.ExtrudeBufferGeometry(shape, { depth: 0.18, bevelEnabled: false });
    pg.translate(0, 0, -0.09);

    var per = Math.floor(map.size / spacing);
    var total = per * 4;
    var inst = new THREE.InstancedMesh(pg, white, total);
    inst.castShadow = SETTINGS.shadows;
    var m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    var pos = new THREE.Vector3(), scl = new THREE.Vector3(1, 1, 1);
    var idx = 0, gates = [-105, 0];   // driveway gate gaps (spec §5)

    for (var side = 0; side < 4; side++) {
      for (var i = 0; i < per; i++) {
        var t = -half + i * spacing + spacing / 2, px, pz, ry;
        if (side === 0) { px = t; pz = -half; ry = 0; }
        else if (side === 1) { px = t; pz = half; ry = 0; }
        else if (side === 2) { px = -half; pz = t; ry = Math.PI / 2; }
        else { px = half; pz = t; ry = Math.PI / 2; }
        // leave a gap where the driveway meets the north edge
        if (side === 0 && Math.abs(t - gates[0]) < 6) continue;
        e.set(0, ry, rand(-0.02, 0.02));
        q.setFromEuler(e);
        pos.set(px, 0, pz);
        scl.set(1, rand(0.96, 1.04), 1);
        m.compose(pos, q, scl);
        inst.setMatrixAt(idx++, m);
      }
    }
    inst.count = idx;
    inst.instanceMatrix.needsUpdate = true;
    this.root.add(inst);

    // two horizontal rails per side
    var railMat = white;
    for (var s = 0; s < 4; s++) {
      for (var lvl = 0; lvl < 2; lvl++) {
        var rg = new THREE.BoxBufferGeometry(map.size, 0.34, 0.24);
        var rail = new THREE.Mesh(rg, railMat);
        var y = 1.1 + lvl * 1.7;
        if (s === 0) rail.position.set(0, y, -half + 0.1);
        else if (s === 1) rail.position.set(0, y, half - 0.1);
        else if (s === 2) { rail.position.set(-half + 0.1, y, 0); rail.rotation.y = Math.PI / 2; }
        else { rail.position.set(half - 0.1, y, 0); rail.rotation.y = Math.PI / 2; }
        this.root.add(rail);
      }
    }
    // gate posts at the driveway
    [-111, -99].forEach(function (gx) {
      var post = new THREE.Mesh(new THREE.BoxBufferGeometry(1.1, 6.2, 1.1),
        new THREE.MeshLambertMaterial({ color: 0xf3efe4 }));
      post.position.set(gx, 3.1, -half);
      post.castShadow = SETTINGS.shadows;
      WORLD.root.add(post);
      var cap = new THREE.Mesh(new THREE.ConeBufferGeometry(0.95, 1.0, 4),
        new THREE.MeshLambertMaterial({ color: 0xd8cfbc }));
      cap.position.set(gx, 6.6, -half); cap.rotation.y = Math.PI / 4;
      WORLD.root.add(cap);
    });
  },

  /* ---------------------------------------------------------------- POND -- */
  buildPond: function (map) {
    var P = map.pond;
    // kidney outline from two overlapping lobes
    var pts = [], N = 48;
    for (var i = 0; i < N; i++) {
      var a = (i / N) * Math.PI * 2;
      var rr = 1 + 0.22 * Math.sin(a * 2 + 0.7) - 0.16 * Math.cos(a * 3);
      pts.push(new THREE.Vector2(Math.cos(a) * P.w / 2 * rr, Math.sin(a) * P.d / 2 * rr));
    }
    var shape = new THREE.Shape(pts);

    // muddy bank ring, slightly larger and just under the waterline
    var bank = new THREE.Mesh(new THREE.ShapeBufferGeometry(shape),
      new THREE.MeshLambertMaterial({ color: 0x8d7a4f }));
    bank.rotation.x = -Math.PI / 2;
    bank.position.set(P.x, 0.10, P.z);
    bank.scale.set(1.13, 1.13, 1);
    this.root.add(bank);

    var waterMat = new THREE.MeshPhongMaterial({
      color: 0x2f8fb5, transparent: true, opacity: 0.88,
      shininess: 92, specular: 0x9fe8ff
    });
    var water = new THREE.Mesh(new THREE.ShapeBufferGeometry(shape), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(P.x, 0.30, P.z);
    water.receiveShadow = false;
    this.root.add(water);
    this.water = water;

    // two slow counter-rotating sheens read as moving water for almost nothing
    var sheenMat = new THREE.MeshBasicMaterial({
      color: 0xbdf0ff, transparent: true, opacity: 0.11, depthWrite: false });
    this.sheens = [];
    for (var s = 0; s < 2; s++) {
      var sh = new THREE.Mesh(new THREE.ShapeBufferGeometry(shape), sheenMat);
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(P.x, 0.34 + s * 0.02, P.z);
      sh.scale.setScalar(0.62 - s * 0.2);
      this.root.add(sh); this.sheens.push(sh);
    }

    // reeds and bushes around part of the shoreline, never a full ring (spec §3)
    for (var b = 0; b < 26; b++) {
      var a2 = rand(0, Math.PI * 2);
      if (Math.sin(a2 * 1.6) < -0.25) continue;      // leave gaps
      var rad = rand(0.56, 0.74);
      var bx = P.x + Math.cos(a2) * P.w * rad;
      var bz = P.z + Math.sin(a2) * P.d * rad;
      if (Math.random() < 0.5) this.root.add(this.makeBush(bx, bz, rand(0.8, 1.5)));
      else this.root.add(this.makeReeds(bx, bz));
    }
  },

  makeBush: function (x, z, s) {
    var g = new THREE.Group();
    var mat = new THREE.MeshLambertMaterial({ color: 0x4b8f38 });
    var mat2 = new THREE.MeshLambertMaterial({ color: 0x5da844 });
    for (var i = 0; i < 4; i++) {
      var b = new THREE.Mesh(new THREE.SphereBufferGeometry(rand(1.1, 1.9), 8, 6),
        i % 2 ? mat : mat2);
      b.position.set(rand(-1.2, 1.2), rand(0.7, 1.6), rand(-1.2, 1.2));
      b.scale.y = rand(0.72, 0.95);
      b.castShadow = SETTINGS.shadows;
      g.add(b);
    }
    g.position.set(x, 0, z); g.scale.setScalar(s);
    return g;
  },
  makeReeds: function (x, z) {
    var g = new THREE.Group();
    var mat = new THREE.MeshLambertMaterial({ color: 0x8fae3e });
    for (var i = 0; i < 9; i++) {
      var h = rand(1.8, 3.4);
      var r = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.055, 0.10, h, 4), mat);
      r.position.set(rand(-0.9, 0.9), h / 2, rand(-0.9, 0.9));
      r.rotation.z = rand(-0.22, 0.22); r.rotation.x = rand(-0.22, 0.22);
      g.add(r);
    }
    g.position.set(x, 0, z);
    return g;
  },

  /* -------------------------------------------------- PLOWED FIELD (§10) -- */
  /* Real low-cost furrow geometry, not just a brown colour patch. */
  buildPlowedField: function (map) {
    var F = map.plowedField;
    var g = new THREE.Group();
    var soil = new THREE.MeshLambertMaterial({ color: 0x8a6440 });
    var dark = new THREE.MeshLambertMaterial({ color: 0x6d4c2f });
    var rows = Math.floor(F.d / 3.4);
    var geo = new THREE.CylinderBufferGeometry(0.85, 1.25, F.w, 5, 1);
    geo.rotateZ(Math.PI / 2);
    var inst = new THREE.InstancedMesh(geo, soil, rows);
    var im = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1,1,1);
    for (var i = 0; i < rows; i++) {
      p.set(0, 0.42, -F.d / 2 + i * 3.4 + 1.7);
      s.set(1, rand(0.8, 1.15), 1);
      im.compose(p, q, s);
      inst.setMatrixAt(i, im);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.receiveShadow = SETTINGS.shadows;
    g.add(inst);

    // darker troughs between the ridges
    var tgeo = new THREE.BoxBufferGeometry(F.w, 0.12, 1.5);
    var tinst = new THREE.InstancedMesh(tgeo, dark, rows);
    for (var j = 0; j < rows; j++) {
      p.set(0, 0.16, -F.d / 2 + j * 3.4);
      im.compose(p, q, new THREE.Vector3(1, 1, 1));
      tinst.setMatrixAt(j, im);
    }
    tinst.instanceMatrix.needsUpdate = true;
    g.add(tinst);

    g.position.set(F.x, 0, F.z);
    g.rotation.y = F.rot;
    this.root.add(g);
  },

  /* ----------------------------------------------------------- LANDMARKS -- */
  buildLandmarks: function (map) {
    var self = this;
    map.landmarks.forEach(function (L) {
      var obj = null;
      switch (L.kind) {
        case 'barn':      obj = self.makeBarn(L); break;
        case 'farmhouse': obj = self.makeFarmhouse(L); break;
        case 'shed':      obj = self.makeShed(L); break;
        case 'windmill':  obj = self.makeWindmill(L); break;
        case 'truck':     obj = self.makeTruck(L); break;
        case 'tractor':   obj = self.makeTractor(L); break;
      }
      if (!obj) return;
      obj.position.set(L.x, 0, L.z);
      obj.rotation.y = L.rot || 0;
      self.root.add(obj);
      if (L.collide) {
        self.colliders.push({
          x: L.x, z: L.z, r: Math.max(L.w, L.d) * 0.52, h: L.h, id: L.id
        });
      }
    });
  },

  /* ---- BARN: hero asset. Art Bible §6 requires roof silhouette, structural
     frame, plank cladding, trim, big doors with hardware, windows, loft,
     foundation and wear. Not "a red box with a roof". ---- */
  makeBarn: function (L) {
    var g = new THREE.Group();
    var W = L.w, D = L.d, wallH = L.h * 0.55;
    var red   = new THREE.MeshLambertMaterial({ color: 0xc8452f });
    var redDk = new THREE.MeshLambertMaterial({ color: 0xa63524 });
    var trim  = new THREE.MeshLambertMaterial({ color: 0xfdf6e6 });
    var roof  = new THREE.MeshLambertMaterial({ color: 0x4a5560 });
    var wood  = new THREE.MeshLambertMaterial({ color: 0x6b4b33 });
    var stone = new THREE.MeshLambertMaterial({ color: 0x9c9489 });

    // foundation — believable connection to the ground
    var found = new THREE.Mesh(new THREE.BoxBufferGeometry(W + 1.2, 1.0, D + 1.2), stone);
    found.position.y = 0.5; found.receiveShadow = SETTINGS.shadows; g.add(found);

    // main volume
    var body = new THREE.Mesh(new THREE.BoxBufferGeometry(W, wallH, D), red);
    body.position.y = wallH / 2 + 0.9;
    body.castShadow = body.receiveShadow = SETTINGS.shadows;
    g.add(body);

    // vertical plank breakup (meso detail) on the two long walls
    var plank = new THREE.BoxBufferGeometry(0.34, wallH * 0.97, 0.16);
    var nPlank = Math.floor(W / 1.8);
    var pin = new THREE.InstancedMesh(plank, redDk, nPlank * 2);
    var m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1,1,1);
    var k = 0;
    for (var i = 0; i < nPlank; i++) {
      var px = -W / 2 + 0.9 + i * 1.8;
      p.set(px, wallH / 2 + 0.9, D / 2 + 0.02); m.compose(p, q, s); pin.setMatrixAt(k++, m);
      p.set(px, wallH / 2 + 0.9, -D / 2 - 0.02); m.compose(p, q, s); pin.setMatrixAt(k++, m);
    }
    pin.instanceMatrix.needsUpdate = true; g.add(pin);

    // gambrel roof — the silhouette that makes a barn read as a barn
    var roofY = wallH + 0.9;
    var lowerH = L.h * 0.26, upperH = L.h * 0.22;
    var lower = new THREE.Mesh(new THREE.BoxBufferGeometry(W + 1.4, 0.5, D * 0.62), roof);
    lower.position.set(0, roofY + lowerH * 0.5, 0);
    lower.rotation.x = 0; g.add(lower);
    // build gambrel as four sloped slabs
    function slab(w, h, d, x, y, z, rx, rz) {
      var mm = new THREE.Mesh(new THREE.BoxBufferGeometry(w, h, d), roof);
      mm.position.set(x, y, z); mm.rotation.x = rx || 0; mm.rotation.z = rz || 0;
      mm.castShadow = SETTINGS.shadows;
      return mm;
    }
    var sl = Math.sqrt(Math.pow(D * 0.30, 2) + Math.pow(lowerH, 2));
    var su = Math.sqrt(Math.pow(D * 0.22, 2) + Math.pow(upperH, 2));
    g.add(slab(W + 1.6, 0.42, sl * 2, 0, roofY + lowerH / 2, D * 0.15 + 0.5, -Math.atan2(lowerH, D * 0.30)));
    g.add(slab(W + 1.6, 0.42, sl * 2, 0, roofY + lowerH / 2, -D * 0.15 - 0.5, Math.atan2(lowerH, D * 0.30)));
    g.add(slab(W + 1.6, 0.42, su * 2, 0, roofY + lowerH + upperH / 2, D * 0.055, -Math.atan2(upperH, D * 0.22)));
    g.add(slab(W + 1.6, 0.42, su * 2, 0, roofY + lowerH + upperH / 2, -D * 0.055, Math.atan2(upperH, D * 0.22)));

    // gable end faces so the roof reads solid from the side
    var gshape = new THREE.Shape();
    gshape.moveTo(-D / 2, 0); gshape.lineTo(-D * 0.30, lowerH);
    gshape.lineTo(0, lowerH + upperH); gshape.lineTo(D * 0.30, lowerH);
    gshape.lineTo(D / 2, 0); gshape.closePath();
    var gg = new THREE.ExtrudeBufferGeometry(gshape, { depth: 0.5, bevelEnabled: false });
    [1, -1].forEach(function (sgn) {
      var face = new THREE.Mesh(gg, red);
      face.rotation.y = Math.PI / 2 * sgn;
      face.position.set(sgn * (W / 2 + 0.2), roofY, 0);
      g.add(face);
    });

    // big sliding doors + track + hardware (§6 door hardware)
    var doorW = W * 0.30, doorH = wallH * 0.74;
    [-1, 1].forEach(function (sgn) {
      var d = new THREE.Mesh(new THREE.BoxBufferGeometry(doorW, doorH, 0.4), wood);
      d.position.set(sgn * doorW * 0.52, doorH / 2 + 0.9, D / 2 + 0.3);
      g.add(d);
      // X brace
      [-0.6, 0.6].forEach(function (r) {
        var br = new THREE.Mesh(new THREE.BoxBufferGeometry(doorW * 1.18, 0.34, 0.12), trim);
        br.position.set(sgn * doorW * 0.52, doorH / 2 + 0.9, D / 2 + 0.52);
        br.rotation.z = r; g.add(br);
      });
    });
    var track = new THREE.Mesh(new THREE.BoxBufferGeometry(doorW * 2.5, 0.24, 0.3), stone);
    track.position.set(0, doorH + 1.1, D / 2 + 0.42); g.add(track);

    // hayloft opening + hoist beam
    var loft = new THREE.Mesh(new THREE.BoxBufferGeometry(3.6, 3.2, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x2b1d14 }));
    loft.position.set(0, roofY + lowerH * 0.55, D / 2 + 0.25); g.add(loft);
    var beam = new THREE.Mesh(new THREE.BoxBufferGeometry(0.5, 0.5, 3.2), wood);
    beam.position.set(0, roofY + lowerH * 1.05, D / 2 + 1.4); g.add(beam);

    // windows with trim
    [-W * 0.30, W * 0.30].forEach(function (wx) {
      [D / 2 + 0.06, -D / 2 - 0.06].forEach(function (wz) {
        var fr = new THREE.Mesh(new THREE.BoxBufferGeometry(2.5, 2.5, 0.16), trim);
        fr.position.set(wx, wallH * 0.72, wz); g.add(fr);
        var gl = new THREE.Mesh(new THREE.BoxBufferGeometry(2.0, 2.0, 0.1),
          new THREE.MeshPhongMaterial({ color: 0x2c4a52, shininess: 90 }));
        gl.position.set(wx, wallH * 0.72, wz + (wz > 0 ? 0.06 : -0.06)); g.add(gl);
      });
    });

    // corner trim boards
    [[-W/2, D/2],[W/2, D/2],[-W/2,-D/2],[W/2,-D/2]].forEach(function (c) {
      var t = new THREE.Mesh(new THREE.BoxBufferGeometry(0.5, wallH, 0.5), trim);
      t.position.set(c[0], wallH / 2 + 0.9, c[1]); g.add(t);
    });

    // cupola + weather vane — the memorable bit of the silhouette
    var cup = new THREE.Mesh(new THREE.BoxBufferGeometry(2.6, 2.2, 2.6), red);
    cup.position.y = roofY + lowerH + upperH + 1.0; g.add(cup);
    var cupRoof = new THREE.Mesh(new THREE.ConeBufferGeometry(2.3, 1.6, 4), roof);
    cupRoof.position.y = roofY + lowerH + upperH + 2.9;
    cupRoof.rotation.y = Math.PI / 4; g.add(cupRoof);
    var rod = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.08, 0.08, 2.2, 5), stone);
    rod.position.y = roofY + lowerH + upperH + 4.4; g.add(rod);
    var vane = new THREE.Mesh(new THREE.BoxBufferGeometry(1.7, 0.7, 0.08), stone);
    vane.position.y = roofY + lowerH + upperH + 5.2; g.add(vane);

    // hay bales stacked against the wall — environmental storytelling (§16)
    var hay = new THREE.MeshLambertMaterial({ color: 0xd9b45c });
    for (var hb = 0; hb < 5; hb++) {
      var bale = new THREE.Mesh(new THREE.BoxBufferGeometry(2.4, 1.6, 1.6), hay);
      bale.position.set(-W / 2 - 1.8, 0.9 + (hb % 2) * 1.65, -D * 0.3 + Math.floor(hb / 2) * 1.8);
      bale.rotation.y = rand(-0.1, 0.1);
      bale.castShadow = SETTINGS.shadows;
      g.add(bale);
    }
    return g;
  },

  /* ---- FARMHOUSE: hero asset. Art Bible §7 — porch, eaves, chimney,
     window depth/trim, foundation, railings, steps, fixtures. ---- */
  makeFarmhouse: function (L) {
    var g = new THREE.Group();
    var W = L.w, D = L.d, wallH = L.h * 0.52;
    var wall  = new THREE.MeshLambertMaterial({ color: 0xf2e8d4 });
    var trim  = new THREE.MeshLambertMaterial({ color: 0xffffff });
    var roof  = new THREE.MeshLambertMaterial({ color: 0x5a4034 });
    var brick = new THREE.MeshLambertMaterial({ color: 0x9c5a44 });
    var wood  = new THREE.MeshLambertMaterial({ color: 0x7d5a3c });
    var stone = new THREE.MeshLambertMaterial({ color: 0xa8a096 });

    var found = new THREE.Mesh(new THREE.BoxBufferGeometry(W + 0.8, 0.9, D + 0.8), stone);
    found.position.y = 0.45; g.add(found);

    var body = new THREE.Mesh(new THREE.BoxBufferGeometry(W, wallH, D), wall);
    body.position.y = wallH / 2 + 0.8;
    body.castShadow = body.receiveShadow = SETTINGS.shadows; g.add(body);

    // clapboard siding lines
    var lines = Math.floor(wallH / 1.1);
    var lg = new THREE.BoxBufferGeometry(W + 0.06, 0.1, D + 0.06);
    var lin = new THREE.InstancedMesh(lg, new THREE.MeshLambertMaterial({ color: 0xe0d3bb }), lines);
    var m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1,1,1);
    for (var i = 0; i < lines; i++) { p.set(0, 1.2 + i * 1.1, 0); m.compose(p, q, s); lin.setMatrixAt(i, m); }
    lin.instanceMatrix.needsUpdate = true; g.add(lin);

    // pitched roof with real overhanging eaves
    var rh = L.h * 0.40;
    var rshape = new THREE.Shape();
    rshape.moveTo(-D / 2 - 1.3, 0); rshape.lineTo(0, rh); rshape.lineTo(D / 2 + 1.3, 0); rshape.closePath();
    var rgeo = new THREE.ExtrudeBufferGeometry(rshape, { depth: W + 2.0, bevelEnabled: false });
    var rm = new THREE.Mesh(rgeo, roof);
    rm.rotation.y = Math.PI / 2;
    rm.position.set(W / 2 + 1.0, wallH + 0.8, 0);
    rm.castShadow = SETTINGS.shadows; g.add(rm);

    // porch across the front: deck, posts, railing, steps, roof
    var porchD = 5.0;
    var deck = new THREE.Mesh(new THREE.BoxBufferGeometry(W * 0.82, 0.4, porchD), wood);
    deck.position.set(0, 0.95, D / 2 + porchD / 2); g.add(deck);
    for (var pp = 0; pp < 4; pp++) {
      var px = -W * 0.36 + pp * (W * 0.72 / 3);
      var post = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.22, 0.24, wallH * 0.72, 7), trim);
      post.position.set(px, 0.95 + wallH * 0.36, D / 2 + porchD - 0.5); g.add(post);
    }
    var prail = new THREE.Mesh(new THREE.BoxBufferGeometry(W * 0.82, 0.22, 0.22), trim);
    prail.position.set(0, 2.05, D / 2 + porchD - 0.5); g.add(prail);
    var proof = new THREE.Mesh(new THREE.BoxBufferGeometry(W * 0.88, 0.34, porchD + 0.7), roof);
    proof.position.set(0, 0.95 + wallH * 0.74, D / 2 + porchD / 2 - 0.2);
    proof.rotation.x = -0.10; proof.castShadow = SETTINGS.shadows; g.add(proof);
    for (var st = 0; st < 3; st++) {
      var step = new THREE.Mesh(new THREE.BoxBufferGeometry(4.4, 0.28, 0.8), stone);
      step.position.set(0, 0.82 - st * 0.28, D / 2 + porchD + 0.4 + st * 0.8); g.add(step);
    }

    // front door
    var door = new THREE.Mesh(new THREE.BoxBufferGeometry(2.2, 4.0, 0.24),
      new THREE.MeshLambertMaterial({ color: 0x3f6b52 }));
    door.position.set(0, 3.15, D / 2 + 0.12); g.add(door);
    var knob = new THREE.Mesh(new THREE.SphereBufferGeometry(0.15, 7, 6),
      new THREE.MeshPhongMaterial({ color: 0xd8b45a, shininess: 100 }));
    knob.position.set(0.75, 3.05, D / 2 + 0.26); g.add(knob);

    // recessed windows with trim + sills (window depth, §7)
    var wpos = [[-W*0.3, 3.4, D/2],[W*0.3, 3.4, D/2],[-W*0.3, 3.4, -D/2],[W*0.3, 3.4, -D/2],
                [-W*0.3, wallH-0.6, D/2],[W*0.3, wallH-0.6, D/2]];
    wpos.forEach(function (w) {
      var zs = w[2] > 0 ? 1 : -1;
      var fr = new THREE.Mesh(new THREE.BoxBufferGeometry(2.3, 2.9, 0.2), trim);
      fr.position.set(w[0], w[1], w[2] + zs * 0.08); g.add(fr);
      var gl = new THREE.Mesh(new THREE.BoxBufferGeometry(1.8, 2.4, 0.1),
        new THREE.MeshPhongMaterial({ color: 0x4e7a86, shininess: 95 }));
      gl.position.set(w[0], w[1], w[2] + zs * 0.16); g.add(gl);
      var mull = new THREE.Mesh(new THREE.BoxBufferGeometry(0.12, 2.4, 0.12), trim);
      mull.position.set(w[0], w[1], w[2] + zs * 0.22); g.add(mull);
      var sill = new THREE.Mesh(new THREE.BoxBufferGeometry(2.6, 0.18, 0.4), trim);
      sill.position.set(w[0], w[1] - 1.55, w[2] + zs * 0.16); g.add(sill);
    });

    // chimney
    var chim = new THREE.Mesh(new THREE.BoxBufferGeometry(2.0, L.h * 0.62, 2.0), brick);
    chim.position.set(-W * 0.28, wallH + L.h * 0.30, -D * 0.18);
    chim.castShadow = SETTINGS.shadows; g.add(chim);
    var cap2 = new THREE.Mesh(new THREE.BoxBufferGeometry(2.4, 0.3, 2.4), stone);
    cap2.position.set(-W * 0.28, wallH + L.h * 0.62, -D * 0.18); g.add(cap2);

    // porch clutter + mailbox (storytelling props)
    var chair = new THREE.Group();
    chair.add(new THREE.Mesh(new THREE.BoxBufferGeometry(1.1, 0.16, 1.1), wood));
    var back = new THREE.Mesh(new THREE.BoxBufferGeometry(1.1, 1.2, 0.14), wood);
    back.position.set(0, 0.65, -0.5); chair.add(back);
    chair.position.set(W * 0.26, 1.2, D / 2 + 2.2); chair.rotation.y = -0.5; g.add(chair);

    var mail = new THREE.Group();
    var mpost = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.13, 0.13, 3.0, 6), wood);
    mpost.position.y = 1.5; mail.add(mpost);
    var mbox = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.5, 0.5, 1.3, 8, 1, false, 0, Math.PI), stone);
    mbox.rotation.z = Math.PI / 2; mbox.position.y = 3.1; mail.add(mbox);
    mail.position.set(W * 0.66, 0, D / 2 + 8); g.add(mail);

    return g;
  },

  makeShed: function (L) {
    var g = new THREE.Group();
    var W = L.w, D = L.d, H = L.h;
    var wall  = new THREE.MeshLambertMaterial({ color: 0x9d8464 });
    var trim  = new THREE.MeshLambertMaterial({ color: 0xf0e6d2 });
    var roof  = new THREE.MeshLambertMaterial({ color: 0x5d6068 });
    var wood  = new THREE.MeshLambertMaterial({ color: 0x6b4b33 });

    var body = new THREE.Mesh(new THREE.BoxBufferGeometry(W, H * 0.72, D), wall);
    body.position.y = H * 0.36 + 0.3;
    body.castShadow = body.receiveShadow = SETTINGS.shadows;
    g.add(body);

    // simple mono-pitch (lean-to) roof with an overhang
    var rf = new THREE.Mesh(new THREE.BoxBufferGeometry(W + 1.5, 0.35, D + 1.5), roof);
    rf.position.y = H * 0.74 + 0.4;
    rf.rotation.x = 0.16;
    rf.castShadow = SETTINGS.shadows;
    g.add(rf);

    // double doors with a cross brace
    var doorH = H * 0.52;
    [-1, 1].forEach(function (sgn) {
      var d = new THREE.Mesh(new THREE.BoxBufferGeometry(W * 0.26, doorH, 0.22), wood);
      d.position.set(sgn * W * 0.15, doorH / 2 + 0.3, D / 2 + 0.14);
      g.add(d);
      var br = new THREE.Mesh(new THREE.BoxBufferGeometry(W * 0.32, 0.18, 0.08), trim);
      br.position.set(sgn * W * 0.15, doorH / 2 + 0.3, D / 2 + 0.27);
      br.rotation.z = sgn * 0.7;
      g.add(br);
    });

    // corner trim + a small window
    [[-W/2, D/2],[W/2, D/2],[-W/2,-D/2],[W/2,-D/2]].forEach(function (c) {
      var t = new THREE.Mesh(new THREE.BoxBufferGeometry(0.32, H * 0.72, 0.32), trim);
      t.position.set(c[0], H * 0.36 + 0.3, c[1]);
      g.add(t);
    });
    var win = new THREE.Mesh(new THREE.BoxBufferGeometry(1.5, 1.5, 0.12),
      new THREE.MeshPhongMaterial({ color: 0x3e5f66, shininess: 90 }));
    win.position.set(-W * 0.3, H * 0.5, -D / 2 - 0.07);
    g.add(win);

    // leaning tools against the side wall — storytelling detail
    for (var i = 0; i < 3; i++) {
      var handle = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.09, 0.09, 3.4, 5), wood);
      handle.position.set(W / 2 + 0.5, 1.7, -D * 0.2 + i * 0.6);
      handle.rotation.z = -0.28;
      g.add(handle);
    }
    return g;
  },

  makeWindmill: function (L) {
    var g = new THREE.Group();
    var metal = new THREE.MeshLambertMaterial({ color: 0xb9bcc0 });
    var dark  = new THREE.MeshLambertMaterial({ color: 0x7c8288 });
    var H = L.h;

    // tapered lattice tower — four legs plus cross bracing
    var legs = [];
    var base = 3.4, top = 1.0;
    for (var i = 0; i < 4; i++) {
      var a = i * Math.PI / 2 + Math.PI / 4;
      var bx = Math.cos(a) * base, bz = Math.sin(a) * base;
      var tx = Math.cos(a) * top,  tz = Math.sin(a) * top;
      var len = Math.sqrt(Math.pow(bx - tx, 2) + Math.pow(H, 2) + Math.pow(bz - tz, 2));
      var leg = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.17, 0.22, len, 5), metal);
      leg.position.set((bx + tx) / 2, H / 2, (bz + tz) / 2);
      leg.lookAt(new THREE.Vector3(tx, H, tz));
      leg.rotateX(Math.PI / 2);
      g.add(leg); legs.push([bx, bz, tx, tz]);
    }
    // horizontal rings + X bracing
    for (var lvl = 1; lvl <= 4; lvl++) {
      var t = lvl / 5, y = H * t;
      var r = base + (top - base) * t;
      var ring = new THREE.Mesh(new THREE.TorusBufferGeometry(r * 1.06, 0.07, 4, 4), dark);
      ring.rotation.x = Math.PI / 2; ring.position.y = y;
      ring.rotation.z = Math.PI / 4; g.add(ring);
      for (var b2 = 0; b2 < 4; b2++) {
        var a2 = b2 * Math.PI / 2 + Math.PI / 4;
        var br = new THREE.Mesh(new THREE.BoxBufferGeometry(0.09, r * 2.0, 0.09), dark);
        br.position.set(Math.cos(a2 + 0.4) * r * 0.7, y - H * 0.09, Math.sin(a2 + 0.4) * r * 0.7);
        br.rotation.z = 0.7; br.rotation.y = a2; g.add(br);
      }
    }

    // hub + 18 blades — the classic American farm windmill fan
    var hub = new THREE.Group();
    hub.position.y = H;
    var hc = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.7, 0.7, 0.7, 10), dark);
    hc.rotation.x = Math.PI / 2; hub.add(hc);
    var bladeMat = new THREE.MeshLambertMaterial({ color: 0xe8ebee, side: THREE.DoubleSide });
    var N = 18;
    for (var k = 0; k < N; k++) {
      var ang = (k / N) * Math.PI * 2;
      var bl = new THREE.Mesh(new THREE.BoxBufferGeometry(0.9, 3.0, 0.06), bladeMat);
      bl.position.set(Math.cos(ang) * 3.0, Math.sin(ang) * 3.0, 0.16);
      bl.rotation.z = ang + Math.PI / 2;
      bl.rotation.y = 0.42;                 // pitch, so it reads as a fan
      hub.add(bl);
    }
    var rim = new THREE.Mesh(new THREE.TorusBufferGeometry(4.5, 0.09, 5, 22), dark);
    hub.add(rim);
    g.add(hub);
    this.windmillBlades = hub;

    // tail vane
    var tailArm = new THREE.Mesh(new THREE.BoxBufferGeometry(0.16, 0.16, 5.0), dark);
    tailArm.position.set(0, H, -2.6); g.add(tailArm);
    var vane = new THREE.Mesh(new THREE.BoxBufferGeometry(0.08, 2.6, 3.4), bladeMat);
    vane.position.set(0, H + 0.3, -5.0); g.add(vane);

    // stock tank at the foot — this is a water-pumping windmill
    var tank = new THREE.Mesh(new THREE.CylinderBufferGeometry(2.6, 2.6, 1.4, 14), dark);
    tank.position.set(4.4, 0.7, 2.0); g.add(tank);
    var wsurf = new THREE.Mesh(new THREE.CircleBufferGeometry(2.4, 14),
      new THREE.MeshPhongMaterial({ color: 0x3f92b0, shininess: 90 }));
    wsurf.rotation.x = -Math.PI / 2; wsurf.position.set(4.4, 1.38, 2.0); g.add(wsurf);
    return g;
  },

  makeTruck: function (L) {
    var g = new THREE.Group();
    var paint = new THREE.MeshPhongMaterial({ color: 0x2f6ea8, shininess: 62 });
    var dark  = new THREE.MeshLambertMaterial({ color: 0x2a2a2c });
    var glass = new THREE.MeshPhongMaterial({ color: 0x8fc4d8, shininess: 100, transparent: true, opacity: 0.75 });
    var chrome= new THREE.MeshPhongMaterial({ color: 0xcfd4d8, shininess: 110 });

    var bed = new THREE.Mesh(new THREE.BoxBufferGeometry(7.0, 1.1, 3.0), paint);
    bed.position.y = 1.55; bed.castShadow = SETTINGS.shadows; g.add(bed);
    var cab = new THREE.Mesh(new THREE.BoxBufferGeometry(2.6, 1.7, 2.8), paint);
    cab.position.set(1.0, 2.75, 0); g.add(cab);
    var win = new THREE.Mesh(new THREE.BoxBufferGeometry(2.3, 1.1, 2.85), glass);
    win.position.set(1.0, 3.0, 0); g.add(win);
    var walls = new THREE.Mesh(new THREE.BoxBufferGeometry(3.4, 0.9, 3.0), paint);
    walls.position.set(-1.9, 2.4, 0); g.add(walls);
    var bumper = new THREE.Mesh(new THREE.BoxBufferGeometry(0.3, 0.4, 3.1), chrome);
    bumper.position.set(3.6, 1.5, 0); g.add(bumper);
    [[2.2, 1.5],[2.2, -1.5],[-2.2, 1.5],[-2.2, -1.5]].forEach(function (w) {
      var tire = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.95, 0.95, 0.6, 12), dark);
      tire.rotation.x = Math.PI / 2;
      tire.position.set(w[0], 0.95, w[1]); g.add(tire);
      var hubc = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.42, 0.42, 0.64, 8), chrome);
      hubc.rotation.x = Math.PI / 2; hubc.position.set(w[0], 0.95, w[1]); g.add(hubc);
    });
    return g;
  },

  makeTractor: function (L) {
    var g = new THREE.Group();
    var paint = new THREE.MeshPhongMaterial({ color: 0x2f7d3a, shininess: 60 });
    var yellow= new THREE.MeshLambertMaterial({ color: 0xe8c53c });
    var dark  = new THREE.MeshLambertMaterial({ color: 0x27272a });
    var chrome= new THREE.MeshPhongMaterial({ color: 0xc9ced2, shininess: 100 });

    var body = new THREE.Mesh(new THREE.BoxBufferGeometry(4.4, 1.5, 2.2), paint);
    body.position.y = 2.0; body.castShadow = SETTINGS.shadows; g.add(body);
    var hood = new THREE.Mesh(new THREE.BoxBufferGeometry(2.4, 1.2, 1.8), paint);
    hood.position.set(1.6, 2.5, 0); g.add(hood);
    var stack = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.16, 0.20, 2.2, 7), dark);
    stack.position.set(2.3, 4.0, 0); g.add(stack);
    // cab / roll bar + seat
    var bar = new THREE.Mesh(new THREE.TorusBufferGeometry(1.0, 0.11, 5, 9, Math.PI), chrome);
    bar.position.set(-0.9, 3.4, 0); g.add(bar);
    var seat = new THREE.Mesh(new THREE.BoxBufferGeometry(0.9, 0.28, 1.0),
      new THREE.MeshLambertMaterial({ color: 0x1f1f22 }));
    seat.position.set(-0.7, 2.9, 0); g.add(seat);
    var sback = new THREE.Mesh(new THREE.BoxBufferGeometry(0.22, 1.0, 1.0),
      new THREE.MeshLambertMaterial({ color: 0x1f1f22 }));
    sback.position.set(-1.15, 3.35, 0); g.add(sback);
    var wheelSt = new THREE.Mesh(new THREE.TorusBufferGeometry(0.42, 0.07, 5, 12), dark);
    wheelSt.position.set(0.1, 3.2, 0); wheelSt.rotation.y = Math.PI / 2; wheelSt.rotation.x = 0.6; g.add(wheelSt);
    // big rear wheels, small fronts
    [[-1.4, 1.5, 1.55],[-1.4, -1.5, 1.55],[1.8, 1.1, 0.85],[1.8, -1.1, 0.85]].forEach(function (w) {
      var tire = new THREE.Mesh(new THREE.CylinderBufferGeometry(w[2], w[2], 0.72, 14), dark);
      tire.rotation.x = Math.PI / 2; tire.position.set(w[0], w[2], w[1]);
      tire.castShadow = SETTINGS.shadows; g.add(tire);
      var rim2 = new THREE.Mesh(new THREE.CylinderBufferGeometry(w[2] * 0.5, w[2] * 0.5, 0.76, 10), yellow);
      rim2.rotation.x = Math.PI / 2; rim2.position.set(w[0], w[2], w[1]); g.add(rim2);
    });
    if (L.plow) {
      var ph = new THREE.Group();
      var barr = new THREE.Mesh(new THREE.BoxBufferGeometry(0.3, 0.3, 4.4), chrome);
      barr.position.set(-3.2, 1.2, 0); ph.add(barr);
      for (var d = 0; d < 5; d++) {
        var disc = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.85, 0.85, 0.12, 12),
          new THREE.MeshPhongMaterial({ color: 0x8a3f2c, shininess: 70 }));
        disc.rotation.z = Math.PI / 2; disc.rotation.y = 0.25;
        disc.position.set(-3.4, 0.85, -1.8 + d * 0.9); ph.add(disc);
      }
      g.add(ph);
    }
    return g;
  },

  /* --------------------------------------------------------------- GROVE -- */
  buildGrove: function (map) {
    var G = map.grove;
    // deliberately irregular placement, never a grid (spec §3)
    var used = [];
    for (var i = 0; i < G.trees; i++) {
      var tries = 0, x, z, ok;
      do {
        var a = rand(0, Math.PI * 2), rr = Math.sqrt(Math.random()) * G.r;
        x = G.x + Math.cos(a) * rr * rand(0.8, 1.25);
        z = G.z + Math.sin(a) * rr * rand(0.8, 1.25);
        ok = true;
        for (var u = 0; u < used.length; u++)
          if (dist2(x, z, used[u][0], used[u][1]) < 190) { ok = false; break; }
      } while (!ok && ++tries < 24);
      used.push([x, z]);
      var t = this.makeTree(x, z, rand(0.85, 1.35));
      this.root.add(t); this.trees.push(t);
    }
    // a few loose outliers so the grove edge is soft
    for (var o = 0; o < 4; o++) {
      var ox = G.x + rand(-1, 1) * 74, oz = G.z + rand(-1, 1) * 66;
      var t2 = this.makeTree(ox, oz, rand(0.7, 1.0));
      this.root.add(t2); this.trees.push(t2);
    }
  },

  makeTree: function (x, z, s) {
    var g = new THREE.Group();
    var bark = new THREE.MeshLambertMaterial({ color: 0x6b4a30 });
    var leafA = new THREE.MeshLambertMaterial({ color: 0x3f8f34 });
    var leafB = new THREE.MeshLambertMaterial({ color: 0x54a83f });
    var leafC = new THREE.MeshLambertMaterial({ color: 0x6cbb4c });

    var th = rand(7, 10);
    var trunk = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.55, 1.05, th, 8), bark);
    trunk.position.y = th / 2; trunk.castShadow = SETTINGS.shadows; g.add(trunk);
    // a couple of real branches so the silhouette isn't a lollipop
    for (var b = 0; b < 3; b++) {
      var ba = rand(0, Math.PI * 2), bl = rand(2.4, 3.8);
      var br = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.18, 0.34, bl, 5), bark);
      br.position.set(Math.cos(ba) * bl * 0.35, th * rand(0.55, 0.8), Math.sin(ba) * bl * 0.35);
      br.rotation.z = Math.cos(ba) * -0.85; br.rotation.x = Math.sin(ba) * 0.85;
      g.add(br);
    }
    // canopy: overlapping blobs at varied heights => readable organic mass
    var blobs = [[0, th + 2.4, 0, 4.3, leafA],[2.5, th + 1.2, 1.0, 3.2, leafB],
                 [-2.3, th + 1.5, -1.4, 3.0, leafB],[0.9, th + 4.0, -1.6, 2.9, leafC],
                 [-1.4, th + 3.4, 1.9, 2.7, leafC],[0, th + 0.4, 2.6, 2.5, leafA]];
    blobs.forEach(function (b) {
      var m = new THREE.Mesh(new THREE.SphereBufferGeometry(b[3], 9, 7), b[4]);
      m.position.set(b[0], b[1], b[2]);
      m.scale.y = rand(0.78, 0.95);
      m.castShadow = SETTINGS.shadows;
      g.add(m);
    });
    g.position.set(x, 0, z);
    g.scale.setScalar(s);
    g.rotation.y = rand(0, Math.PI * 2);
    return g;
  },

  /* ------------------------------------------------- SCATTERED FARM PROPS -- */
  /* Art Bible §8/§17: props support use, rhythm and readability — clustered
     with intent around the hub, never sprinkled uniformly. */
  buildScatter: function (map) {
    var self = this;
    var wood = new THREE.MeshLambertMaterial({ color: 0x7d5a3c });
    var metal = new THREE.MeshLambertMaterial({ color: 0x9aa0a6 });
    var hay = new THREE.MeshLambertMaterial({ color: 0xd9b45c });

    function place(mesh, x, z, ry) {
      mesh.position.set(x, mesh.position.y, z);
      mesh.rotation.y = ry || rand(0, 6.28);
      self.root.add(mesh); self.props.push(mesh);
    }
    // water troughs + feeders near the barnyard
    for (var i = 0; i < 3; i++) {
      var tr = new THREE.Group();
      var box = new THREE.Mesh(new THREE.BoxBufferGeometry(4.2, 1.1, 1.7), wood);
      box.position.y = 0.55; tr.add(box);
      var wsurf = new THREE.Mesh(new THREE.BoxBufferGeometry(3.9, 0.08, 1.45),
        new THREE.MeshPhongMaterial({ color: 0x3f92b0, shininess: 90 }));
      wsurf.position.y = 1.0; tr.add(wsurf);
      place(tr, -150 + rand(-24, 30), -86 + rand(-22, 26));
    }
    // round hay bales out in the pasture
    for (var h = 0; h < 7; h++) {
      var bale = new THREE.Mesh(new THREE.CylinderBufferGeometry(2.1, 2.1, 2.6, 12), hay);
      bale.rotation.z = Math.PI / 2; bale.position.y = 2.1;
      bale.castShadow = SETTINGS.shadows;
      place(bale, rand(-70, 110), rand(-40, 80));
    }
    // barrels, crates, buckets clustered by the shed
    for (var b = 0; b < 9; b++) {
      var kind = Math.random();
      var pr;
      if (kind < 0.4) {
        pr = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.85, 0.85, 2.0, 10), metal);
        pr.position.y = 1.0;
      } else if (kind < 0.75) {
        pr = new THREE.Mesh(new THREE.BoxBufferGeometry(1.6, 1.3, 1.6), wood);
        pr.position.y = 0.65;
      } else {
        pr = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.5, 0.38, 0.8, 9),
          new THREE.MeshLambertMaterial({ color: 0x4a7fa8 }));
        pr.position.y = 0.4;
      }
      pr.castShadow = SETTINGS.shadows;
      place(pr, -145 + rand(-16, 18), -55 + rand(-14, 16));
    }
    // fence posts marking an old paddock — a landmark, not clutter
    var paddock = [[-60, 20],[-20, 12],[16, 22],[40, 52],[10, 78],[-34, 70]];
    for (var p = 0; p < paddock.length; p++) {
      var post = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.24, 0.3, 3.2, 6), wood);
      post.position.y = 1.6;
      place(post, paddock[p][0], paddock[p][1]);
      var nxt = paddock[(p + 1) % paddock.length];
      var dx = nxt[0] - paddock[p][0], dz = nxt[1] - paddock[p][1];
      var len = Math.sqrt(dx * dx + dz * dz);
      for (var lv = 0; lv < 2; lv++) {
        var rail = new THREE.Mesh(new THREE.BoxBufferGeometry(len, 0.2, 0.14), wood);
        rail.position.set(paddock[p][0] + dx / 2, 1.5 + lv * 0.9, paddock[p][1] + dz / 2);
        rail.rotation.y = -Math.atan2(dz, dx);
        self.root.add(rail);
      }
    }
    // scarecrow in the plowed field
    var sc = new THREE.Group();
    var pole = new THREE.Mesh(new THREE.CylinderBufferGeometry(0.14, 0.14, 6.0, 6), wood);
    pole.position.y = 3.0; sc.add(pole);
    var arms = new THREE.Mesh(new THREE.BoxBufferGeometry(4.6, 0.22, 0.22), wood);
    arms.position.y = 4.4; sc.add(arms);
    var shirt = new THREE.Mesh(new THREE.BoxBufferGeometry(1.9, 2.2, 0.7),
      new THREE.MeshLambertMaterial({ color: 0xc0453c }));
    shirt.position.y = 4.0; sc.add(shirt);
    var head = new THREE.Mesh(new THREE.SphereBufferGeometry(0.78, 9, 8), hay);
    head.position.y = 5.6; sc.add(head);
    var hat = new THREE.Mesh(new THREE.ConeBufferGeometry(1.35, 0.9, 10),
      new THREE.MeshLambertMaterial({ color: 0xb8985a }));
    hat.position.y = 6.2; sc.add(hat);
    place(sc, 96, -128, 0.4);
  },

  /* ---------------------------------------------------------- GRASS TUFTS -- */
  /* Instanced tufts with a vertex-shader wind bend. One draw call. */
  buildGrass: function (map) {
    if (!SETTINGS.particles || SETTINGS.quality === 'low') return;
    var count = SETTINGS.quality === 'high' ? TUNE.fx.grassCount : Math.floor(TUNE.fx.grassCount * 0.45);
    var half = map.size / 2 - 10;
    var g = new THREE.ConeBufferGeometry(0.42, 2.0, 3);
    g.translate(0, 1.0, 0);

    var mat = new THREE.MeshLambertMaterial({ color: 0x64b346 });
    var self = this;
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = { value: 0 };
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        ['#include <begin_vertex>',
         '#ifdef USE_INSTANCING',
         '  float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.09;',
         '  float sway = sin(uTime * 1.7 + ph) * 0.16 + sin(uTime * 3.1 + ph * 1.7) * 0.05;',
         '  transformed.x += sway * transformed.y;',
         '  transformed.z += sway * 0.6 * transformed.y;',
         '#endif'].join('\n'));
      self._grassShader = sh;
    };
    this._tuftMat = mat;

    var inst = new THREE.InstancedMesh(g, mat, count);
    var m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    var p = new THREE.Vector3(), s = new THREE.Vector3();
    var pondC = map.pond, plow = map.plowedField, n = 0;
    for (var i = 0; i < count; i++) {
      var x = rand(-half, half), z = rand(-half, half);
      // keep tufts out of the pond and off the plowed field
      if (dist2(x, z, pondC.x, pondC.z) < Math.pow(pondC.w * 0.62, 2)) continue;
      if (Math.abs(x - plow.x) < plow.w / 2 && Math.abs(z - plow.z) < plow.d / 2) continue;
      e.set(0, rand(0, 6.28), rand(-0.13, 0.13)); q.setFromEuler(e);
      p.set(x, 0, z);
      var sc = rand(0.55, 1.5);
      s.set(sc, sc * rand(0.7, 1.5), sc);
      m.compose(p, q, s);
      inst.setMatrixAt(n++, m);
    }
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
    this.grass = inst;
    this.root.add(inst);
  },

  /* ------------------------------------------- COUNTRYSIDE BEYOND THE FENCE -- */
  /* Spec §1: the map must not feel like it just stops at the fence. */
  buildOutside: function (map) {
    var half = map.size / 2;
    var ring = new THREE.Mesh(new THREE.RingBufferGeometry(half, half + 420, 40, 1),
      new THREE.MeshLambertMaterial({ color: 0x5f9c48 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -0.4;
    this.root.add(ring);

    // distant tree line — cheap billboarded cones, no shadows
    var treeMat = new THREE.MeshLambertMaterial({ color: 0x33702f });
    var tg = new THREE.ConeBufferGeometry(7, 18, 6);
    var count = 190;
    var inst = new THREE.InstancedMesh(tg, treeMat, count);
    var m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (var i = 0; i < count; i++) {
      var a = (i / count) * Math.PI * 2 + rand(-0.02, 0.02);
      var r = half + rand(28, 180);
      p.set(Math.cos(a) * r, 8, Math.sin(a) * r);
      var sc = rand(0.7, 1.7);
      s.set(sc, sc * rand(0.8, 1.6), sc);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    this.root.add(inst);

    // a couple of neighbouring silos far off for depth
    for (var k = 0; k < 3; k++) {
      var ang = rand(0, 6.28), rr = half + rand(120, 220);
      var silo = new THREE.Mesh(new THREE.CylinderBufferGeometry(6, 6, 34, 10),
        new THREE.MeshLambertMaterial({ color: 0xcfd3d6 }));
      silo.position.set(Math.cos(ang) * rr, 17, Math.sin(ang) * rr);
      this.root.add(silo);
      var dome = new THREE.Mesh(new THREE.SphereBufferGeometry(6, 10, 6, 0, 6.28, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }));
      dome.position.set(Math.cos(ang) * rr, 34, Math.sin(ang) * rr);
      this.root.add(dome);
    }
  },

  /* ---------------------------------------------------------------- TICK -- */
  update: function (dt, t) {
    if (this.windmillBlades) this.windmillBlades.rotation.z += dt * 0.85;
    if (this._grassShader) this._grassShader.uniforms.uTime.value = t;
    if (this.sheens) {
      this.sheens[0].rotation.z = t * 0.05;
      this.sheens[1].rotation.z = -t * 0.037;
    }
  },

  /* Ground height sampler matching the terrain displacement above. */
  groundY: function (x, z) {
    return Math.sin(x * 0.021) * Math.cos(z * 0.017) * 1.15
         + Math.sin(x * 0.058 + z * 0.041) * 0.42;
  }
};
