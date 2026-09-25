/* ============================================================
   STAGE — the performance engine for the dino crew.

   A scene plan (data, from 20-core.js) runs against a rAF clock. Every
   letter is always in exactly one visible state — idle, held, free,
   floating, flying, trailing, orbiting, riding, beaming, lined up,
   following or gone — and is never deleted to make it go away.

   Dinosaurs are drawn facing right; each has a `face` (+1 right, -1 left)
   the stage turns them toward as they move, with a quick turn rather than
   an instant flip. Rotation (`rot`) is in the dino's own frame — positive
   leans nose-down — so a lean mirrors correctly when he faces left.

   Cleanup is unconditional (teardown on end, Back, hidden tab or error),
   backed by two independent stall guards. Between scenes the same actors
   live on the planet surface as the crew (see AMBIENT).
   ============================================================ */
function createStage(deps){
  deps = deps || {};
  var C = deps.core;
  var SFX = deps.sfx || { play: function(){} };
  var ART = deps.art;
  var layer = null, actors = {}, live = null, inited = false;
  var on = deps.enabled !== false, timeScale = 1;
  var fxNodes = [], amb = null, ambRaf = null;

  var SIZE = 150, K = SIZE / 200, FEET = 0.95, GRAV = 0.0021;

  /* ---------- maths ---------- */
  function clamp(v, lo, hi){ return v < lo ? lo : (v > hi ? hi : v); }
  function clamp01(v){ return clamp(v, 0, 1); }
  function lerp(a, b, t){ return a + (b - a) * t; }
  function rnd(a, b){ return a + Math.random() * (b - a); }
  function easeOut(t){ return 1 - Math.pow(1 - t, 3); }
  function easeIn(t){ return t * t * t; }
  function easeInOut(t){ return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeBack(t){ var c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function linear(t){ return t; }
  var EASES = { out:easeOut, 'in':easeIn, inout:easeInOut, back:easeBack, linear:linear };
  function vw(){ return window.innerWidth; }
  function vh(){ return window.innerHeight; }

  /* ---------- setup ---------- */
  function init(el){
    layer = el || layer;
    if (!layer || inited) return;
    inited = true;
    C.CHAR_ORDER.forEach(function(key, i){
      var sh = document.createElement('div'); sh.className = 'shadow'; layer.appendChild(sh);
      var d = document.createElement('div');
      d.className = 'actor actor-' + key;
      d.setAttribute('data-key', key);
      d.innerHTML = ART[key]();
      d.style.setProperty('--blink-delay', (-(i * 1.3 + Math.random() * 2)).toFixed(2) + 's');
      d.style.setProperty('--blink-dur', (3.4 + i * 0.6 + Math.random()).toFixed(2) + 's');
      layer.appendChild(d);
      var a = {
        key: key, el: d, shadow: sh, kind: key,
        x: -600, y: -600, sc: 1, roll: 1, face: 1, faceCur: 1, rot: 0, op: 0, bob: 0,
        anim: null, phase: 0, effort: 0, fallen: 0, look: null, expr: null, exprUntil: 0,
        trick: null, jaw: 0, rig: collectRig(d), lastDx: 1, nextFx: 0
      };
      actors[key] = a;
      d.addEventListener('pointerdown', function(ev){ onActorTap(a, ev); });
      writeActor(a);
    });
  }
  function collectRig(root){
    var out = {};
    ['head', 'jaw', 'tail', 'arm', 'frill', 'scarf', 'jet', 'eyes', 'wing-n', 'wing-f', 'jetpack'].forEach(function(c){
      var el = root.querySelector('.' + c);
      if (el) out[c] = { el: el, px: Number(el.getAttribute('data-px')) || 100, py: Number(el.getAttribute('data-py')) || 100, base: el.getAttribute('transform') || '' };
    });
    ['leg-f', 'leg-b'].forEach(function(c){
      out[c] = Array.prototype.slice.call(root.querySelectorAll('.' + c)).map(function(el){
        return { el: el, px: Number(el.getAttribute('data-px')) || 100, py: Number(el.getAttribute('data-py')) || 140, base: '' };
      });
    });
    return out;
  }
  function rot(part, deg){
    if (!part) return;
    part.el.setAttribute('transform', (part.base ? part.base + ' ' : '') + 'rotate(' + deg.toFixed(1) + ' ' + part.px + ' ' + part.py + ')');
  }

  /* where a point of the drawing (svg units) is on screen, honouring facing and scale */
  function artPoint(a, sx, sy){
    var fx = a.sc * a.roll * a.faceCur, fy = a.sc;
    return { x: a.x + SIZE / 2 + (sx * K - SIZE / 2) * fx, y: a.y + a.bob + SIZE / 2 + (sy * K - SIZE / 2) * fy };
  }
  function centreOf(a){ return artPoint(a, 100, 110); }
  function standY(ground){ return ground - SIZE * FEET; }
  function hoverY(ground, kind){ return kind === 'swoop' ? standY(ground) - 70 : standY(ground); }

  /* ---------- expressions ---------- */
  var EXPRS = ['happy', 'wow', 'oops', 'roar'];
  function setExpr(a, ex, ms, t){
    if (!a) return;
    var now = t == null ? performance.now() : t;
    a.expr = ex; a.exprUntil = ex ? now + (ms || 900) : 0;
    for (var i = 0; i < EXPRS.length; i++) a.el.classList.toggle('ex-' + EXPRS[i], EXPRS[i] === ex);
  }

  /* ---------- particles ---------- */
  function particle(cls, x, y, dx, dy, dur, s0, s1, color, extra){
    if (!layer || fxNodes.length > 90) return null;
    var p = document.createElement('div');
    p.className = 'fx ' + cls;
    p.style.left = Math.round(x) + 'px'; p.style.top = Math.round(y) + 'px';
    if (color) p.style.background = color;
    if (extra) extra(p);
    layer.appendChild(p);
    fxNodes.push(p);
    function gone(){ var i = fxNodes.indexOf(p); if (i !== -1) fxNodes.splice(i, 1); if (p.parentNode) p.parentNode.removeChild(p); }
    try {
      var an = p.animate([
        { transform: 'translate(-50%,-50%) translate(0,0) scale(' + s0 + ')', opacity: 0.95 },
        { transform: 'translate(-50%,-50%) translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(' + s1 + ')', opacity: 0 }
      ], { duration: dur / timeScale, easing: 'cubic-bezier(.2,.7,.3,1)' });
      an.onfinish = gone; an.oncancel = gone;
    } catch (e){ setTimeout(gone, dur); }
    return p;
  }
  function clearParticles(){ fxNodes.slice().forEach(function(p){ if (p.parentNode) p.parentNode.removeChild(p); }); fxNodes = []; }
  function dustColor(){ return (live && live.dust) || (amb && amb.dust) || '#E8D2B0'; }
  function dust(x, y, n, spread){
    var col = dustColor();
    for (var i = 0; i < n; i++){
      var ang = Math.PI + Math.random() * Math.PI, r = rnd(16, spread || 46);
      particle('dust', x + rnd(-8, 8), y - 4, Math.cos(ang) * r, Math.sin(ang) * r * 0.45 - 6, rnd(420, 720), 0.6, 1.8, null,
        function(p){ p.style.setProperty('--dust', col); });
    }
  }
  function sparkle(x, y, n){
    var cols = ['#FFC53D', '#FF8A1F', '#FFFFFF', '#5DB0FF', '#8FE3FF'];
    for (var i = 0; i < n; i++){
      var ang = Math.random() * Math.PI * 2, r = rnd(26, 76);
      particle('spark', x, y, Math.cos(ang) * r, Math.sin(ang) * r, rnd(450, 780), 1, 0.2, cols[i % cols.length]);
    }
  }
  function burst(x, y){
    var cols = ['#2F7BF5', '#FF8A1F', '#3FBF4F', '#E53935', '#FFC53D'];
    for (var i = 0; i < 12; i++){
      var ang = (Math.PI * 2 * i) / 12 + Math.random() * 0.4, r = rnd(70, 110);
      particle('shard', x, y, Math.cos(ang) * r, Math.sin(ang) * r + 30, rnd(560, 760), 1, 0.3, cols[i % 5]);
    }
  }
  function ring(x, y, big){
    particle('ring', x, y, 0, 0, big ? 700 : 520, 0.4, big ? 7 : 3.5, null);
  }
  function speedLines(a){
    var c = centreOf(a);
    for (var i = 0; i < 3; i++){
      particle('speed', c.x - a.face * rnd(20, 60), c.y + rnd(-40, 30), -a.face * rnd(60, 120), 0, 360, 1, 0.6, null,
        function(p){ if (a.face < 0) p.style.transform = 'scaleX(-1)'; });
    }
  }

  /* each dino leaves his own trail: jet smoke, footfall dust, speed lines, wing gusts */
  function emit(a, now, ground){
    if (a.op < 0.3 || a.fallen > 0 || now < a.nextFx) return;
    var moving = !!a.anim, onGround = Math.abs(a.y - standY(ground)) < 18;
    if (a.kind === 'rex' && !onGround){
      var n = artPoint(a, 59, 180);
      particle('smoke', n.x, n.y, rnd(-8, 8), 26 + a.effort * 40, rnd(500, 800), 0.5, 1.7);
      a.nextFx = now + (moving ? 70 : 150); return;
    }
    if (!moving){ a.nextFx = now + 140; return; }
    if (a.kind === 'dash'){
      if (Math.abs(a.anim.tx - a.anim.fx) > 120 && a.anim.dur < 900) speedLines(a);
      var f = artPoint(a, 90, 188);
      if (onGround) particle('dust', f.x, f.y, -a.face * rnd(10, 24), -rnd(2, 10), 380, 0.4, 1.1, null, function(p){ p.style.setProperty('--dust', dustColor()); });
      a.nextFx = now + 90; return;
    }
    if ((a.kind === 'trike' || a.kind === 'rex') && onGround){
      var ft = artPoint(a, a.kind === 'trike' ? 124 : 90, 188);
      particle('dust', ft.x, ft.y, -a.face * rnd(8, 18), -rnd(2, 8), 380, 0.4, 1, null, function(p){ p.style.setProperty('--dust', dustColor()); });
      a.nextFx = now + (a.kind === 'trike' ? 150 : 200); return;
    }
    if (a.kind === 'swoop' && a.anim.spins){
      var c = centreOf(a);
      particle('spark', c.x + rnd(-30, 30), c.y + rnd(-30, 30), rnd(-14, 14), rnd(-14, 14), 500, 0.9, 0.2, Math.random() < 0.5 ? '#FFC53D' : '#fff');
      a.nextFx = now + 80; return;
    }
    a.nextFx = now + 140;
  }

  /* ---------- writing ---------- */
  function writeActor(a){
    a.el.style.opacity = a.op;
    a.el.style.transform = 'translate3d(' + Math.round(a.x) + 'px,' + Math.round(a.y + a.bob) + 'px,0) scale(' +
      (a.sc * a.roll * a.faceCur).toFixed(3) + ',' + a.sc.toFixed(3) + ') rotate(' + a.rot.toFixed(1) + 'deg)';
  }
  function writeShadow(a, ground){
    var sh = a.shadow;
    if (a.op < 0.05 || ground == null){ sh.style.opacity = 0; return; }
    var feet = a.y + a.bob + SIZE / 2 + SIZE * (FEET - 0.5) * a.sc;
    var k = clamp(1 - Math.max(0, ground - feet) / 420, 0.3, 1);
    sh.style.opacity = (a.op * 0.4 * k).toFixed(3);
    sh.style.transform = 'translate3d(' + Math.round(a.x + SIZE / 2 - 50) + 'px,' + Math.round(ground - 8) + 'px,0) scale(' + (k * a.sc * (a.kind === 'trike' ? 1.3 : 1)).toFixed(3) + ',' + (k * a.sc).toFixed(3) + ')';
  }
  function writePayload(p){
    p.el.style.opacity = p.op;
    p.el.style.transform = 'translate3d(' + Math.round(p.x - p.hx) + 'px,' + Math.round(p.y - p.hy) + 'px,0) rotate(' + p.rot.toFixed(1) + 'deg) scale(' + p.sx.toFixed(3) + ',' + p.sc.toFixed(3) + ')';
  }

  /* ---------- posing: legs, tails, wings, jaws ---------- */
  function poseActor(a, tms, ground){
    var r = a.rig, beat = tms / 1000, moving = !!a.anim;
    if (r.eyes){
      var ex = 0, ey = 0, c = centreOf(a);
      if (a.look){
        var dx = a.look.x - c.x, dy = a.look.y - c.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        ex = dx / d * 4.2 * (a.faceCur >= 0 ? 1 : -1); ey = dy / d * 3.4;
      } else if (moving){ ex = 3; ey = clamp((a.anim.ty - a.anim.fy) / 60, -3, 3); }
      else ex = Math.sin(beat * 0.7 + a.key.length) * 2;
      r.eyes.el.setAttribute('transform', 'translate(' + ex.toFixed(1) + ' ' + ey.toFixed(1) + ')');
    }
    if (r.jaw) rot(r.jaw, 18 * a.jaw);
    var legsF = r['leg-f'] || [], legsB = r['leg-b'] || [];
    function legs(fa, fb, ba, bb){
      if (legsF[0]) rot(legsF[0], fa); if (legsF[1]) rot(legsF[1], fb == null ? fa : fb);
      if (legsB[0]) rot(legsB[0], ba); if (legsB[1]) rot(legsB[1], bb == null ? ba : bb);
    }
    if (a.fallen > 0){
      legs(-40 * a.fallen, -34 * a.fallen, -52 * a.fallen, -46 * a.fallen);
      rot(r.tail, 18); rot(r.arm, -30); rot(r['wing-n'], -30);
      return;
    }
    var trick = a.trick && tms < a.trick.t0 + a.trick.dur ? a.trick : null;
    if (a.trick && !trick) a.trick = null;
    var tp = trick ? clamp01((tms - trick.t0) / trick.dur) : 0, up = Math.sin(tp * Math.PI);
    var grounded = Math.abs(a.y - standY(ground)) < 18 || a.kind === 'trike' || a.kind === 'dash';

    switch (a.kind){
      case 'rex': {
        var s = moving && grounded ? Math.sin(beat * 13) : 0;
        if (!grounded) legs(16, 16, 26, 26); else legs(s * 24, null, -s * 24, null);
        rot(r.tail, Math.sin(beat * 3) * 6 - (moving ? 6 : 0) + (trick && trick.kind === 'tailwhip' ? -70 * up : 0));
        rot(r.arm, trick && trick.kind === 'reach' ? -40 + Math.sin(tp * Math.PI * 8) * 22 : (trick && trick.kind === 'cheer' ? -60 * up : Math.sin(beat * 5) * 8));
        if (r.jet){
          var fl = grounded && !moving ? 0.05 : 0.7 + a.effort * 0.9 + Math.sin(beat * 40) * 0.12;
          r.jet.el.setAttribute('transform', 'translate(' + r.jet.px + ' ' + r.jet.py + ') scale(1 ' + Math.max(0.05, fl).toFixed(2) + ') translate(' + (-r.jet.px) + ' ' + (-r.jet.py) + ')');
        }
        rot(r.head, trick && trick.kind === 'roar' ? -10 * up : Math.sin(beat * 2) * 2);
        break;
      }
      case 'trike': {
        var t2 = moving ? Math.sin(beat * (a.anim.dur < 1200 ? 16 : 11)) : 0;
        if (trick && trick.kind === 'paw'){ var pw = Math.sin(tp * Math.PI * 6); legs(pw * 28, 0, 0, 0); }
        else legs(t2 * 22, -t2 * 22, -t2 * 22, t2 * 22);
        rot(r.head, trick && trick.kind === 'charge' ? 12 : (trick && trick.kind === 'cheer' ? -14 * up : Math.sin(beat * 2.2) * 2));
        rot(r.frill, Math.sin(beat * 3) * 2);
        break;
      }
      case 'dash': {
        var sp = moving ? (a.anim.dur < 900 ? 24 : 15) : 2.2;
        var s3 = moving ? Math.sin(beat * sp) : Math.sin(beat * sp) * 0.15;
        legs(s3 * 38, null, -s3 * 38, null);
        rot(r.tail, -s3 * 6 + (moving ? 6 : 0));
        rot(r.arm, trick && trick.kind === 'cheer' ? -60 * up : s3 * 12);
        rot(r.head, trick && trick.kind === 'cheer' ? -12 * up : s3 * 3);
        break;
      }
      case 'swoop': {
        var flying = moving || a.y < standY(ground) - 20;
        var fs = flying ? Math.sin(beat * (a.anim && a.anim.dur < 900 ? 22 : 13)) : Math.sin(beat * 2) * 0.12;
        var glideTrick = trick && trick.kind === 'glide';
        rot(r['wing-n'], glideTrick ? -8 : (flying ? fs * 38 : 24) + (trick && trick.kind === 'cheer' ? -30 * up : 0));
        rot(r['wing-f'], glideTrick ? -12 : (flying ? fs * 30 - 6 : 18));
        rot(r.scarf, Math.sin(beat * 16) * 10 - (moving ? 10 : 0));
        legs(flying ? 20 : 0, null, flying ? 26 : 0, null);
        rot(r.head, Math.sin(beat * 2.4) * 3);
        break;
      }
    }
  }

  /* ---------- motion ---------- */
  function move(a, t0, dur, to, opts){
    opts = opts || {};
    if (amb && !live && amb.ceil != null && amb.keys.indexOf(a.key) !== -1){
      var room = headroom(a), topY = restY(a) - room;
      if (opts.arc) opts.arc = Math.min(opts.arc, room);
      if (to.y < topY) to = { x: to.x, y: topY, sc: to.sc };
    }
    if (a.anim && a.anim.onEnd){ var pend = a.anim.onEnd; a.anim.onEnd = null; try { pend(); } catch (e){} }
    a.anim = {
      t0: t0, dur: Math.max(60, dur), fx: a.x, fy: a.y, fsc: a.sc,
      tx: to.x, ty: to.y, tsc: to.sc == null ? a.sc : to.sc,
      ease: EASES[opts.ease] || easeOut, rotFrom: a.rot, rotTo: opts.rotTo == null ? 0 : opts.rotTo,
      spins: opts.spins || 0, arc: opts.arc || 0, roll: opts.roll || 0, path: opts.path || null,
      fop: a.op, top: opts.op == null ? 1 : opts.op, effort: opts.effort == null ? 0.5 : opts.effort,
      onEnd: opts.onEnd || null, next: opts.next || null
    };
    if (!opts.keepFace && Math.abs(to.x - a.x) > 8) a.face = to.x > a.x ? 1 : -1;
    if (opts.face) a.face = opts.face;
  }
  function stepActor(a, t, dt){
    if (a.expr && t >= a.exprUntil) setExpr(a, null, 0, t);
    a.faceCur += (a.face - a.faceCur) * Math.min(1, dt * 0.02);
    if (Math.abs(a.faceCur) < 0.06) a.faceCur = a.face * 0.06;
    if (a.jawUntil && t > a.jawUntil){ a.jaw *= 0.85; if (a.jaw < 0.02){ a.jaw = 0; a.jawUntil = 0; } }
    var an = a.anim;
    if (!an){ a.effort *= 0.92; return; }
    var p = clamp01((t - an.t0) / an.dur), e = an.ease(p);
    a.phase = p;
    a.effort = an.effort * (1 - Math.abs(p - 0.4));
    if (an.path){ var q = an.path(e, p); a.x = q.x; a.y = q.y; }
    else { a.x = lerp(an.fx, an.tx, e); a.y = lerp(an.fy, an.ty, e) - an.arc * Math.sin(Math.PI * p); }
    a.sc = lerp(an.fsc, an.tsc, e);
    a.roll = an.roll ? Math.cos(Math.PI * 2 * an.roll * e) : 1;
    if (Math.abs(a.roll) < 0.08) a.roll = a.roll < 0 ? -0.08 : 0.08;
    a.op = lerp(an.fop, an.top, an.top < an.fop ? clamp01((p - 0.75) / 0.25) : Math.min(1, p * 3));
    a.rot = an.spins ? 360 * an.spins * e : lerp(an.rotFrom, an.rotTo, e);
    if (p >= 1){
      var done = an.onEnd, nxt = an.next;
      a.anim = null; a.roll = 1;
      if (done){ try { done(); } catch (err){} }
      if (nxt && !a.anim) move(a, t, nxt.dur, nxt.to, nxt.opts || {});
    }
  }

  /* ---------- letters ---------- */
  var ANCHOR = {
    rex:   { mouth: [186, 96] },
    trike: { horns: [190, 64], back: [98, 62], mouth: [186, 116] },
    dash:  { arms: [146, 118], mouth: [186, 86] },
    swoop: { feet: [100, 160], back: [104, 80], mouth: [186, 88] }
  };
  function anchorFor(a, kind){
    var set = ANCHOR[a.kind];
    return (kind && set[kind]) || set.mouth || set.arms || set.feet;
  }
  /* stack letters: up from horns, back and mouth; down from feet */
  function takeHold(a, pl, where){
    var anch = anchorFor(a, where);
    var dirY = where === 'feet' ? 1 : -1;
    var n = 0;
    live.payloads.forEach(function(q){ if (q !== pl && q.state === 'held' && q.owner === a.key && q.where === where) n++; });
    pl.state = 'held'; pl.owner = a.key; pl.where = where || 'mouth';
    pl.anchor = anch; pl.slot = n; pl.dirY = dirY;
    pl.offRot = (n % 2 ? -1 : 1) * (5 + n * 3);
    pl.sc = 0.8; pl.sx = 0.8;
    a.look = null;
  }
  function releaseHold(pl){ pl.owner = null; pl.where = null; }
  /* where a letter sits in someone's stack: the order follows the word
     (horns follow pick-up order), so a stack always reads top to bottom */
  function stackPos(pl, owner, where, dirY){
    var pos = 0;
    live.payloads.forEach(function(q){
      if (q === pl || q.state !== 'held' || q.owner !== owner || q.where !== where) return;
      if (where === 'horns'){ if ((q.arrive || 0) < (pl.arrive || 0)) pos++; }
      else if (dirY < 0 ? q.idx > pl.idx : q.idx < pl.idx) pos++;
    });
    return pos;
  }
  function holdTarget(a, pl, where){
    var anch = anchorFor(a, where), dirY = where === 'feet' ? 1 : -1;
    var pos = stackPos(pl, a.key, where, dirY);
    var p = artPoint(a, anch[0], anch[1]);
    return { x: p.x + (pos % 2 ? -1 : 1) * Math.min(pos, 1) * pl.w * 0.12,
             y: p.y + dirY * (pl.h * 0.4 + pos * pl.h * 0.8 * 0.72), pos: pos };
  }

  function stepPayload(pl, t, dt){
    if (pl.state === 'gone') return;
    var a = pl.owner ? actors[pl.owner] : null;
    switch (pl.state){
      case 'held': {
        if (!a) return;
        var ht = holdTarget(a, pl, pl.where);
        pl.slot = ht.pos;
        var tx = ht.x, ty = ht.y;
        pl.x += (tx - pl.x) * 0.5; pl.y += (ty - pl.y) * 0.5;
        pl.rot = lerp(pl.rot, pl.offRot + Math.sin(t / 170 + pl.idx) * 3 + a.rot * 0.3, 0.25);
        return;
      }
      case 'hop': {
        /* a short flight into someone's grip, so nothing teleports */
        var hp = clamp01((t - pl.hopT0) / pl.hopDur), ha = actors[pl.hopTo];
        if (!ha){ pl.state = 'free'; return; }
        /* straight to its own place in the stack, not to the bottom of it */
        var tgt = holdTarget(ha, pl, pl.hopWhere);
        var e = easeInOut(hp);
        pl.x = lerp(pl.hopFx, tgt.x, e); pl.y = lerp(pl.hopFy, tgt.y, e) - 60 * Math.sin(Math.PI * hp);
        pl.rot += 12;
        if (hp >= 1){ takeHold(ha, pl, pl.hopWhere); SFX.play('pickup'); }
        return;
      }
      case 'free': {
        pl.vy += GRAV * dt * (pl.lowG ? 0.35 : 1);
        pl.x += pl.vx * dt; pl.y += pl.vy * dt; pl.rot += pl.spin * dt;
        if (pl.y > pl.groundY){
          pl.y = pl.groundY;
          if (Math.abs(pl.vy) > 0.06){ SFX.play('bonk'); dust(pl.x, pl.groundY + pl.h * 0.5, 2, 30); }
          pl.vy = -pl.vy * 0.42; pl.vx *= 0.68; pl.spin *= 0.5;
          if (Math.abs(pl.vy) < 0.08){ pl.vy = 0; pl.spin = 0; pl.rot *= 0.8; }
        }
        if (pl.x < pl.hx && pl.vx < 0){ pl.x = pl.hx; pl.vx = -pl.vx * 0.5; }
        if (pl.x > vw() - pl.hx && pl.vx > 0){ pl.x = vw() - pl.hx; pl.vx = -pl.vx * 0.5; }
        if (pl.y < pl.hy + 20 && pl.vy < 0){ pl.y = pl.hy + 20; pl.vy = -pl.vy * 0.3; }
        return;
      }
      case 'float': {
        /* shaken loose by the roar: drifting to a spot and bobbing there */
        pl.x += (pl.floatX - pl.x) * 0.06;
        pl.y += (pl.floatY + Math.sin(t / 420 + pl.idx) * 10 - pl.y) * 0.06;
        pl.rot += pl.spin * dt;
        return;
      }
      case 'flying': {
        /* whacked clean off the screen, spinning */
        pl.vy += GRAV * 0.6 * dt; pl.x += pl.vx * dt; pl.y += pl.vy * dt; pl.rot += pl.spin * dt;
        if (pl.x < -pl.w * 2 || pl.x > vw() + pl.w * 2 || pl.y > vh() + pl.h * 2){ pl.state = 'gone'; pl.op = 0; }
        return;
      }
      case 'trail': {
        /* in Dash's slipstream: a line of letters behind him */
        if (!a) return;
        var ac = centreOf(a);
        /* the line behind him reads left to right whichever way he runs */
        var tn = 0, tpos = 0;
        live.payloads.forEach(function(q){ if (q.state === 'trail' && q.owner === pl.owner){ tn++; if (q.idx < pl.idx) tpos++; } });
        var dist = a.face > 0 ? tn - 1 - tpos : tpos;
        var gx = ac.x - a.faceCur * (80 + dist * pl.w * 0.9);
        var gy = standY(live.groundY) + SIZE * 0.72 - pl.h * 0.5 - Math.abs(Math.sin(t / 110 + pl.idx)) * 14;
        pl.x += (gx - pl.x) * 0.22; pl.y += (gy - pl.y) * 0.22;
        pl.rot = Math.sin(t / 90 + pl.idx) * 14;
        return;
      }
      case 'orbit': {
        if (!a) return;
        var oc = centreOf(a);
        pl.ang += dt * 0.012;
        var rr = 78 + (pl.slot % 2) * 24;
        pl.x += (oc.x + Math.cos(pl.ang) * rr - pl.x) * 0.3;
        pl.y += (oc.y - 10 + Math.sin(pl.ang) * rr * 0.55 - pl.y) * 0.3;
        pl.rot += dt * 0.4;
        return;
      }
      case 'beam': {
        var bp = clamp01((t - pl.beamT0) / pl.beamDur), sh = live.ship;
        var sx = sh ? sh.x : vw() / 2, sy = sh ? sh.y + 110 : 60;
        pl.x = lerp(pl.beamFx, sx + Math.sin(t / 200 + pl.idx) * 10 * (1 - bp), easeInOut(bp));
        pl.y = lerp(pl.beamFy, sy, easeIn(bp));
        pl.sc = pl.sx = lerp(1, 0.35, bp);
        pl.rot = Math.sin(t / 150 + pl.idx) * 20;
        if (bp >= 1){ pl.state = 'gone'; pl.op = 0; }
        return;
      }
      case 'arc': {
        var ap = clamp01((t - pl.arcT0) / pl.arcDur), ta = actors[pl.arcTo];
        var end = ta ? artPoint(ta, anchorFor(ta, 'mouth')[0], anchorFor(ta, 'mouth')[1]) : { x: pl.arcFx, y: pl.arcFy };
        pl.x = lerp(pl.arcFx, end.x, ap); pl.y = lerp(pl.arcFy, end.y, ap) - 150 * Math.sin(Math.PI * ap);
        pl.rot += dt * 0.5 * (end.x > pl.arcFx ? 1 : -1);
        return;
      }
      case 'tugged': {
        var ta1 = actors[pl.tugA], ta2 = actors[pl.tugB];
        if (!ta1 || !ta2) return;
        var m1 = artPoint(ta1, anchorFor(ta1, 'mouth')[0], anchorFor(ta1, 'mouth')[1]);
        var m2 = artPoint(ta2, anchorFor(ta2, 'mouth')[0], anchorFor(ta2, 'mouth')[1]);
        pl.x = (m1.x + m2.x) / 2; pl.y = (m1.y + m2.y) / 2;
        pl.sx = 1 + Math.abs(m1.x - m2.x) / 600 + (live.tugging ? Math.sin(t / 50) * 0.06 : 0);
        pl.rot = Math.sin(t / 60) * (live.tugging ? 6 : 1);
        return;
      }
      case 'lined': {
        var lp = clamp01((t - pl.t0) / pl.dur);
        if (lp < 1){ var le = easeInOut(lp); pl.x = lerp(pl.fx, pl.tx, le); pl.y = lerp(pl.fy, pl.ty, le) - 90 * Math.sin(Math.PI * lp); pl.rot = lerp(pl.frot, 0, le); }
        else { pl.x = pl.tx; pl.y = pl.ty - Math.abs(Math.sin(t / 150 + pl.idx * 0.9)) * 12; pl.rot = Math.sin(t / 150 + pl.idx * 0.9) * 5; }
        return;
      }
      case 'following': {
        if (!a) return;
        var lc = a.x + SIZE / 2, gx2 = lc - pl.dirSign * (pl.slot + 1) * pl.gap;
        pl.x += (gx2 - pl.x) * 0.16;
        var hop = Math.abs(Math.sin(t / 130 + pl.idx * 0.8));
        pl.y = pl.ty - hop * 20; pl.rot = pl.dirSign * (hop - 0.5) * 12;
        return;
      }
    }
  }

  function makePayload(srcEl, idx){
    var r = srcEl.getBoundingClientRect();
    var wrap = document.createElement('div');
    wrap.className = 'letterprop';
    wrap.style.width = r.width + 'px'; wrap.style.height = r.height + 'px';
    var clone = srcEl.cloneNode(true);
    clone.removeAttribute('id');
    clone.style.margin = '0'; clone.style.width = r.width + 'px'; clone.style.height = r.height + 'px'; clone.style.transform = 'none';
    clone.classList.remove('taken', 'lit', 'next');
    wrap.appendChild(clone);
    layer.appendChild(wrap);
    srcEl.classList.add('taken');
    return {
      el: wrap, src: srcEl, idx: idx, hx: r.width / 2, hy: r.height / 2, w: r.width, h: r.height,
      x: r.left + r.width / 2, y: r.top + r.height / 2, homeX: r.left + r.width / 2, homeY: r.top + r.height / 2,
      rot: 0, sc: 1, sx: 1, op: 1, vx: 0, vy: 0, spin: 0, state: 'idle', owner: null, groundY: 0
    };
  }
  function edgeFor(dir, a){
    var y = a ? a.y : standY(live.groundY);
    switch (dir){
      case 'up':   return { x: a ? clamp(a.x, -SIZE * 0.2, vw() - SIZE * 0.8) : vw() / 2 - SIZE / 2, y: -SIZE - 80 - trailFor(a) };
      case 'left': return { x: -SIZE - 90 - trailFor(a), y: y };
      default:     return { x: vw() + 90 + trailFor(a), y: y };
    }
  }
  /* how far behind/below him his letters trail: he must travel that much further to take them off */
  function trailFor(a){
    if (!a || !live) return 0;
    var n = 0, w = 0;
    live.payloads.forEach(function(q){ if (q.owner === a.key && q.state !== 'gone'){ n++; w = Math.max(w, q.w, q.h); } });
    return n ? 40 + (n + 1) * w : 0;
  }
  /* where a dino stands to work on a letter */
  function beside(pl, a, side){
    var s = side || -1;
    var ground = live.groundY;
    var x = pl.x + s * (pl.w * 0.5 + SIZE * 0.34) - SIZE / 2;
    var y = C.CHARS[a.key].airborne ? pl.y - SIZE * 0.55 : standY(ground);
    return { x: clamp(x, -SIZE * 0.3, vw() - SIZE * 0.7), y: y };
  }
  function SX(){ return live && live.plan && live.plan.mirror ? -1 : 1; }
  function nextEventFor(e, kind){
    var ev = live.plan.events;
    for (var i = 0; i < ev.length; i++) if (ev[i].at >= e.at && ev[i] !== e && ev[i].letter === e.letter && ev[i].kind === kind) return ev[i];
    return null;
  }
  /* ground a letter that is too high for a ground-bound dino to reach */
  function dropToGround(pl){
    pl.state = 'free'; pl.owner = null;
    pl.groundY = live.groundY - pl.h * 0.5 - 6;
    pl.vx = rnd(-0.03, 0.03); pl.vy = -0.08; pl.spin = rnd(-0.06, 0.06);
  }
  function hopInto(pl, a, where, dur, t){
    pl.state = 'hop'; pl.hopTo = a.key; pl.hopWhere = where;
    pl.hopFx = pl.x; pl.hopFy = pl.y; pl.hopT0 = t; pl.hopDur = dur || 260;
  }
  /* where a free letter will be in ms */
  function predict(pl, ms){
    var x = pl.x, y = pl.y, vx = pl.vx, vy = pl.vy;
    for (var s = 0; s < ms; s += 16){
      if (pl.state === 'float'){ x += (pl.floatX - x) * 0.06; y += (pl.floatY - y) * 0.06; continue; }
      vy += GRAV * 16 * (pl.lowG ? 0.35 : 1); x += vx * 16; y += vy * 16;
      if (y > pl.groundY){ y = pl.groundY; vy = -vy * 0.42; vx *= 0.68; }
    }
    return { x: clamp(x, pl.hx, vw() - pl.hx), y: Math.max(pl.hy + 70, y) };
  }

  /* ============================================================
     EVENT HANDLERS
     ============================================================ */
  function fire(e, t){
    var a = actors[e.char];
    var pl = e.letter != null ? live.payloads[e.letter] : null;
    var ground = live.groundY, sx = SX(), sy0 = standY(ground);

    switch (e.kind){
      case 'enter': {
        if (!a) break;
        var side = live.entryFor[e.char];
        if (e.side === 'far') side = side === 'left' ? 'right' : (side === 'right' ? 'left' : (sx > 0 ? 'right' : 'left'));
        var target = pl || live.payloads[Math.floor(live.payloads.length / 2)] || null;
        a.fallen = 0; a.op = 0; a.sc = 1;
        if (side === 'up'){ a.x = (target ? target.x : vw() / 2) - SIZE / 2; a.y = -SIZE - 40; }
        else { a.x = side === 'left' ? -SIZE - 40 : vw() + 40; a.y = hoverY(ground, a.kind); }
        var to;
        if (e.side === 'far'){ to = { x: side === 'left' ? vw() * 0.06 : vw() * 0.94 - SIZE, y: hoverY(ground, a.kind) }; }
        else if (target){ to = beside(target, a, side === 'right' ? 1 : -1); if (!C.CHARS[a.key].airborne) to.y = sy0; }
        else to = { x: vw() * 0.42 - SIZE / 2, y: hoverY(ground, a.kind) };
        if (target) a.look = { x: target.x, y: target.y };
        move(a, t, e.dur, to, { op: 1, ease: 'back', effort: 0.8, spins: a.kind === 'swoop' && side === 'up' ? 0 : 0 });
        SFX.play({ rex:'jet', trike:'stomp', dash:'zoom', swoop:'flap' }[a.kind]);
        break;
      }
      case 'approach': {
        if (!a || !pl) break;
        var tw = nextEventFor(e, 'tailwhip');
        /* a tail whip needs him on the far side of the letter from where it will fly */
        var sd = tw ? (tw.dir === 'right' ? -1 : 1) : -sx;
        /* on foot, nobody can reach a letter up in the card: it drops to the
           ground first, where he can see it land and walk up to it */
        if ((!C.CHARS[a.key].airborne || a.kind === 'rex') && pl.state === 'idle' && pl.y < ground - pl.h * 1.4) dropToGround(pl);
        var land = pl.state === 'free' ? { x: pl.x, y: ground - pl.h * 0.5 } : pl;
        var m = beside({ x: land.x, y: land.y, w: pl.w }, a, sd);
        if (a.kind === 'rex') m.y = sy0;
        a.look = { x: pl.x, y: pl.y };
        move(a, t, e.dur, m, { ease: 'out', effort: 0.5 });
        break;
      }
      case 'roar': {
        if (!a) break;
        setExpr(a, 'roar', e.dur, t);
        a.trick = { kind: 'roar', t0: t, dur: e.dur };
        a.jaw = 1; a.jawUntil = t + e.dur * 0.8;
        var mouth = artPoint(a, 186, 96);
        ring(mouth.x, mouth.y, true);
        setTimeout(function(){ if (live) ring(mouth.x, mouth.y, true); }, 180 / timeScale);
        live.shake = Math.max(live.shake, 10);
        live.payloads.forEach(function(q, i){
          if (q.state !== 'idle') return;
          q.state = 'float';
          /* shaken loose, they hang in low gravity across the middle of the
             screen: spread out, readable, and where he can reach them */
          var n5 = live.payloads.length;
          q.floatX = clamp(vw() * (0.18 + 0.64 * (n5 > 1 ? i / (n5 - 1) : 0.5)) + rnd(-14, 14), q.hx + 8, vw() - q.hx - 8);
          q.floatY = clamp(q.y + rnd(-40, 40) + 30, 110, live.groundY - SIZE * 1.2);
          q.vx = 0; q.vy = 0;
          q.spin = rnd(-0.08, 0.08);
        });
        SFX.play('roar');
        break;
      }
      case 'snatch': {
        if (!a || !pl) break;
        var aim = predict(pl, e.dur * 0.7);
        var fdir = aim.x > a.x + SIZE / 2 ? 1 : -1;
        /* his mouth, not his middle, arrives at the letter */
        var mx = SIZE / 2 + fdir * (186 * K - SIZE / 2), my = 96 * K;
        move(a, t, e.dur * 0.7, { x: clamp(aim.x - mx, -SIZE * 0.25, vw() - SIZE * 0.75), y: aim.y - my }, { face: fdir,
          ease: 'out', effort: 1,
          onEnd: function(){ if (pl.state !== 'held' && pl.state !== 'gone'){ takeHold(a, pl, 'mouth'); SFX.play('chomp'); setExpr(a, 'happy', 600); } }
        });
        a.face = aim.x > a.x + SIZE / 2 ? 1 : -1;
        SFX.play('jet');
        break;
      }
      case 'reach': {
        if (!a || !pl) break;
        a.face = pl.x > a.x + SIZE / 2 ? 1 : -1;
        a.look = { x: pl.x, y: pl.y };
        a.trick = { kind: 'reach', t0: t, dur: e.dur };
        setExpr(a, 'oops', e.dur + 300, t);
        move(a, t, e.dur, { x: a.x + a.face * 8, y: a.y, sc: 1 }, { ease: 'inout', rotTo: 8, effort: 1, keepFace: true });
        SFX.play('strain');
        break;
      }
      case 'tailwhip': {
        if (!a || !pl) break;
        var dirSign = e.dir === 'left' ? -1 : 1;
        a.face = -dirSign;                       /* back to the letter */
        a.trick = { kind: 'tailwhip', t0: t, dur: e.dur };
        setExpr(a, 'happy', e.dur, t);
        move(a, t, e.dur, { x: a.x - dirSign * 10, y: a.y }, { ease: 'out', rotTo: 0, effort: 1, keepFace: true,
          onEnd: function(){} });
        setTimeout(function(){
          if (!live || pl.state === 'gone') return;
          pl.state = 'flying'; pl.owner = null;
          pl.vx = dirSign * rnd(0.75, 0.95); pl.vy = -rnd(0.55, 0.75); pl.spin = dirSign * 0.9;
          sparkle(pl.x, pl.y, 5);
          SFX.play('whack');
        }, (e.dur * 0.45) / timeScale);
        break;
      }
      case 'paw': {
        if (!a) break;
        a.trick = { kind: 'paw', t0: t, dur: e.dur };
        var chargeEv = live.plan.events.filter(function(q){ return q.kind === 'charge' && q.char === a.key; })[0];
        if (chargeEv){
          /* go to the far side first, so the charge runs through every letter */
          var cd = chargeEv.dir === 'left' ? -1 : 1;
          a.face = cd;
          move(a, t, e.dur * 0.5, { x: cd > 0 ? -SIZE * 0.1 : vw() - SIZE * 0.9, y: sy0 }, { ease: 'inout', effort: 0.6, face: cd });
        }
        var f = artPoint(a, 124, 188);
        dust(f.x, f.y, 6, 40);
        SFX.play('snort');
        break;
      }
      case 'stomp': {
        if (!a) break;
        setExpr(a, 'roar', e.dur, t);
        var launch = e.mode === 'launch';
        move(a, t, e.dur * 0.45, { x: a.x, y: a.y - 26 }, { ease: 'out', rotTo: -18, effort: 1, keepFace: true,
          next: { dur: e.dur * 0.25, to: { x: a.x, y: sy0 }, opts: { ease: 'in', rotTo: 0, effort: 1, keepFace: true,
            onEnd: function(){
              if (!live) return;
              var fp = artPoint(a, 120, 190);
              ring(fp.x, ground, true); dust(fp.x, ground, 12, 80);
              live.shake = Math.max(live.shake, 14);
              SFX.play('boom');
              live.payloads.forEach(function(q, i){
                if (q.state !== 'idle' && q.state !== 'free') return;
                q.state = 'free'; q.owner = null;
                q.groundY = ground - q.h * 0.5 - 6;
                q.lowG = false;
                /* launched outward from the middle, each to its own height, so
                   they fly as separate letters and never collide in the air */
                if (launch){ var cxw = vw() / 2; q.vy = -(0.95 + (i % 3) * 0.12); q.vx = (q.x - cxw) / 2600 + (i % 2 ? 0.02 : -0.02); q.spin = (i % 2 ? 1 : -1) * 0.2; }
                /* shaken straight down: each lands under where it was, still spaced */
                else { q.vy = -(0.12 + (i % 2) * 0.06); q.vx = 0; q.spin = (i % 2 ? 1 : -1) * 0.12; }
              });
            } } }
        });
        break;
      }
      case 'charge': {
        if (!a) break;
        var d2 = e.dir === 'left' ? -1 : 1;
        a.trick = { kind: 'charge', t0: t, dur: e.dur };
        setExpr(a, 'roar', e.dur, t);
        move(a, t, e.dur, edgeFor(e.dir || 'right', a), { ease: 'in', effort: 1, face: d2 });
        a.anim.tx = d2 > 0 ? vw() + 200 + live.payloads.length * 70 : -SIZE - 200 - live.payloads.length * 70;
        SFX.play('charge');
        break;
      }
      case 'scoop': {
        if (!a) break;
        /* he scoops whatever he reaches next, not whatever the plan named:
           the letter right in front of his horns is the one that goes up */
        var ahead = live.payloads.filter(function(q){ return q.state === 'free' || q.state === 'idle'; });
        if (!ahead.length) break;
        var hx = artPoint(a, 190, 100).x;
        ahead.sort(function(p1, p2){ return a.face * (p1.x - p2.x); });
        var inFront = ahead.filter(function(q){ return a.face * (q.x - hx) > -40; });
        pl = (inFront[0] || ahead[ahead.length - 1]);
        pl.arrive = ++live.arrivals;
        hopInto(pl, a, 'horns', 220, t);
        SFX.play('scoop');
        break;
      }
      case 'backcatch': {
        if (!a || !pl) break;
        var backY = standY(ground) + 62 * K;
        var land = pl.state === 'free' ? predict(pl, e.dur * 0.8) : { x: pl.x, y: pl.y };
        var bxOff = (98 * K - SIZE / 2);
        var tx2 = clamp(land.x - SIZE / 2 - bxOff * a.face, -SIZE * 0.3, vw() - SIZE * 0.7);
        a.look = { x: pl.x, y: pl.y };
        move(a, t, e.dur * 0.8, { x: tx2, y: sy0 }, { ease: 'inout', effort: 0.9,
          onEnd: function(){ if (pl.state !== 'held' && pl.state !== 'gone'){ hopInto(pl, a, 'back', 160, live.vnow); SFX.play('catch'); setExpr(a, 'happy', 600); } } });
        break;
      }
      case 'skid': {
        if (!a) break;
        var s2 = a.face;
        move(a, t, e.dur, { x: clamp(a.x + s2 * 40, -SIZE * 0.2, vw() - SIZE * 0.8), y: sy0 }, { ease: 'out', rotTo: -12, effort: 0.8, keepFace: true,
          next: { dur: 160, to: { x: clamp(a.x + s2 * 44, -SIZE * 0.2, vw() - SIZE * 0.8), y: sy0 }, opts: { rotTo: 0, keepFace: true } } });
        var fs = artPoint(a, 90, 188);
        dust(fs.x, ground, 8, 60);
        SFX.play('skid');
        break;
      }
      case 'dashpass': {
        if (!a) break;
        var goRight = a.x + SIZE / 2 < vw() / 2;
        move(a, t, e.dur, { x: goRight ? vw() - SIZE * 0.95 : -SIZE * 0.05, y: sy0 }, { ease: 'inout', effort: 1 });
        SFX.play('zoom');
        break;
      }
      case 'sweep': {
        if (!a || !pl) break;
        if (pl.state === 'held' || pl.state === 'gone') break;
        var n2 = live.payloads.filter(function(q){ return q.state === 'trail' && q.owner === a.key; }).length;
        pl.state = 'trail'; pl.owner = a.key; pl.slot = n2;
        sparkle(pl.x, pl.y, 3);
        SFX.play('whoosh');
        break;
      }
      case 'notice': {
        if (!a) break;
        if (pl){ a.look = { x: pl.x, y: pl.y }; a.face = pl.x > a.x + SIZE / 2 ? 1 : -1; }
        setExpr(a, 'wow', e.dur + 300, t);
        move(a, t, e.dur, { x: a.x, y: a.y - 10 }, { ease: 'back', rotTo: -8, effort: 0.2, keepFace: true });
        SFX.play('huh');
        break;
      }
      case 'zoom': {
        if (!a) break;
        var dz = e.dir === 'left' ? -1 : 1;
        setExpr(a, 'happy', e.dur, t);
        move(a, t, e.dur, edgeFor(e.dir || 'right', a), { ease: 'in', effort: 1, face: dz, rotTo: 8 });
        SFX.play('zoom');
        break;
      }
      case 'spindash': {
        if (!a) break;
        setExpr(a, 'happy', e.dur, t);
        move(a, t, e.dur, { x: clamp(vw() / 2 - SIZE / 2, 0, vw() - SIZE), y: sy0 - 40 }, { ease: 'inout', spins: Math.max(3, Math.round(e.dur / 320)), effort: 1 });
        live.whirlUntil = t + e.dur;
        SFX.play('spin');
        break;
      }
      case 'orbit': {
        if (!a || !pl) break;
        var n3 = live.payloads.filter(function(q){ return q.state === 'orbit'; }).length;
        pl.state = 'orbit'; pl.owner = a.key; pl.slot = n3; pl.ang = n3 * 1.3;
        SFX.play('whoosh');
        break;
      }
      case 'dive': {
        if (!a) break;
        /* he always dives for the waiting letter nearest to him, working in
           from his side, so what he already carries only ever passes over
           spots he has emptied — never behind a letter still waiting */
        var waiting = live.payloads.filter(function(q){ return q.state === 'idle'; });
        if (waiting.length && !(pl && (pl.state === 'free' || pl.state === 'float'))){
          /* first letter first: each new catch joins the BOTTOM of what hangs
             from his feet, so nothing already carried has to shuffle, and the
             word reads top to bottom as it grows */
          waiting.sort(function(p1, p2){ return p1.idx - p2.idx; });
          pl = waiting[0];
        }
        if (!pl || pl.state === 'held' || pl.state === 'gone') break;
        var hy = Math.min(pl.y - SIZE * 1.1, sy0 - 90);
        var lastDive = live.payloads.filter(function(q){ return q !== pl && (q.state === 'idle' || q.state === 'free' || q.state === 'float'); }).length === 0;
        /* coming back for another: in from above the letter, not from wherever he left */
        if (a.y < -SIZE * 0.5){ a.x = pl.x - SIZE / 2; }
        if (pl.state === 'idle') { /* letters in the card: stay put until grabbed */ }
        var aim2 = pl.state === 'free' ? predict(pl, e.dur * 0.55) : { x: pl.x, y: pl.y };
        /* he comes down so the BOTTOM of what he already carries meets the
           letter: it joins the end of the line instead of being flown through */
        /* aim so that the place in his stack where THIS letter will sit
           meets it: the letters already hanging then stay clear of the row */
        var above = live.payloads.filter(function(q){ return q.state === 'held' && q.owner === a.key && q.where === 'feet' && q.idx < pl.idx; }).length;
        /* held letter k sits at feet + 0.4h + k*step: put slot `above` on the target */
        var stepH = pl.h * 0.8 * 0.72;
        a.look = { x: aim2.x, y: aim2.y };
        move(a, t, e.dur * 0.55, { x: aim2.x - SIZE / 2, y: aim2.y - pl.h * 0.4 - above * stepH - 160 * K }, {
          ease: 'in', rotTo: 30, effort: 1,
          onEnd: function(){
            if (pl.state !== 'held' && pl.state !== 'gone'){ takeHold(a, pl, 'feet'); SFX.play('catch'); setExpr(a, 'happy', 700); }
          },
          /* each catch goes straight up and out of sight, and he comes back
             down for the next: a dangling stack would have to fly past the
             letters still waiting. The last one stays with him for the loop. */
          next: lastDive
            ? { dur: e.dur * 0.45, to: { x: clamp(a.x + a.face * 80, -SIZE * 0.2, vw() - SIZE * 0.8), y: Math.max(40, hy) }, opts: { ease: 'out', rotTo: -12, effort: 0.8 } }
            : { dur: e.dur * 0.45, to: { x: a.x, y: -SIZE - 60 - pl.h * 2 }, opts: { ease: 'in', rotTo: -20, effort: 1,
                onEnd: function(){ live && live.payloads.forEach(function(q){ if (q.state === 'held' && q.owner === a.key && q.where === 'feet'){ q.state = 'gone'; q.op = 0; } }); } } }
        });
        SFX.play('dive');
        break;
      }
      case 'loop': {
        if (!a) break;
        var cx0 = a.x, cy0 = a.y, R = 70;
        setExpr(a, 'happy', e.dur, t);
        move(a, t, e.dur, { x: cx0, y: cy0 }, { effort: 1, ease: 'inout', spins: -a.face,
          path: function(ep){ return { x: cx0 + Math.sin(ep * Math.PI * 2) * R * a.face, y: cy0 - (1 - Math.cos(ep * Math.PI * 2)) * R }; } });
        sparkle(a.x + SIZE / 2, a.y + SIZE / 2, 6);
        SFX.play('loop');
        break;
      }
      case 'glide': {
        if (!a) break;
        var dg = e.dir === 'left' ? -1 : 1;
        a.trick = { kind: 'glide', t0: t, dur: e.dur };
        var lowY = sy0 - 34;
        var startX = dg > 0 ? -SIZE * 0.3 : vw() - SIZE * 0.7;
        move(a, t, e.dur * 0.2, { x: startX, y: lowY }, { ease: 'inout', effort: 0.6, face: dg,
          next: { dur: e.dur * 0.8, to: edgeFor(dg > 0 ? 'right' : 'left', a), opts: { ease: 'linear', effort: 0.4, face: dg } } });
        SFX.play('glide');
        break;
      }
      case 'ride': {
        if (!a || !pl || pl.state === 'held') break;
        if (pl.state === 'idle' && pl.y < ground - SIZE) dropToGround(pl);
        hopInto(pl, a, 'back', 300, t);
        SFX.play('boing');
        break;
      }
      case 'wave': {
        if (!a) break;
        a.trick = { kind: 'cheer', t0: t, dur: e.dur };
        setExpr(a, 'happy', e.dur, t);
        a.look = { x: vw() / 2, y: 0 };
        break;
      }
      case 'shiparrive': {
        showShip(t, e.dur);
        SFX.play('ship');
        break;
      }
      case 'beam': {
        if (!pl) break;
        pl.state = 'beam'; pl.owner = null;
        pl.beamT0 = t; pl.beamDur = e.dur + 400; pl.beamFx = pl.x; pl.beamFy = pl.y;
        SFX.play('beam');
        break;
      }
      case 'beamup': {
        if (!a) break;
        var sh2 = live.ship;
        setExpr(a, 'happy', e.dur, t);
        move(a, t, e.dur, { x: (sh2 ? sh2.x : vw() / 2) - SIZE / 2, y: sh2 ? sh2.y + 20 : 0, sc: 0.35 }, { ease: 'in', effort: 0.4, op: 0, spins: 1 });
        SFX.play('beam');
        break;
      }
      case 'shipleave': {
        hideShip(t, e.dur);
        SFX.play('blastoff');
        break;
      }
      case 'toss': {
        if (!a || !pl) break;
        var b = actors[e.other];
        if (!C.CHARS[a.key].airborne && pl.state === 'idle' && pl.y < ground - pl.h * 1.4) dropToGround(pl);
        var bs = beside({ x: pl.x, y: pl.state === 'free' ? ground - pl.h * 0.5 : pl.y, w: pl.w }, a, b && b.x < pl.x ? 1 : -1);
        if (!C.CHARS[a.key].airborne) bs.y = sy0;
        move(a, t, e.dur * 0.4, bs, { ease: 'out', effort: 0.8,
          onEnd: function(){
            if (!live || pl.state === 'held') return;
            a.face = b && b.x > a.x ? 1 : -1;
            a.trick = { kind: 'cheer', t0: performance.now(), dur: 300 };
            pl.state = 'arc'; pl.owner = null; pl.arcTo = e.other;
            pl.arcFx = pl.x; pl.arcFy = pl.y; pl.arcT0 = live.vnow; pl.arcDur = e.dur * 0.6 + 40;
            SFX.play('toss');
          } });
        if (b) b.look = { x: pl.x, y: pl.y };
        break;
      }
      case 'catch': {
        if (!a || !pl) break;
        var catchNow = function(){
          if (!live || pl.state === 'held' || pl.state === 'gone') return;
          if (pl.state === 'idle'){ hopInto(pl, a, 'mouth', 240, live.vnow); return; }
          takeHold(a, pl, 'mouth'); SFX.play('catch'); setExpr(a, 'happy', 500);
          a.trick = { kind: 'cheer', t0: live.vnow, dur: 300 };
        };
        if (pl.state === 'arc'){
          var left = pl.arcT0 + pl.arcDur - t;
          setTimeout(catchNow, Math.max(0, left) / timeScale);
        } else catchNow();
        break;
      }
      case 'grab': {
        if (!a || !pl) break;
        if (pl.y < ground - pl.h * 1.4) dropToGround(pl);
        var other = live.plan.events.filter(function(q){ return q.kind === 'grab' && q.letter === e.letter && q.char !== e.char; })[0];
        var sideG = other && e.char < other.char ? -1 : 1;
        var gy = pl.state === 'free' ? ground - pl.h * 0.5 - 6 : pl.y;
        var mouthDx = 186 * K - SIZE / 2;
        move(a, t, e.dur, { x: pl.x - SIZE / 2 + sideG * (mouthDx + pl.w * 0.3), y: sy0 }, { ease: 'out', effort: 0.8, face: -sideG,
          onEnd: function(){
            if (!live) return;
            pl.state = 'tugged'; pl.tugA = pl.tugA || e.char; if (pl.tugA !== e.char) pl.tugB = e.char;
            if (!pl.tugB) pl.tugB = e.char;
          } });
        pl.x = pl.x; pl.groundY = gy;
        break;
      }
      case 'tug': {
        if (!a) break;
        var o2 = actors[e.other];
        live.tugging = true;
        [a, o2].forEach(function(q){
          if (!q) return;
          setExpr(q, 'oops', e.dur, t);
          var back = -q.face;
          move(q, t, e.dur / 2, { x: q.x + back * 16, y: q.y }, { ease: 'inout', rotTo: -10, keepFace: true, effort: 1,
            next: { dur: e.dur / 2, to: { x: q.x + back * 6, y: q.y }, opts: { ease: 'inout', rotTo: -4, keepFace: true, effort: 1 } } });
        });
        SFX.play('strain');
        break;
      }
      case 'pop': {
        if (!pl) break;
        live.tugging = false;
        burst(pl.x, pl.y);
        pl.state = 'free'; pl.owner = null; pl.sx = 1;
        pl.groundY = ground - pl.h * 0.5 - 6;
        pl.vx = rnd(-0.05, 0.05); pl.vy = -1.05; pl.spin = 0.5;
        SFX.play('pop');
        break;
      }
      case 'fall': {
        if (!a) break;
        a.fallen = 1;
        setExpr(a, 'oops', e.dur + 500, t);
        move(a, t, e.dur, { x: a.x - a.face * 40, y: sy0 + 20 }, { ease: 'out', rotTo: -60, keepFace: true, effort: 1 });
        dust(a.x + SIZE / 2, ground, 6);
        SFX.play('thud');
        break;
      }
      case 'getup': {
        if (!a) break;
        a.fallen = 0;
        move(a, t, e.dur, { x: a.x, y: sy0 }, { ease: 'back', rotTo: 0, keepFace: true, effort: 0.4 });
        SFX.play('dust');
        break;
      }
      case 'carry': {
        if (!a || !pl) break;
        if (pl.state === 'held' || pl.state === 'gone') break;
        if (!C.CHARS[a.key].airborne && pl.y < ground - pl.h * 1.4) dropToGround(pl);
        var where = { rex:'mouth', trike:'horns', dash:'arms', swoop:'feet' }[a.kind];
        var besideP = beside(pl, a, pl.x > a.x + SIZE / 2 ? -1 : 1);
        if (!C.CHARS[a.key].airborne) besideP.y = sy0;
        var goDur = e.dur * 0.45;
        a.look = { x: pl.x, y: pl.y };
        move(a, t, goDur, besideP, { ease: 'out', effort: 0.7,
          onEnd: function(){
            if (!live) return;
            if (pl.state !== 'held' && pl.state !== 'gone') hopInto(pl, a, where, 180, live.vnow);
            setExpr(a, 'happy', 500);
          },
          next: { dur: e.dur * 0.55 + 300, to: edgeFor(e.dir || 'left', a), opts: { ease: 'inout', effort: 0.8 } } });
        break;
      }
      case 'parade': {
        if (!a) break;
        var dirSign = sx;
        var gap = Math.max(52, (live.payloads[0] ? live.payloads[0].w : 60) * 0.95);
        var n4 = live.payloads.length;
        var frontX = clamp(vw() / 2 + dirSign * (n4 + 1) * gap / 2, SIZE * 0.5, vw() - SIZE * 0.5);
        live.parade = { dirSign: dirSign, gap: gap };
        move(a, t, 560, { x: frontX - SIZE / 2, y: hoverY(ground, a.kind) }, { ease: 'back', effort: 0.6, face: dirSign });
        a.trick = { kind: 'cheer', t0: t + 560, dur: e.dur - 560 };
        setExpr(a, 'happy', e.dur, t);
        live.payloads.forEach(function(q, i){
          q.state = 'lined'; q.owner = null;
          q.fx = q.x; q.fy = q.y; q.frot = q.rot;
          /* the word reads left to right behind the leader, either way he marches */
          var slotP = dirSign > 0 ? n4 - 1 - i : i;
          q.paradeSlot = slotP;
          q.tx = frontX - dirSign * (slotP + 1) * gap; q.ty = ground - q.h * 0.5 - 6;
          q.t0 = t + i * 90; q.dur = 620;
        });
        SFX.play('whistle');
        break;
      }
      case 'march': {
        if (!a || !live.parade) break;
        var pd = live.parade, dist = (live.payloads.length + 2) * pd.gap + SIZE;
        move(a, t, e.dur, { x: pd.dirSign > 0 ? vw() + dist : -dist - SIZE, y: a.y }, { ease: 'linear', effort: 0.7 });
        SFX.play('march');
        break;
      }
      case 'follow': {
        if (!pl || !live.parade) break;
        pl.state = 'following'; pl.owner = e.leader;
        pl.dirSign = live.parade.dirSign; pl.gap = live.parade.gap; pl.slot = pl.paradeSlot == null ? pl.idx : pl.paradeSlot;
        pl.ty = ground - pl.h * 0.5 - 6;
        break;
      }
      case 'cheer': {
        if (!a) break;
        a.trick = { kind: 'cheer', t0: t, dur: e.dur };
        setExpr(a, 'happy', e.dur + 200, t);
        move(a, t, e.dur, { x: a.x, y: a.y }, { ease: 'linear', arc: 40, rotTo: 0, effort: 0.4, keepFace: true });
        SFX.play('cheer');
        break;
      }
      case 'exit': {
        if (!a) break;
        a.fallen = 0;
        setExpr(a, 'happy', e.dur, t);
        move(a, t, e.dur, edgeFor(e.dir || 'right', a), { op: 0, ease: 'inout', effort: 0.7, rotTo: 0 });
        break;
      }
    }
  }

  /* ---------- the rocket ship ---------- */
  var SHIP_SVG = '<svg viewBox="0 0 190 140" aria-hidden="true">' +
    '<ellipse cx="95" cy="92" rx="88" ry="26" fill="#2F7BF5" stroke="#0B2A66" stroke-width="5"/>' +
    '<ellipse cx="95" cy="84" rx="70" ry="16" fill="#5DB0FF"/>' +
    '<path d="M50 80 Q52 30 95 22 Q138 30 140 80 Z" fill="#BFE6FF" stroke="#0B2A66" stroke-width="5" opacity=".95"/>' +
    '<path d="M70 50 Q80 34 98 32" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/>' +
    '<circle cx="40" cy="96" r="7" fill="#FFC53D" class="shiplight"/><circle cx="95" cy="104" r="7" fill="#FF8A1F" class="shiplight"/><circle cx="150" cy="96" r="7" fill="#FFC53D" class="shiplight"/>' +
  '</svg>';
  function showShip(t, dur){
    if (live.ship) return;
    var el = document.createElement('div'); el.className = 'ship'; el.innerHTML = SHIP_SVG;
    var beam = document.createElement('div'); beam.className = 'beam';
    layer.insertBefore(beam, layer.firstChild);
    layer.appendChild(el);
    live.ship = { el: el, beam: beam, x: vw() / 2, y: -160, ty: Math.max(24, vh() * 0.06), t0: t, dur: dur, leaving: false };
  }
  function hideShip(t, dur){ if (live.ship){ live.ship.leaving = true; live.ship.t0 = t; live.ship.dur = dur; } }
  function stepShip(t){
    var s = live && live.ship;
    if (!s) return;
    var p = clamp01((t - s.t0) / s.dur);
    if (!s.leaving) s.y = lerp(-160, s.ty, easeOut(p)) + Math.sin(t / 300) * 4;
    else s.y = lerp(s.ty, -260, easeIn(p));
    s.el.style.transform = 'translate3d(' + Math.round(s.x - 95) + 'px,' + Math.round(s.y) + 'px,0)';
    var bOn = !s.leaving && p > 0.6 ? 1 : (s.leaving ? Math.max(0, 1 - p * 3) : 0);
    s.beam.style.opacity = bOn * (0.75 + Math.sin(t / 90) * 0.1);
    s.beam.style.left = Math.round(s.x - 120) + 'px'; s.beam.style.width = '240px';
    s.beam.style.top = Math.round(s.y + 104) + 'px'; s.beam.style.height = Math.max(0, live.groundY - s.y - 104) + 'px';
  }

  /* ---------- the loop ---------- */
  function frame(now){
    if (!live) return;
    var vnow = live.t0 + (now - live.t0) * timeScale;
    var t = vnow - live.t0, dt = Math.min(48, (now - live.last) * timeScale);
    live.last = now; live.vnow = vnow;
    var ev = live.plan.events;
    for (var i = 0; i < ev.length; i++){
      if (live.fired[i] || ev[i].at > t) continue;
      live.fired[i] = 1;
      try { fire(ev[i], vnow); } catch (err){ live.errors.push(ev[i].kind + ': ' + (err && err.message || err)); }
    }
    for (var k in actors){
      var a = actors[k];
      stepActor(a, vnow, dt);
      a.bob = 0;
      /* waiting is not freezing: a small weight-shift while he stands by */
      if (!a.anim && a.op > 0.5 && !a.fallen && Math.abs(a.rot) < 4) a.rot = Math.sin(vnow / 480 + a.key.length) * 2.6;
      poseActor(a, vnow, live.groundY);
      writeActor(a); writeShadow(a, live.groundY); emit(a, now, live.groundY);
    }
    for (var j = 0; j < live.payloads.length; j++){ stepPayload(live.payloads[j], vnow, dt); writePayload(live.payloads[j]); }
    stepShip(vnow);
    if (live.shake > 0.4){
      var s = live.shake;
      layer.style.transform = 'translate3d(' + ((Math.random() - 0.5) * s).toFixed(1) + 'px,' + ((Math.random() - 0.5) * s).toFixed(1) + 'px,0)';
      live.shake *= 0.86;
    } else if (layer.style.transform){ layer.style.transform = ''; live.shake = 0; }
    if (live.onShake) live.onShake(live.shake);
    if (t >= live.plan.duration + 500 || now >= live.deadline){ finish(); return; }
    live.raf = requestAnimationFrame(frame);
  }

  function parkActor(a){
    a.anim = null; a.op = 0; a.x = -600; a.y = -600; a.rot = 0; a.sc = 1; a.roll = 1; a.bob = 0;
    a.fallen = 0; a.effort = 0; a.look = null; a.trick = null; a.jaw = 0;
    a.el.classList.remove('tappable');
    setExpr(a, null);
    writeActor(a);
    a.shadow.style.opacity = 0;
  }
  function teardown(){
    if (!live) return null;
    var l = live;
    if (l.raf) cancelAnimationFrame(l.raf);
    if (l.guard) clearTimeout(l.guard);
    live = null;
    l.payloads.forEach(function(p){ if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el); });
    if (l.ship){ [l.ship.el, l.ship.beam].forEach(function(n){ if (n.parentNode) n.parentNode.removeChild(n); }); }
    clearParticles();
    for (var k in actors) parkActor(actors[k]);
    if (layer) layer.style.transform = '';
    if (l.onShake) l.onShake(0);
    return l;
  }
  function finish(){ var l = teardown(); if (l && l.resolve) l.resolve(l.errors); }

  /* play a plan against a row of letter elements; resolves whatever happens */
  function play(plan, letterEls, opts){
    opts = opts || {};
    var els = Array.prototype.slice.call(letterEls || []);
    if (!on || !plan || !plan.events.length || !els.length){
      els.forEach(function(e){ e.classList.add('taken'); });
      return Promise.resolve([]);
    }
    stopAmbient();
    if (live) finish();
    init(opts.layer);
    var payloads = els.map(function(el, i){ return makePayload(el, i); });
    var entryFor = {};
    C.CHAR_ORDER.forEach(function(k, i){
      var side = C.CHARS[k].airborne ? (['left', 'right', 'up'])[(i + plan.letters) % 3] : (i % 2 ? 'right' : 'left');
      if (plan.mirror && side !== 'up') side = side === 'left' ? 'right' : 'left';
      entryFor[k] = side;
    });
    var ground = opts.groundY != null ? opts.groundY : vh() - 40;
    var budget = plan.duration / timeScale;
    return new Promise(function(resolve){
      var settled = false;
      function once(errs){ if (settled) return; settled = true; resolve(errs || []); }
      live = {
        plan: plan, payloads: payloads, fired: [], errors: [], t0: performance.now(), last: performance.now(), vnow: performance.now(),
        deadline: performance.now() + budget + 3500, groundY: ground, dust: opts.dust || null, entryFor: entryFor,
        resolve: once, raf: null, shake: 0, guard: null, ship: null, parade: null, tugging: false, onShake: opts.onShake || null, arrivals: 0
      };
      live.raf = requestAnimationFrame(frame);
      live.guard = setTimeout(function(){ if (settled) return; finish(); once(['stall guard fired']); }, budget + 3900);
    });
  }
  function stop(restore){
    var l = teardown();
    if (l && restore) l.payloads.forEach(function(p){ if (p.src) p.src.classList.remove('taken'); });
    if (l && l.resolve) l.resolve(['aborted']);
  }

  /* ============================================================
     AMBIENT — the crew hanging out on the planet between scenes.
     They wander with personal space, show off their own tricks, get over
     each other in their own ways (Rex jets over, Swoop flies over, Dash
     leaps over, and Trike — stubborn — walks right into you and sits
     down), look at what the child taps, cheer, shrug, wave and hop.
     ============================================================ */
  function startAmbient(o){
    o = o || {};
    if (!on) return;
    init(o.layer);
    if (live) return;
    stopAmbient();
    var keys = (o.keys || C.CHAR_ORDER).filter(function(k){ return !!actors[k]; });
    var left = o.left == null ? 6 : o.left, right = o.right == null ? vw() - 6 : o.right;
    amb = {
      keys: keys, groundY: o.groundY, left: left, right: right, lineup: !!o.lineup, dust: o.dust || null,
      onTap: o.onTap || null, busy: {}, next: {}, home: {}, last: performance.now(),
      ceil: o.ceil == null ? null : o.ceil
    };
    /* as big as the width allows (bigger on a tablet), but never taller than
       the room under the card: a buddy must not stand in front of the answers */
    var fitW = ((right - left) / keys.length) / 135;
    var fitH = amb.ceil == null ? 2 : (amb.groundY - amb.ceil - 4) / (SIZE * 0.9);
    amb.sc = clamp(Math.min(fitW, fitH), 0.5, vw() >= 700 ? 1.35 : 1);
    var span = right - left, n = keys.length;
    keys.forEach(function(k, i){
      var a = actors[k];
      parkActor(a);
      a.el.classList.add('tappable');
      var slot = left + span * (n === 1 ? 0.5 : (0.13 + 0.74 * i / (n - 1)));
      slot = clamp(slot, left + SIZE * 0.36, right - SIZE * 0.36);
      var fromLeft = slot < vw() / 2;
      a.x = fromLeft ? -SIZE - 20 : vw() + 20; a.y = restY(a); a.sc = amb.sc; a.op = 1;
      a.face = fromLeft ? 1 : -1; a.faceCur = a.face;
      move(a, performance.now() + i * 240, 900 + i * 120, { x: slot - SIZE / 2, y: restY(a), sc: amb.sc }, { ease: 'back', effort: 0.7 });
      amb.home[k] = slot;
      amb.next[k] = performance.now() + 1800 + Math.random() * 2600 + i * 500;
    });
    ambRaf = requestAnimationFrame(ambFrame);
  }
  function restY(a){
    var g = amb ? amb.groundY : vh() - 30, k = amb ? amb.sc : 1;
    var y = g - SIZE / 2 - SIZE * (FEET - 0.5) * k;
    if (a.kind === 'swoop'){
      var lift = 64 * k;
      if (amb && amb.ceil != null) lift = clamp(amb.groundY - amb.ceil - SIZE * 0.9 * k - 4, 0, lift);
      y -= lift;
    }
    return y;
  }
  /* how far above its resting spot an ambient buddy may rise before its head
     reaches the card (unlimited when there is no card to protect) */
  function headroom(a){
    if (!amb || amb.ceil == null) return Infinity;
    return Math.max(0, restY(a) + SIZE / 2 - SIZE * (a.kind === 'swoop' ? 0.5 : 0.46) * amb.sc - amb.ceil);
  }
  function stopAmbient(){
    if (ambRaf) cancelAnimationFrame(ambRaf);
    ambRaf = null;
    if (!amb) return;
    var keys = amb.keys;
    amb = null;
    if (!live){ keys.forEach(function(k){ parkActor(actors[k]); }); clearParticles(); }
    else keys.forEach(function(k){ actors[k].el.classList.remove('tappable'); });
  }
  function others(a){ return amb.keys.filter(function(k){ return k !== a.key; }).map(function(k){ return actors[k]; }); }
  function freeSpot(a, propose, lo, hi){
    var need = SIZE * 0.62 * amb.sc, best = null, bestGap = -1;
    for (var i = 0; i < 8; i++){
      var x = clamp(propose(), lo, hi), gap = Infinity;
      others(a).forEach(function(o){ gap = Math.min(gap, Math.abs((o.anim ? o.anim.tx : o.x) - x)); });
      if (gap >= need) return x;
      if (gap > bestGap){ bestGap = gap; best = x; }
    }
    return best == null ? clamp(a.x, lo, hi) : best;
  }
  function blocker(a, toX){
    var lo = Math.min(a.x, toX), hi = Math.max(a.x, toX);
    var list = others(a).filter(function(o){ return o.op > 0.5 && o.x > lo - SIZE * 0.3 && o.x < hi + SIZE * 0.3; });
    list.sort(function(p, q){ return Math.abs(p.x - a.x) - Math.abs(q.x - a.x); });
    return list[0] || null;
  }
  function ambWander(a, now){
    var lo = amb.left - SIZE * 0.14, hi = amb.right - SIZE * 0.86, span = amb.right - amb.left;
    var tx = freeSpot(a, function(){ return amb.lineup ? amb.home[a.key] - SIZE / 2 + rnd(-26, 26) : amb.left + Math.random() * span - SIZE / 2; }, lo, hi);
    var speed = { rex: 0.24, trike: 0.18, dash: 0.42, swoop: 0.3 }[a.kind];
    var dur = clamp(Math.abs(tx - a.x) / speed, 500, 3200);
    var ob = blocker(a, tx), y = restY(a);
    if (ob && a.kind === 'trike' && Math.random() < 0.7){
      var stopX = ob.x + (a.x < ob.x ? -SIZE * 0.45 : SIZE * 0.45) * amb.sc;
      a.look = centreOf(ob);
      move(a, now, clamp(Math.abs(stopX - a.x) / speed, 300, 2400), { x: stopX, y: y, sc: amb.sc }, { ease: 'inout', effort: 0.6,
        onEnd: function(){
          if (!amb) return;
          var t2 = performance.now();
          a.fallen = 1; setExpr(a, 'oops', 1400, t2); setExpr(ob, 'wow', 900, t2); ob.look = centreOf(a);
          ob.face = a.x < ob.x ? -1 : 1;
          SFX.play('bonk'); dust(a.x + SIZE / 2, amb.groundY, 5);
          var back = a.x + (a.x < ob.x ? -30 : 30);
          move(a, t2, 520, { x: back, y: y + 16, sc: amb.sc }, { rotTo: -50, ease: 'out', keepFace: true, effort: 1,
            next: { dur: 700, to: { x: back, y: y, sc: amb.sc }, opts: { rotTo: 0, ease: 'back', keepFace: true, effort: 0.4 } } });
          setTimeout(function(){ a.fallen = 0; }, 560);
          SFX.play('thud');
          amb.busy[a.key] = t2 + 1400;
        } });
      return dur;
    }
    var opts = { ease: 'inout', effort: 0.6 };
    if (ob){
      a.look = centreOf(ob);
      opts.arc = { rex: 110, dash: 90, swoop: 120, trike: 50 }[a.kind];
      if (a.kind === 'dash') opts.rotTo = 10;
      SFX.play({ rex: 'jet', dash: 'boing', swoop: 'flap', trike: 'stomp' }[a.kind]);
      setExpr(ob, 'wow', dur, now); ob.look = centreOf(a);
    }
    move(a, now, dur, { x: tx, y: y, sc: amb.sc }, opts);
    return dur;
  }
  function ambTrick(a, now){
    var y = restY(a), pick = Math.random();
    switch (a.kind){
      case 'rex':
        if (pick < 0.5){
          a.trick = { kind: 'roar', t0: now, dur: 900 }; a.jaw = 1; a.jawUntil = now + 700;
          setExpr(a, 'roar', 900, now);
          var m = artPoint(a, 186, 96); ring(m.x, m.y, false);
          SFX.play('roarsmall');
          return 1000;
        }
        setExpr(a, 'happy', 900, now);
        move(a, now, 520, { x: a.x, y: y - 70, sc: amb.sc }, { ease: 'out', effort: 1,
          next: { dur: 520, to: { x: a.x, y: y, sc: amb.sc }, opts: { ease: 'in', effort: 0.6 } } });
        SFX.play('jet');
        return 1100;
      case 'trike':
        if (pick < 0.5){
          a.trick = { kind: 'paw', t0: now, dur: 800 };
          var f = artPoint(a, 124, 188); dust(f.x, amb.groundY, 5, 36);
          SFX.play('snort');
          return 900;
        }
        setExpr(a, 'roar', 700, now);
        move(a, now, 320, { x: a.x, y: y - 20, sc: amb.sc }, { ease: 'out', rotTo: -16, effort: 1, keepFace: true,
          next: { dur: 200, to: { x: a.x, y: y, sc: amb.sc }, opts: { ease: 'in', rotTo: 0, keepFace: true,
            onEnd: function(){ var fp = artPoint(a, 120, 190); ring(fp.x, amb ? amb.groundY : y, false); if (amb) dust(fp.x, amb.groundY, 8, 50); SFX.play('stomp'); } } } });
        return 900;
      case 'dash': {
        var lo = amb.left - SIZE * 0.14, hi = amb.right - SIZE * 0.86;
        var tx = amb.lineup ? amb.home[a.key] - SIZE / 2 : freeSpot(a, function(){ return a.x < vw() / 2 ? hi - rnd(0, 60) : lo + rnd(0, 60); }, lo, hi);
        setExpr(a, 'happy', 900, now);
        if (amb.lineup){
          move(a, now, 700, { x: a.x, y: y, sc: amb.sc }, { spins: a.face, arc: 80, ease: 'inout', effort: 1, keepFace: true });
          SFX.play('spin'); return 900;
        }
        move(a, now, 520, { x: tx, y: y, sc: amb.sc }, { ease: 'inout', effort: 1, rotTo: 8,
          next: { dur: 300, to: { x: tx + (tx > a.x ? 18 : -18), y: y, sc: amb.sc }, opts: { ease: 'out', rotTo: 0, keepFace: true } } });
        SFX.play('zoom');
        return 1000;
      }
      case 'swoop': {
        var cx0 = a.x, cy0 = y, R = Math.min(50 * amb.sc, headroom(a) / 2);
        setExpr(a, 'happy', 900, now);
        move(a, now, 900, { x: cx0, y: cy0, sc: amb.sc }, { effort: 1, ease: 'inout', spins: -a.face,
          path: function(ep){ return { x: cx0 + Math.sin(ep * Math.PI * 2) * R * a.face, y: cy0 - (1 - Math.cos(ep * Math.PI * 2)) * R }; } });
        SFX.play('loop');
        return 1000;
      }
    }
    return 800;
  }
  function ambFrame(now){
    if (!amb){ ambRaf = null; return; }
    if (live){ ambRaf = requestAnimationFrame(ambFrame); return; }
    var dt = Math.min(48, now - amb.last);
    amb.last = now;
    amb.keys.forEach(function(k, i){
      var a = actors[k];
      if (!a.anim && now >= (amb.busy[k] || 0) && now >= amb.next[k]){
        var r = Math.random(), took;
        if (r < 0.5) took = ambWander(a, now);
        else if (r < 0.82) took = ambTrick(a, now);
        else { a.look = pickLook(a); if (a.look) a.face = a.look.x > a.x + SIZE / 2 ? 1 : -1; took = 900; }
        amb.next[k] = now + took + rnd(1400, 4000);
      }
      stepActor(a, now, dt);
      a.bob = a.anim ? 0 : (a.kind === 'swoop' ? Math.sin(now / 380 + i) * 6 : Math.sin(now / 620 + i) * 1.2);
      poseActor(a, now, amb.groundY);
      writeActor(a); writeShadow(a, amb.groundY); emit(a, now, amb.groundY);
    });
    ambRaf = requestAnimationFrame(ambFrame);
  }
  function pickLook(a){
    var list = others(a);
    if (list.length && Math.random() < 0.6) return centreOf(list[Math.floor(Math.random() * list.length)]);
    return { x: rnd(0, vw()), y: rnd(0, vh() * 0.6) };
  }
  function onActorTap(a, ev){
    if (!amb || live || amb.keys.indexOf(a.key) === -1) return;
    if (ev && ev.preventDefault) ev.preventDefault();
    var now = performance.now();
    SFX.play('giggle');
    a.look = null;
    amb.busy[a.key] = now + ambTrick(a, now);
    amb.next[a.key] = amb.busy[a.key] + rnd(1200, 2600);
    if (amb.onTap){ try { amb.onTap(a.key); } catch (err){} }
  }
  function react(kind, point){
    if (!amb || live) return;
    var now = performance.now();
    amb.lastReact = { kind: kind, at: now };
    if (kind === 'wave' || kind === 'hop'){
      var free = amb.keys.filter(function(k){ return !actors[k].fallen && (kind === 'wave' || now >= (amb.busy[k] || 0)); });
      if (!free.length) return;
      var h = actors[free[Math.floor(Math.random() * free.length)]];
      h.look = point || null;
      if (point) h.face = point.x > h.x + SIZE / 2 ? 1 : -1;
      if (kind === 'wave'){ h.trick = { kind: 'cheer', t0: now, dur: 1300 }; setExpr(h, 'wow', 700, now); amb.busy[h.key] = now + 1400; }
      else {
        setExpr(h, 'happy', 800, now);
        move(h, now, 460, { x: h.x, y: restY(h), sc: amb.sc }, { arc: 30, ease: 'linear', keepFace: true, effort: 0.6 });
        amb.busy[h.key] = now + 500;
      }
      return;
    }
    amb.keys.forEach(function(k, i){
      var a = actors[k];
      if (a.fallen) return;
      if (kind === 'look'){ a.look = point || null; if (point && !a.anim) a.face = point.x > a.x + SIZE / 2 ? 1 : -1; return; }
      var delay = i * 90;
      if (kind === 'cheer'){
        a.look = null;
        a.trick = { kind: 'cheer', t0: now + delay, dur: 700 };
        setExpr(a, 'happy', 1300, now);
        move(a, now + delay, 700, { x: a.x, y: restY(a), sc: amb.sc }, { arc: a.kind === 'swoop' ? 60 : 50, ease: 'linear', keepFace: true, effort: 1,
          spins: a.kind === 'dash' ? a.face : 0 });
        amb.busy[k] = now + delay + 800;
      } else if (kind === 'oops'){
        setExpr(a, 'oops', 1000, now);
        move(a, now + delay, 600, { x: a.x, y: restY(a), sc: amb.sc }, { ease: 'inout', rotTo: 0, keepFace: true, effort: 0.3,
          path: function(ep){ return { x: a.anim ? a.anim.fx + Math.sin(ep * Math.PI * 4) * 6 : a.x, y: restY(a) }; } });
        amb.busy[k] = now + delay + 950;
      }
    });
  }

  return {
    init: init, play: play, stop: stop,
    idle: function(){ return !live; },
    enabled: function(){ return on; },
    setEnabled: function(v){ on = !!v; if (!on){ stop(false); stopAmbient(); } },
    setTimeScale: function(v){ timeScale = clamp(Number(v) || 1, 0.25, 8); },
    actors: function(){ return actors; },
    ambient: { start: startAmbient, stop: stopAmbient, react: react, active: function(){ return !!amb; }, lastReact: function(){ return amb && amb.lastReact || null; } },
    debug: function(){
      if (!live) return null;
      return { id: live.plan.id, t: (performance.now() - live.t0) * timeScale,
               states: live.payloads.map(function(p){ return p.state; }), errors: live.errors.slice() };
    }
  };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { createStage: createStage };
