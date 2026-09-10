/*
 * Block Stack 3D - rendering layer (three.js).
 *
 * Owns the scene, camera framing, the rounded-box geometry generator and every
 * visual effect. Knows nothing about rules or scoring: game.js drives it.
 */
(function (global) {
  'use strict';

  var THREE = global.THREE;
  var L = global.StackLogic;

  /* ================================================================== *
   * Rounded box geometry
   *
   * Built explicitly from 6 flat faces + 12 quarter-cylinder edges +
   * 8 spherical-octant corners, so the result is a genuine solid block with
   * crisp faces and a small rounded bevel - never a flat sheet, and never a
   * blobby sphere. Normals are exact, which is what gives the clean edge
   * highlights.
   * ================================================================== */

  function roundedBoxGeometry(width, height, depth, radius, seg) {
    seg = Math.max(1, seg | 0);
    var a = width / 2, b = height / 2, c = depth / 2;
    var r = Math.min(radius, a * 0.95, b * 0.95, c * 0.95);
    var A = Math.max(0, a - r), B = Math.max(0, b - r), C = Math.max(0, c - r);
    var core = [A, B, C];

    var pos = [], nrm = [];

    /* Pushes one triangle, auto-correcting winding from the vertex normals so
     * no piece of the construction can end up inside-out. */
    function tri(p0, p1, p2, n0, n1, n2) {
      var ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
      var vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
      var cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      var len = Math.sqrt(cx * cx + cy * cy + cz * cz);
      if (len < 1e-12) return;                       // degenerate (pole) triangle
      var dot = (cx * n0[0] + cy * n0[1] + cz * n0[2]) / len;
      if (dot < 0) { var t = p1; p1 = p2; p2 = t; var tn = n1; n1 = n2; n2 = tn; }
      pos.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
      nrm.push(n0[0], n0[1], n0[2], n1[0], n1[1], n1[2], n2[0], n2[1], n2[2]);
    }

    function quad(p0, p1, p2, p3, n0, n1, n2, n3) {
      tri(p0, p1, p2, n0, n1, n2);
      tri(p0, p2, p3, n0, n2, n3);
    }

    /* --- 6 flat faces ------------------------------------------------ */
    for (var axis = 0; axis < 3; axis++) {
      var v = (axis + 1) % 3, w = (axis + 2) % 3;
      var half = [a, b, c][axis];
      for (var s = -1; s <= 1; s += 2) {
        var n = [0, 0, 0]; n[axis] = s;
        var mk = function (sv, sw) {
          var p = [0, 0, 0];
          p[axis] = s * half; p[v] = sv * core[v]; p[w] = sw * core[w];
          return p;
        };
        quad(mk(-1, -1), mk(1, -1), mk(1, 1), mk(-1, 1), n, n, n, n);
      }
    }

    /* --- 12 quarter-cylinder edges ------------------------------------ */
    if (r > 1e-6) {
      for (var ax = 0; ax < 3; ax++) {           // edge runs along `ax`
        var e1 = (ax + 1) % 3, e2 = (ax + 2) % 3;
        for (var s1 = -1; s1 <= 1; s1 += 2) {
          for (var s2 = -1; s2 <= 1; s2 += 2) {
            for (var k = 0; k < seg; k++) {
              var t0 = (k / seg) * Math.PI / 2, t1 = ((k + 1) / seg) * Math.PI / 2;
              var ring = function (t) {
                var nn = [0, 0, 0];
                nn[e1] = s1 * Math.cos(t); nn[e2] = s2 * Math.sin(t);
                return nn;
              };
              var n0 = ring(t0), n1 = ring(t1);
              var pt = function (nn, along) {
                var p = [0, 0, 0];
                p[ax] = along * core[ax];
                p[e1] = s1 * core[e1] + r * nn[e1];
                p[e2] = s2 * core[e2] + r * nn[e2];
                return p;
              };
              quad(pt(n0, -1), pt(n0, 1), pt(n1, 1), pt(n1, -1), n0, n0, n1, n1);
            }
          }
        }
      }

      /* --- 8 spherical-octant corners --------------------------------- */
      for (var sx = -1; sx <= 1; sx += 2) {
        for (var sy = -1; sy <= 1; sy += 2) {
          for (var sz = -1; sz <= 1; sz += 2) {
            for (var i = 0; i < seg; i++) {
              for (var j = 0; j < seg; j++) {
                var th0 = (i / seg) * Math.PI / 2, th1 = ((i + 1) / seg) * Math.PI / 2;
                var ph0 = (j / seg) * Math.PI / 2, ph1 = ((j + 1) / seg) * Math.PI / 2;
                var dir = function (th, ph) {
                  return [sx * Math.sin(th) * Math.cos(ph), sy * Math.cos(th), sz * Math.sin(th) * Math.sin(ph)];
                };
                var pnt = function (d) {
                  return [sx * A + r * d[0], sy * B + r * d[1], sz * C + r * d[2]];
                };
                var d00 = dir(th0, ph0), d10 = dir(th1, ph0), d11 = dir(th1, ph1), d01 = dir(th0, ph1);
                quad(pnt(d00), pnt(d10), pnt(d11), pnt(d01), d00, d10, d11, d01);
              }
            }
          }
        }
      }
    }

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  /**
   * A cloud built from several overlapping flattened spheres, merged into one
   * geometry (one draw call). Deliberately NOT box-shaped: a rounded box in the
   * sky reads as a game block, which is exactly the confusion to avoid.
   */
  function puffCloudGeometry(rand, scale) {
    var puffs = 4 + Math.floor(rand() * 2);
    var pos = [], nrm = [];
    var spread = 0;
    for (var i = 0; i < puffs; i++) {
      var r = (0.75 + rand() * 0.75) * scale;
      var g = new THREE.SphereGeometry(r, 9, 7).toNonIndexed();
      var pa = g.attributes.position.array, na = g.attributes.normal.array;
      var ox = spread, oy = (rand() - 0.5) * 0.45 * scale, oz = (rand() - 0.5) * 0.7 * scale;
      spread += r * (0.85 + rand() * 0.3);
      for (var v = 0; v < pa.length; v += 3) {
        pos.push(pa[v] + ox, pa[v + 1] * 0.62 + oy, pa[v + 2] + oz);
        nrm.push(na[v], na[v + 1], na[v + 2]);
      }
      g.dispose();
    }
    var half = spread / 2;
    for (var k = 0; k < pos.length; k += 3) pos[k] -= half;
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    out.computeBoundingSphere();
    return out;
  }

  /* ================================================================== *
   * Canvas-generated textures (radial shadow / glow)
   * ================================================================== */

  function radialTexture(stops) {
    var size = 128;
    var cv = document.createElement('canvas');
    cv.width = cv.height = size;
    var ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    var tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function ringTexture() {
    var size = 256;
    var cv = document.createElement('canvas');
    cv.width = cv.height = size;
    var ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(size / 2, size / 2, size * 0.30, size / 2, size / 2, size * 0.5);
    g.addColorStop(0.0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.95)');
    g.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    var tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ================================================================== *
   * Renderer
   * ================================================================== */

  function createRenderer(canvas, opts) {
    opts = opts || {};

    var renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;

    var quality = opts.quality || 'high';
    var shadowsOn = quality !== 'low';
    renderer.shadowMap.enabled = shadowsOn;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(52, 1, 0.5, 400);

    /* ---- lights ---------------------------------------------------- */
    var hemi = new THREE.HemisphereLight('#ffffff', '#6b7a5a', 0.34);
    scene.add(hemi);

    var key = new THREE.DirectionalLight('#ffffff', 1.35);
    key.castShadow = shadowsOn;
    if (shadowsOn) {
      key.shadow.mapSize.set(quality === 'high' ? 1024 : 512, quality === 'high' ? 1024 : 512);
      key.shadow.camera.left = -11; key.shadow.camera.right = 11;
      key.shadow.camera.top = 11; key.shadow.camera.bottom = -11;
      key.shadow.camera.near = 0.5; key.shadow.camera.far = 46;
      key.shadow.bias = -0.0015;
      key.shadow.normalBias = 0.03;
      key.shadow.radius = 2.2;
    }
    scene.add(key);
    var keyTarget = new THREE.Object3D();
    scene.add(keyTarget);
    key.target = keyTarget;

    var rim = new THREE.DirectionalLight('#ffffff', 0.34);
    scene.add(rim);

    var fill = new THREE.DirectionalLight('#ffffff', 0.20);
    scene.add(fill);

    var ambient = new THREE.AmbientLight('#ffffff', 0.07);
    scene.add(ambient);

    /* ---- containers ------------------------------------------------ */
    var towerGroup = new THREE.Group();  scene.add(towerGroup);
    var fxGroup    = new THREE.Group();  scene.add(fxGroup);
    var decorGroup = new THREE.Group();  scene.add(decorGroup);

    /* ---- shared resources ------------------------------------------ */
    var shadowTex = radialTexture([[0, 'rgba(0,0,0,1)'], [0.45, 'rgba(0,0,0,0.72)'], [1, 'rgba(0,0,0,0)']]);
    var glowTex   = radialTexture([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
    var ringTex   = ringTexture();
    var dotTex    = radialTexture([[0, 'rgba(255,255,255,1)'], [0.42, 'rgba(255,255,255,0.98)'],
                                   [0.72, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);

    /*
     * Geometry and material caches.
     *
     * Nothing is evicted while a level is running: an LRU would eventually
     * dispose a geometry that a live mesh still points at, which breaks that
     * mesh. Both caches are emptied in reset() instead, at which point every
     * mesh that could reference them has already been removed from the scene.
     */
    var geoCache = {}, matCache = {};

    function getGeometry(w, h, d) {
      var kx = Math.round(w * 100) / 100, ky = Math.round(h * 100) / 100, kz = Math.round(d * 100) / 100;
      var k = kx + '|' + ky + '|' + kz;
      if (!geoCache[k]) {
        var rad = Math.min(L.EDGE_RADIUS, kx * 0.32, ky * 0.34, kz * 0.32);
        geoCache[k] = roundedBoxGeometry(kx, ky, kz, rad, quality === 'low' ? 2 : 3);
      }
      return geoCache[k];
    }

    function disposeCaches() {
      for (var g in geoCache) geoCache[g].dispose();
      geoCache = {};
      for (var m in matCache) matCache[m].dispose();
      matCache = {};
    }

    function getMaterial(hex) {
      if (!matCache[hex]) {
        matCache[hex] = new THREE.MeshStandardMaterial({
          color: new THREE.Color(hex),
          roughness: 0.52,
          metalness: 0.0,
          envMapIntensity: 0.22
        });
      }
      return matCache[hex];
    }

    /* ---- environment map for plastic-toy specular ------------------- */
    var envRT = null;
    function buildEnvironment(theme) {
      try {
        var cv = document.createElement('canvas');
        cv.width = 64; cv.height = 32;
        var ctx = cv.getContext('2d');
        var g = ctx.createLinearGradient(0, 0, 0, 32);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.45, theme.skyTop);
        g.addColorStop(0.62, theme.skyBottom);
        g.addColorStop(1, theme.ground);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 32);
        var tex = new THREE.CanvasTexture(cv);
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        var pmrem = new THREE.PMREMGenerator(renderer);
        var rt = pmrem.fromEquirectangular(tex);
        if (envRT) envRT.dispose();
        envRT = rt;
        scene.environment = rt.texture;
        pmrem.dispose();
        tex.dispose();
      } catch (e) {
        scene.environment = null;
      }
    }

    /* ================================================================ *
     * Theme
     * ================================================================ */

    var theme = null;

    function setTheme(t) {
      theme = t;
      var top = new THREE.Color(t.skyTop), bottom = new THREE.Color(t.skyBottom);
      scene.background = bottom.clone().lerp(top, 0.45);
      scene.fog = new THREE.Fog(t.fog, camDist + 16, camDist + 96);
      hemi.color.set(t.skyTop);
      hemi.groundColor.set(t.ground);
      key.color.set(t.lightKey);
      rim.color.set(t.lightRim);
      fill.color.set(t.skyBottom);
      buildEnvironment(t);
      buildBackdrop(t);
      buildDecor(t);
      if (canvas.parentElement) {
        canvas.parentElement.style.background =
          'linear-gradient(180deg,' + t.skyTop + ' 0%,' + t.skyBottom + ' 100%)';
      }
    }

    /* ---- sky backdrop: a large gradient plane behind everything ------ */
    var backdrop = null;
    function buildBackdrop(t) {
      if (backdrop) {
        backdrop.material.map.dispose();
        backdrop.material.dispose();
        backdrop.geometry.dispose();
        scene.remove(backdrop);
        backdrop = null;
      }
      var cv = document.createElement('canvas');
      cv.width = 8; cv.height = 256;
      var ctx = cv.getContext('2d');
      var g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, t.skyTop);
      g.addColorStop(0.78, t.skyBottom);
      g.addColorStop(1, L.mixHex(t.skyBottom, t.ground, 0.28));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 8, 256);
      var tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      var mat = new THREE.MeshBasicMaterial({ map: tex, depthWrite: false, fog: false });
      backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      backdrop.renderOrder = -10;
      backdrop.frustumCulled = false;
      scene.add(backdrop);
    }

    /* ---- world decor: clouds / peaks / stars ------------------------ */
    function clearGroup(group) {
      for (var i = group.children.length - 1; i >= 0; i--) {
        var c = group.children[i];
        group.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (c.material.map) c.material.map.dispose();
          c.material.dispose();
        }
      }
    }

    var decorItems = [];
    function buildDecor(t) {
      clearGroup(decorGroup);
      decorItems = [];
      var n = t.decorCount;
      var rand = mulberry(t.level * 7919 + t.world * 13);

      if (t.decor === 'stars') {
        var starGeo = new THREE.BufferGeometry();
        var verts = [];
        for (var i = 0; i < 340; i++) {
          var ang = rand() * Math.PI * 2;
          var rad = 34 + rand() * 40;
          verts.push(Math.cos(ang) * rad, (rand() - 0.5) * 130, Math.sin(ang) * rad);
        }
        starGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        var starMat = new THREE.PointsMaterial({
          color: new THREE.Color(L.mixHex('#ffffff', t.accent, 0.22)),
          map: dotTex, alphaMap: dotTex, size: 1.5, sizeAttenuation: true,
          transparent: true, opacity: 0.95, depthWrite: false, fog: false
        });
        var pts = new THREE.Points(starGeo, starMat);
        pts.frustumCulled = false;
        decorGroup.add(pts);
        decorItems.push({ mesh: pts, kind: 'stars' });
      } else if (t.decor === 'peaks') {
        for (var p = 0; p < 7; p++) {
          var h = 14 + rand() * 20;
          var geo = new THREE.ConeGeometry(11 + rand() * 9, h, 6);
          var col = L.mixHex(t.ground, t.skyBottom, 0.14 + rand() * 0.20);
          var mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(col), roughness: 0.95, flatShading: true, fog: true });
          var m = new THREE.Mesh(geo, mat);
          var a2 = rand() * Math.PI * 2, r2 = 33 + rand() * 16;
          m.position.set(Math.cos(a2) * r2, -20 + h / 2, Math.sin(a2) * r2);
          m.rotation.y = rand() * Math.PI;
          decorGroup.add(m);
          decorItems.push({ mesh: m, kind: 'peak', baseY: m.position.y });
        }
      }

      if (t.decor === 'clouds' || t.decor === 'peaks') {
        for (var c = 0; c < n; c++) {
          var cg = puffCloudGeometry(rand, 2.0 + rand() * 1.6);
          var cm = new THREE.MeshStandardMaterial({
            color: new THREE.Color(L.mixHex('#ffffff', t.skyBottom, 0.16)),
            roughness: 1.0, metalness: 0, transparent: true, opacity: 0.80,
            fog: true, envMapIntensity: 0
          });
          var cl = new THREE.Mesh(cg, cm);
          cl.rotation.y = rand() * Math.PI * 2;
          var ca = rand() * Math.PI * 2, cr = 40 + rand() * 36;
          cl.position.set(Math.cos(ca) * cr, -14 + rand() * 110, Math.sin(ca) * cr);
          decorGroup.add(cl);
          decorItems.push({ mesh: cl, kind: 'cloud', drift: 0.25 + rand() * 0.5, angle: ca, radius: cr });
        }
      }
    }

    function mulberry(seed) {
      var a = seed >>> 0;
      return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    /* ================================================================ *
     * Tower blocks
     * ================================================================ */

    var spin = 0;             // idle rotation, menu only
    var blocks = [];          // {mesh, y}
    var anims = [];           // squash animations
    var debris = [];          // sliced pieces
    var effects = [];         // rings / sparks

    function makeBlockMesh(spec) {
      var mesh = new THREE.Mesh(getGeometry(spec.sx, L.BLOCK_HEIGHT, spec.sz), getMaterial(spec.color));
      mesh.position.set(spec.x, spec.y, spec.z);
      mesh.castShadow = shadowsOn;
      mesh.receiveShadow = shadowsOn;
      return mesh;
    }

    function addBlock(spec) {
      var mesh = makeBlockMesh(spec);
      towerGroup.add(mesh);
      var rec = { mesh: mesh, y: spec.y };
      blocks.push(rec);
      if (spec.squash) {
        anims.push({ mesh: mesh, kind: 'squash', t: 0, dur: 0.26 });
      }
      // keep the scene light: only the top blocks cast shadows
      for (var i = 0; i < blocks.length; i++) {
        blocks[i].mesh.castShadow = shadowsOn && (i >= blocks.length - 7);
      }
      // cull blocks far below the top
      while (blocks.length > 26) {
        var old = blocks.shift();
        towerGroup.remove(old.mesh);
      }
      return rec;
    }

    /* ---- the moving block + its shadow & glow ----------------------- */
    var moving = null;

    function setMoving(spec) {
      clearMoving();
      var mesh = makeBlockMesh(spec);
      mesh.castShadow = shadowsOn;
      towerGroup.add(mesh);

      var shTex = shadowTex.clone();
      shTex.needsUpdate = true;
      shTex.wrapS = shTex.wrapT = THREE.ClampToEdgeWrapping;
      var sh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: shTex, transparent: true, depthWrite: false,
          opacity: 0.55, color: new THREE.Color('#000000'), fog: false
        })
      );
      sh.rotation.x = -Math.PI / 2;
      sh.renderOrder = 2;
      towerGroup.add(sh);

      var glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: new THREE.Color(L.mixHex(spec.color, '#ffffff', 0.45)),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.22, fog: false
      }));
      glow.renderOrder = 1;
      towerGroup.add(glow);

      moving = {
        mesh: mesh, shadow: sh, glow: glow,
        baseY: spec.y, sx: spec.sx, sz: spec.sz,
        anchorY: spec.anchorY == null ? spec.y - L.BLOCK_HEIGHT : spec.anchorY,
        anchorX: spec.anchorX == null ? spec.x : spec.anchorX,
        anchorZ: spec.anchorZ == null ? spec.z : spec.anchorZ,
        anchorSx: spec.anchorSx == null ? spec.sx : spec.anchorSx,
        anchorSz: spec.anchorSz == null ? spec.sz : spec.anchorSz,
        color: spec.color, t: 0
      };
      layoutMoving(spec.x, spec.z);
      return moving;
    }

    function layoutMoving(x, z) {
      if (!moving) return;
      var bob = Math.sin(moving.t * 3.1) * 0.055;
      moving.mesh.position.set(x, moving.baseY + bob, z);

      /*
       * Underside shadow.
       *
       * The quad is the footprint of the block BELOW, never the shadow's own
       * size - a quad bigger than the surface it falls on hangs in mid-air and
       * reads as a smudge. The blob is placed inside that quad by offsetting the
       * texture, so it is clipped by the block's edges exactly as a real shadow
       * would be: it slides off the side as the player slides off the tower,
       * which is the clearest aiming cue in the game.
       */
      var drop = Math.max(0.4, moving.baseY - moving.anchorY);
      var spread = 0.85 + Math.min(0.35, drop * 0.05);      // higher block, wider blur
      var shW = moving.sx * spread, shD = moving.sz * spread;
      var aW = moving.anchorSx, aD = moving.anchorSz;

      moving.shadow.position.set(moving.anchorX, moving.anchorY + L.BLOCK_HEIGHT / 2 + 0.012, moving.anchorZ);
      moving.shadow.scale.set(aW, aD, 1);

      var map = moving.shadow.material.map;
      map.repeat.set(aW / shW, aD / shD);
      map.offset.set(
        (moving.anchorX - aW / 2 - x + shW / 2) / shW,
        // the plane is rotated -90deg about X, so its V axis runs against world Z
        (z + shD / 2 - (moving.anchorZ + aD / 2)) / shD
      );
      moving.shadow.material.opacity = 0.60 - Math.min(0.16, drop * 0.026);

      // pushed away from the camera so the block itself occludes the middle of
      // the glow: what is left is a soft halo around a solid block
      var back = camDir.clone().multiplyScalar(-1.1);
      moving.glow.position.set(x + back.x, moving.baseY + bob + back.y, z + back.z);
      var gs = Math.max(moving.sx, moving.sz) * 1.55;
      var pulse = 1 + Math.sin(moving.t * 2.4) * 0.045;
      moving.glow.scale.set(gs * pulse, gs * pulse * 0.8, 1);
      moving.glow.material.opacity = 0.20 + Math.sin(moving.t * 2.4) * 0.04;
    }

    function moveMoving(x, z, dt) {
      if (!moving) return;
      moving.t += dt;
      layoutMoving(x, z);
    }

    function clearMoving() {
      if (!moving) return;
      towerGroup.remove(moving.mesh);
      towerGroup.remove(moving.shadow);
      moving.shadow.geometry.dispose();
      if (moving.shadow.material.map) moving.shadow.material.map.dispose();
      moving.shadow.material.dispose();
      towerGroup.remove(moving.glow);
      moving.glow.material.dispose();
      moving = null;
    }

    /**
     * Convert the moving block into a landed block. The block falls from
     * wherever it was hovering down to the tower, then squashes on impact.
     * `spec.onLand` fires at the moment of impact, so slices and effects happen
     * when the block actually arrives rather than the instant it is dropped.
     */
    function landMoving(spec) {
      var fromY = moving ? moving.mesh.position.y : spec.y;
      clearMoving();
      var rec = addBlock({ x: spec.x, z: spec.z, y: spec.y, sx: spec.sx, sz: spec.sz,
                           color: spec.color });
      var drop = Math.max(0, fromY - spec.y);
      if (drop < 0.05) {
        if (spec.onLand) spec.onLand();
        anims.push({ mesh: rec.mesh, kind: 'squash', t: 0, dur: 0.26 });
        return rec;
      }
      rec.mesh.position.y = fromY;
      anims.push({
        mesh: rec.mesh, kind: 'fall', t: 0,
        // time for a real fall of this height, kept snappy
        dur: Math.min(0.28, Math.max(0.09, Math.sqrt(2 * drop / 190))),
        fromY: fromY, toY: spec.y, onDone: spec.onLand
      });
      return rec;
    }

    /**
     * Swap the top block for a differently sized one - used by the perfect-streak
     * recovery so the refunded footprint is what the next block lands on.
     */
    function replaceTopBlock(spec) {
      if (!blocks.length) return null;
      var old = blocks.pop();
      towerGroup.remove(old.mesh);
      // if the block being replaced is still in the air, hand the fall over to
      // its replacement instead of snapping it to the ground
      var inFlight = null;
      for (var i = anims.length - 1; i >= 0; i--) {
        if (anims[i].mesh === old.mesh) {
          if (anims[i].kind === 'fall') inFlight = anims[i];
          anims.splice(i, 1);
        }
      }
      var rec = addBlock({ x: spec.x, z: spec.z, y: spec.y, sx: spec.sx, sz: spec.sz,
                           color: spec.color, squash: !inFlight });
      if (inFlight) {
        rec.mesh.position.y = old.mesh.position.y;
        inFlight.mesh = rec.mesh;
        inFlight.fromY = old.mesh.position.y;
        inFlight.dur = Math.max(0.04, inFlight.dur - inFlight.t);
        inFlight.t = 0;
        anims.push(inFlight);
      }
      return rec;
    }

    /* ---- sliced-off debris ------------------------------------------ */
    function spawnSlice(spec) {
      var mesh = new THREE.Mesh(getGeometry(spec.sx, L.BLOCK_HEIGHT, spec.sz), getMaterial(spec.color).clone());
      mesh.material.transparent = true;
      mesh.position.set(spec.x, spec.y, spec.z);
      mesh.castShadow = false;
      fxGroup.add(mesh);
      var away = spec.dir || [1, 0, 0];
      debris.push({
        mesh: mesh, life: 0,
        vel: new THREE.Vector3(away[0] * (2.0 + Math.random()), 1.4 + Math.random() * 0.7, away[2] * (2.0 + Math.random())),
        spin: new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 5)
      });
    }

    /* ---- perfect / recovery effects --------------------------------- */
    function ring(x, y, z, color, size, dur, thick) {
      var mat = new THREE.MeshBasicMaterial({
        map: ringTex, color: new THREE.Color(color), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide
      });
      var m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      m.scale.set(size, size, 1);
      m.renderOrder = 3;
      fxGroup.add(m);
      effects.push({ mesh: m, life: 0, dur: dur || 0.5, from: size, to: size * (thick || 1.8),
                     peak: 0.55, kind: 'ring' });
    }

    function sparks(x, y, z, color, count, power) {
      // hard cap: a burst of drops must never pile up unbounded draw calls
      count = Math.max(0, Math.min(count, 140 - effects.length));
      for (var i = 0; i < count; i++) {
        var s = 0.17;      // one fixed size keeps the geometry cache clean
        var mesh = new THREE.Mesh(getGeometry(s, s, s), getMaterial(color).clone());
        mesh.material.transparent = true;
        mesh.position.set(x + (Math.random() - 0.5) * 1.4, y, z + (Math.random() - 0.5) * 1.4);
        mesh.scale.setScalar(0.75 + Math.random() * 0.6);
        fxGroup.add(mesh);
        effects.push({
          mesh: mesh, life: 0, dur: 0.6, kind: 'spark',
          vel: new THREE.Vector3((Math.random() - 0.5) * 2.4, (2.4 + Math.random() * 2.2) * (power || 1), (Math.random() - 0.5) * 2.4)
        });
      }
    }

    function perfectFx(x, y, z, color) {
      // lifted clear of the block: flat on the top face it reads as a stain
      ring(x, y + 1.5, z, L.mixHex(color, '#ffffff', 0.6), 2.4, 0.45, 1.8);
      sparks(x, y + 0.85, z, L.mixHex(color, '#ffffff', 0.35), 6, 1);
    }

    function recoveryFx(x, y, z, color) {
      ring(x, y + 1.6, z, color, 2.6, 0.75, 2.4);
      ring(x, y + 1.9, z, '#ffffff', 2.0, 0.55, 2.1);
      sparks(x, y + 0.85, z, color, 12, 1.5);
    }

    /* ================================================================ *
     * Camera framing
     * ================================================================ */

    var camDir = new THREE.Vector3(0.72, 0.50, 0.72).normalize();
    var camTarget = new THREE.Vector3(0, 0, 0);
    var camDesired = new THREE.Vector3(0, 0, 0);
    var camDist = 26;
    var fitTravel = 6.4, fitLateral = 3.6, fitUp = 2.6, fitDown = 2.6;

    /**
     * Play-area extents relative to the camera target: `travel` along the active
     * axis, `lateral` across it, and how far the framing must reach above and
     * below (the sliding block hovers well clear of the tower).
     */
    function setFitBounds(travel, lateral, up, down) {
      fitTravel = travel; fitLateral = lateral;
      if (up != null) fitUp = up;
      if (down != null) fitDown = down;
      fitCamera();
    }

    /**
     * Binary-search the smallest camera distance that keeps the whole play area
     * on screen. Runs on resize / level start, so any aspect ratio - a tall
     * iPhone or a wide desktop - is framed correctly instead of clipped.
     */
    function fitCamera() {
      var probe = new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far);
      var pts = [];
      // the sliding block sweeps ±fitTravel on one axis and ±fitLateral on the
      // other, and the axis alternates - so test both orientations.
      var boxes = [[fitTravel, fitLateral], [fitLateral, fitTravel]];
      for (var b = 0; b < boxes.length; b++) {
        for (var sx = -1; sx <= 1; sx += 2) {
          for (var sz = -1; sz <= 1; sz += 2) {
            for (var sy = 0; sy <= 1; sy++) {
              pts.push(new THREE.Vector3(sx * boxes[b][0], sy ? fitUp : -fitDown, sz * boxes[b][1]));
            }
          }
        }
      }
      var lo = 12, hi = 90, best = hi;
      for (var it = 0; it < 22; it++) {
        var mid = (lo + hi) / 2;
        probe.position.copy(camDir).multiplyScalar(mid);
        probe.lookAt(0, 0, 0);
        probe.updateMatrixWorld();
        probe.updateProjectionMatrix();
        var ok = true;
        for (var i = 0; i < pts.length; i++) {
          var v = pts[i].clone().project(probe);
          if (Math.abs(v.x) > 0.965 || Math.abs(v.y) > 0.965) { ok = false; break; }
        }
        if (ok) { best = mid; hi = mid; } else { lo = mid; }
      }
      camDist = best;
      if (scene.fog) { scene.fog.near = camDist + 16; scene.fog.far = camDist + 96; }
    }

    function focusOn(x, y, z, instant) {
      camDesired.set(x, y, z);
      if (instant) camTarget.copy(camDesired);
    }

    function updateCamera(dt) {
      var k = Math.min(1, dt * 5.5);   // tight enough to keep up with fast climbs
      camTarget.y += (camDesired.y - camTarget.y) * k;
      camTarget.x += (camDesired.x - camTarget.x) * Math.min(1, dt * 1.6);
      camTarget.z += (camDesired.z - camTarget.z) * Math.min(1, dt * 1.6);
      camera.position.copy(camDir).multiplyScalar(camDist).add(camTarget);
      camera.lookAt(camTarget);

      // key light + shadow frustum follow the top of the tower
      keyTarget.position.set(camTarget.x, camTarget.y + 1.5, camTarget.z);
      keyTarget.updateMatrixWorld();
      key.position.set(camTarget.x + 9.5, camTarget.y + 17, camTarget.z + 6.5);
      rim.position.set(camTarget.x - 11, camTarget.y + 6, camTarget.z - 9);
      fill.position.set(camTarget.x - 6, camTarget.y + 4, camTarget.z + 12);

      if (backdrop) {
        var d = 118;
        var fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        backdrop.position.copy(camera.position).add(fwd.multiplyScalar(d));
        backdrop.quaternion.copy(camera.quaternion);
        var vh = 2 * Math.tan((camera.fov * Math.PI / 180) / 2) * d;
        backdrop.scale.set(vh * camera.aspect * 1.25, vh * 1.25, 1);
      }
    }

    /* ================================================================ *
     * Per-frame update
     * ================================================================ */

    function update(dt) {
      // falling blocks, then squash / bounce on impact
      for (var i = anims.length - 1; i >= 0; i--) {
        var a = anims[i];
        a.t += dt;
        var p = Math.min(1, a.t / a.dur);

        if (a.kind === 'fall') {
          a.mesh.position.y = a.fromY + (a.toY - a.fromY) * p * p;   // accelerating
          if (p >= 1) {
            a.mesh.position.y = a.toY;
            anims.splice(i, 1);
            anims.push({ mesh: a.mesh, kind: 'squash', t: 0, dur: 0.26 });
            if (a.onDone) a.onDone();
          }
          continue;
        }

        // 1 -> 0.74 -> 1.07 -> 1
        var sy;
        if (p < 0.34)      sy = 1 - 0.26 * (p / 0.34);
        else if (p < 0.68) sy = 0.74 + 0.33 * ((p - 0.34) / 0.34);
        else               sy = 1.07 - 0.07 * ((p - 0.68) / 0.32);
        var sxz = 1 + (1 - sy) * 0.42;
        a.mesh.scale.set(sxz, sy, sxz);
        if (p >= 1) { a.mesh.scale.set(1, 1, 1); anims.splice(i, 1); }
      }

      // debris
      for (var d = debris.length - 1; d >= 0; d--) {
        var db = debris[d];
        db.life += dt;
        db.vel.y -= 26 * dt;
        db.mesh.position.addScaledVector(db.vel, dt);
        db.mesh.rotation.x += db.spin.x * dt;
        db.mesh.rotation.y += db.spin.y * dt;
        db.mesh.rotation.z += db.spin.z * dt;
        if (db.life > 0.45) db.mesh.material.opacity = Math.max(0, 1 - (db.life - 0.45) / 0.75);
        if (db.life > 1.5 || db.mesh.position.y < camTarget.y - 26) {
          fxGroup.remove(db.mesh);
          db.mesh.material.dispose();
          debris.splice(d, 1);
        }
      }

      // rings + sparks
      for (var e = effects.length - 1; e >= 0; e--) {
        var fx = effects[e];
        fx.life += dt;
        var t = Math.min(1, fx.life / fx.dur);
        if (fx.kind === 'ring') {
          var s = fx.from + (fx.to - fx.from) * (1 - Math.pow(1 - t, 2));
          fx.mesh.scale.set(s, s, 1);
          fx.mesh.material.opacity = (fx.peak || 0.6) * (1 - t) * (1 - t);
        } else {
          fx.vel.y -= 12 * dt;
          fx.mesh.position.addScaledVector(fx.vel, dt);
          fx.mesh.rotation.x += dt * 6;
          fx.mesh.rotation.y += dt * 5;
          fx.mesh.material.opacity = 1 - t;
        }
        if (t >= 1) {
          fxGroup.remove(fx.mesh);
          if (fx.mesh.geometry && fx.kind === 'ring') fx.mesh.geometry.dispose();
          fx.mesh.material.dispose();
          effects.splice(e, 1);
        }
      }

      // decor drift
      for (var k = 0; k < decorItems.length; k++) {
        var it = decorItems[k];
        if (it.kind === 'cloud') {
          it.angle += it.drift * dt * 0.06;
          it.mesh.position.x = camTarget.x + Math.cos(it.angle) * it.radius;
          it.mesh.position.z = camTarget.z + Math.sin(it.angle) * it.radius;
          // recycle clouds the player has climbed past, so the sky never runs out
          if (it.mesh.position.y < camTarget.y - 34) it.mesh.position.y += 150;
          else if (it.mesh.position.y > camTarget.y + 116) it.mesh.position.y -= 150;
        } else if (it.kind === 'stars') {
          it.mesh.rotation.y += dt * 0.012;
          it.mesh.position.set(camTarget.x, camTarget.y, camTarget.z);
        }
      }

      if (spin) towerGroup.rotation.y += spin * dt;

      updateCamera(dt);
    }

    function render() { renderer.render(scene, camera); }

    /**
     * Read the rendered colour at a world-space point. Used by the automated QA
     * suite to prove the moving block really has separately lit top / front /
     * side faces on screen (i.e. that it is a solid, not a flat sheet).
     */
    function sampleWorldPoint(x, y, z) {
      var v = new THREE.Vector3(x, y, z).project(camera);
      var W = renderer.domElement.width, H = renderer.domElement.height;
      var px = Math.round((v.x * 0.5 + 0.5) * W);
      var py = Math.round((v.y * 0.5 + 0.5) * H);
      if (px < 1 || py < 1 || px > W - 2 || py > H - 2) return null;
      renderer.render(scene, camera);
      var gl = renderer.getContext();
      var buf = new Uint8Array(4 * 9);
      gl.readPixels(px - 1, py - 1, 3, 3, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      var r = 0, g = 0, b = 0;
      for (var i = 0; i < 9; i++) { r += buf[i * 4]; g += buf[i * 4 + 1]; b += buf[i * 4 + 2]; }
      r /= 9; g /= 9; b /= 9;
      return { r: r, g: g, b: b, lum: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255,
               screenX: px, screenY: py };
    }

    /** Screen-space silhouette of the moving block, in device pixels. */
    function movingSilhouette() {
      if (!moving) return null;
      var p = moving.mesh.position;
      var hx = moving.sx / 2, hy = L.BLOCK_HEIGHT / 2, hz = moving.sz / 2;
      var W = renderer.domElement.width, H = renderer.domElement.height;
      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (var i = 0; i < 8; i++) {
        var v = new THREE.Vector3(
          p.x + (i & 1 ? hx : -hx), p.y + (i & 2 ? hy : -hy), p.z + (i & 4 ? hz : -hz)
        ).project(camera);
        var sx = (v.x * 0.5 + 0.5) * W, sy = (0.5 - v.y * 0.5) * H;
        minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
      }
      return { width: maxX - minX, height: maxY - minY, canvasW: W, canvasH: H };
    }

    function resize() {
      var parent = canvas.parentElement || document.body;
      var w = Math.max(1, parent.clientWidth || global.innerWidth);
      var h = Math.max(1, parent.clientHeight || global.innerHeight);
      renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      fitCamera();
    }

    function reset() {
      clearMoving();
      for (var i = blocks.length - 1; i >= 0; i--) towerGroup.remove(blocks[i].mesh);
      blocks = [];
      for (var d = debris.length - 1; d >= 0; d--) {
        fxGroup.remove(debris[d].mesh);
        debris[d].mesh.material.dispose();
      }
      debris = [];
      for (var e = effects.length - 1; e >= 0; e--) {
        fxGroup.remove(effects[e].mesh);
        if (effects[e].kind === 'ring') effects[e].mesh.geometry.dispose();
        effects[e].mesh.material.dispose();
      }
      effects = [];
      anims = [];
      camTarget.set(0, 0, 0);
      camDesired.set(0, 0, 0);
      towerGroup.rotation.y = 0;
      spin = 0;
      // every mesh that could reference the caches is gone by this point
      disposeCaches();
    }

    /** Topple the top of the tower - used on a failed run. */
    function collapse(count) {
      var top = blocks.slice(-(count || 4));
      for (var i = 0; i < top.length; i++) {
        var rec = top[i];
        towerGroup.remove(rec.mesh);
        fxGroup.add(rec.mesh);
        for (var a = anims.length - 1; a >= 0; a--) if (anims[a].mesh === rec.mesh) anims.splice(a, 1);
        rec.mesh.scale.set(1, 1, 1);
        rec.mesh.castShadow = false;
        rec.mesh.material = rec.mesh.material.clone();
        rec.mesh.material.transparent = true;
        debris.push({
          mesh: rec.mesh, life: 0,
          vel: new THREE.Vector3((Math.random() - 0.5) * 5, 0.6 + Math.random() * 1.4, (Math.random() - 0.5) * 5),
          spin: new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 5)
        });
        var idx = blocks.indexOf(rec);
        if (idx >= 0) blocks.splice(idx, 1);
      }
    }

    return {
      THREE: THREE,
      renderer: renderer, scene: scene, camera: camera,
      roundedBoxGeometry: roundedBoxGeometry,
      setTheme: setTheme, resize: resize, reset: reset, collapse: collapse,
      addBlock: addBlock, setMoving: setMoving, moveMoving: moveMoving,
      layoutMoving: layoutMoving, landMoving: landMoving, clearMoving: clearMoving,
      spawnSlice: spawnSlice, perfectFx: perfectFx, recoveryFx: recoveryFx,
      focusOn: focusOn, setFitBounds: setFitBounds, fitCamera: fitCamera,
      setSpin: function (r) { spin = r || 0; },
      replaceTopBlock: replaceTopBlock, update: update, render: render,
      sampleWorldPoint: sampleWorldPoint, movingSilhouette: movingSilhouette,
      /** y of the newest landed block - lets a test watch a drop fall */
      landedTopY: function () { return blocks.length ? blocks[blocks.length - 1].mesh.position.y : null; },
      get movingHandle() { return moving; },
      get blockCount() { return blocks.length; },
      get shadowsEnabled() { return shadowsOn; }
    };
  }

  global.StackRender = { create: createRenderer, roundedBoxGeometry: roundedBoxGeometry };

})(typeof self !== 'undefined' ? self : this);
