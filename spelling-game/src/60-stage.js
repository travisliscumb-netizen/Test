/* ============================================================
   STAGE — the performance engine.

   A scene plan (pure data, from 20-core.js) is executed here against a
   requestAnimationFrame clock. rAF rather than keyframes because a tow cord
   joins two independently moving points: no keyframe can express "the
   letter does not move until the slack runs out".

   Everything has an explicit state. A letter is idle, held, roped, stacked,
   free, lined up, following or gone, and it can only ever be in one of
   them. A letter is never deleted to make it go away — it is carried, towed,
   popped or dropped, and the child can see which.

   Cleanup is unconditional. Whatever happens — the scene ends, the child
   taps Back, the tab is hidden, a device drops frames, an event handler
   throws — teardown() runs, every prop and particle is removed and every
   actor is parked. Two independent stall guards back it up: the frame loop
   checks a wall-clock deadline, and the returned promise races a timer of
   its own. Either alone is enough to unfreeze the game.

   Between scenes the same four actors live on the ground as BUDDIES
   (see "ambient" below): they wander, show off, hop over each other, look
   at what the child is tapping and react to right and wrong answers. One
   rAF loop drives both; a scene always takes precedence.
   ============================================================ */
function createStage(deps){
  deps = deps || {};
  var C = deps.core;
  var SFX = deps.sfx || { play: function(){} };
  var layer = null, cordSvg = null;
  var actors = {}, live = null, inited = false;
  var on = deps.enabled !== false;
  var timeScale = 1;
  var fxNodes = [];          /* every particle alive, so teardown can reach it */
  var amb = null;            /* ambient buddy state, when active */
  var ambRaf = null;

  var SIZE = 148;          /* actor box, px; the drawn body is ~56% of it */
  var REST = 110;          /* cord length: slack until he travels this far */
  var GRAV = 0.0021;       /* px per ms^2 */
  var ART = 148 / 232;     /* svg units -> px inside the actor box */
  var ART_DY = (148 - 214 * ART) / 2;

  /* ---------- easing ---------- */
  function clamp01(v){ return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function clamp(v, lo, hi){ return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t){ return a + (b - a) * t; }
  function easeOut(t){ return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t){ return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  /* arrival with a little overshoot, so a stop reads as weight not a cut */
  function easeBack(t){ var c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  /* anticipation: wind up the wrong way before committing */
  function easeAnticipate(t){
    if (t < 0.18) return -0.10 * Math.sin((t / 0.18) * Math.PI);
    var u = (t - 0.18) / 0.82;
    return easeBack(u);
  }
  /* a taut cord jolt */
  function easeSnap(t){
    if (t >= 1) return 1;
    return 1 - Math.pow(2, -9 * t) * Math.cos(t * 13);
  }
  function linear(t){ return t; }
  var EASES = { out:easeOut, inout:easeInOut, back:easeBack, anticipate:easeAnticipate, snap:easeSnap, linear:linear };

  function vw(){ return window.innerWidth; }
  function vh(){ return window.innerHeight; }
  function rnd(a, b){ return a + Math.random() * (b - a); }

  /* ---------- setup ---------- */
  function init(el){
    layer = el || layer;
    if (!layer || inited) return;
    inited = true;
    cordSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    cordSvg.setAttribute('class', 'cordlayer');
    cordSvg.setAttribute('aria-hidden', 'true');
    layer.appendChild(cordSvg);               /* first: cords sit behind everyone */

    C.CHAR_ORDER.forEach(function(key, i){
      var sh = document.createElement('div');
      sh.className = 'shadow';
      layer.appendChild(sh);

      var d = document.createElement('div');
      d.className = 'actor actor-' + key;
      d.id = 'actor-' + key;
      d.setAttribute('data-key', key);
      d.innerHTML = deps.art[key]();
      /* everyone blinks, but never in unison */
      d.style.setProperty('--blink-delay', (-(i * 1.37 + Math.random() * 2)).toFixed(2) + 's');
      d.style.setProperty('--blink-dur', (3.6 + i * 0.7 + Math.random()).toFixed(2) + 's');
      layer.appendChild(d);
      var a = {
        key: key, el: d, shadow: sh, mode: C.CHARS[key].mode,
        x: -600, y: -600, sc: 1, scx: 1, rot: 0, op: 0, bob: 0,
        anim: null, phase: 0, effort: 0, fallen: 0, holding: [],
        look: null, expr: null, exprUntil: 0, trick: null, boardless: false,
        rig: collectRig(d)
      };
      actors[key] = a;
      d.addEventListener('pointerdown', function(ev){ onActorTap(a, ev); });
      writeActor(a);
    });
  }

  /* Cache the rig groups and their pivots once, not every frame. */
  function collectRig(root){
    var out = {};
    ['arm-l','arm-r','leg-l','leg-r','head','antenna','board','tail','jet','jet2','eyes'].forEach(function(cls){
      var el = root.querySelector('.' + cls);
      if (!el) return;
      out[cls] = {
        el: el,
        px: Number(el.getAttribute('data-px')) || 100,
        py: Number(el.getAttribute('data-py')) || 100
      };
    });
    out.wheels = Array.prototype.slice.call(root.querySelectorAll('.wheel'));
    return out;
  }

  function rot(part, deg){
    if (!part) return;
    part.el.setAttribute('transform', 'rotate(' + deg.toFixed(1) + ' ' + part.px + ' ' + part.py + ')');
  }

  /* where a point of the drawing sits on screen, ignoring the body's spin */
  function artPoint(a, sx, sy){
    var lx = (sx + 16) * ART, ly = sy * ART + ART_DY;
    var cx = SIZE / 2;
    return { x: a.x + cx + (lx - cx) * a.sc * a.scx, y: a.y + cx + (ly - cx) * a.sc };
  }
  function centreOf(a){ return { x: a.x + SIZE / 2, y: a.y + SIZE * 0.52 }; }

  /* ---------- expressions: reactions, not moods ---------- */
  var EXPRS = ['happy', 'wow', 'oops'];
  function setExpr(a, ex, ms, t){
    if (!a) return;
    var now = t == null ? performance.now() : t;
    a.expr = ex;
    a.exprUntil = ex ? now + (ms || 900) : 0;
    for (var i = 0; i < EXPRS.length; i++){
      a.el.classList.toggle('ex-' + EXPRS[i], EXPRS[i] === ex);
    }
  }
  function tickExpr(a, now){
    if (a.expr && now >= a.exprUntil) setExpr(a, null, 0, now);
  }

  /* ---------- particles ---------- */
  function particle(cls, x, y, dx, dy, dur, s0, s1, color){
    if (!layer || fxNodes.length > 70) return;
    var p = document.createElement('div');
    p.className = 'fx ' + cls;
    p.style.left = Math.round(x) + 'px';
    p.style.top = Math.round(y) + 'px';
    if (color) p.style.background = color;
    layer.appendChild(p);
    fxNodes.push(p);
    function gone(){
      var i = fxNodes.indexOf(p);
      if (i !== -1) fxNodes.splice(i, 1);
      if (p.parentNode) p.parentNode.removeChild(p);
    }
    try {
      var anim = p.animate([
        { transform: 'translate(-50%,-50%) translate(0,0) scale(' + s0 + ')', opacity: 0.95 },
        { transform: 'translate(-50%,-50%) translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(' + s1 + ')', opacity: 0 }
      ], { duration: dur, easing: 'cubic-bezier(.2,.7,.3,1)' });
      anim.onfinish = gone;
      anim.oncancel = gone;
    } catch (err){ setTimeout(gone, dur); }
  }
  function clearParticles(){
    fxNodes.slice().forEach(function(p){ if (p.parentNode) p.parentNode.removeChild(p); });
    fxNodes = [];
  }
  function dust(x, y, n, spread){
    for (var i = 0; i < n; i++){
      var ang = Math.PI + Math.random() * Math.PI;
      var r = rnd(18, spread || 46);
      particle('dust', x + rnd(-8, 8), y - 4, Math.cos(ang) * r, Math.sin(ang) * r * 0.45 - 6, rnd(420, 700), 0.6, 1.7);
    }
  }
  function sparkle(x, y, n){
    var colors = ['#FFC53D', '#FF8A1F', '#FFFFFF', '#5DB0FF'];
    for (var i = 0; i < n; i++){
      var ang = Math.random() * Math.PI * 2, r = rnd(26, 70);
      particle('spark', x, y, Math.cos(ang) * r, Math.sin(ang) * r, rnd(450, 760), 1, 0.2, colors[i % colors.length]);
    }
  }
  var BURST_COLORS = ['#1E6FE8', '#FF8A1F', '#34B764', '#FF4D4D', '#FFC53D'];
  function burst(x, y){
    for (var i = 0; i < 12; i++){
      var ang = (Math.PI * 2 * i) / 12 + Math.random() * 0.4, r = rnd(70, 110);
      particle('shard', x, y, Math.cos(ang) * r, Math.sin(ang) * r + 40, rnd(560, 760), 1, 0.3, BURST_COLORS[i % 5]);
    }
  }

  /* Each character leaves his own trail — smoke, dust, footfalls, sparkles. */
  function emit(a, now, ground){
    if (a.op < 0.3 || a.fallen > 0) return;
    var moving = !!a.anim;
    a.nextFx = a.nextFx || 0;
    if (now < a.nextFx) return;
    var feet = a.y + SIZE * 0.88;
    var onGround = Math.abs(feet - ground) < 22;
    switch (a.mode){
      case 'jet': {
        if (!moving && Math.random() < 0.6){ a.nextFx = now + 160; return; }
        var n1 = artPoint(a, 39, 188), n2 = artPoint(a, 161, 188);
        var drift = moving ? a.effort : 0.2;
        particle('smoke', n1.x, n1.y, rnd(-8, 8), 22 + drift * 40, rnd(500, 800), 0.5, 1.6 + drift);
        particle('smoke', n2.x, n2.y, rnd(-8, 8), 22 + drift * 40, rnd(500, 800), 0.5, 1.6 + drift);
        a.nextFx = now + (moving ? 70 : 150);
        break;
      }
      case 'board': {
        if (!moving || !onGround || a.boardless){ a.nextFx = now + 120; return; }
        var w = artPoint(a, a.lastDx < 0 ? 143 : 57, 204);
        particle('dust', w.x, w.y, -Math.sign(a.lastDx || 1) * rnd(10, 26), rnd(-10, -2), rnd(320, 520), 0.4, 1.1);
        a.nextFx = now + 90;
        break;
      }
      case 'foot': {
        if (!moving || !onGround){ a.nextFx = now + 120; return; }
        var f = artPoint(a, 100, 190);
        particle('dust', f.x, f.y, -Math.sign(a.lastDx || 1) * rnd(8, 18), -rnd(2, 10), 380, 0.35, 0.9);
        a.nextFx = now + 180;
        break;
      }
      case 'acro': {
        if (!moving || !a.anim || !a.anim.spins){ a.nextFx = now + 120; return; }
        var c = centreOf(a);
        particle('spark', c.x + rnd(-30, 30), c.y + rnd(-30, 30), rnd(-14, 14), rnd(-14, 14), 520, 0.9, 0.2,
          Math.random() < 0.5 ? '#FFC53D' : '#FFFFFF');
        a.nextFx = now + 80;
        break;
      }
    }
  }

  /* ---------- writing ---------- */
  function writeActor(a){
    a.el.style.opacity = a.op;
    a.el.style.transform = 'translate3d(' + Math.round(a.x) + 'px,' + Math.round(a.y + a.bob) + 'px,0) scale(' +
      (a.sc * a.scx).toFixed(3) + ',' + a.sc.toFixed(3) + ') rotate(' + a.rot.toFixed(1) + 'deg)';
  }

  function writeShadow(a, ground){
    var sh = a.shadow;
    if (a.op < 0.05 || ground == null){ sh.style.opacity = 0; return; }
    var feet = a.y + a.bob + SIZE / 2 + SIZE * 0.38 * a.sc;
    var h = Math.max(0, ground - feet);
    var k = clamp(1 - h / 420, 0.3, 1);
    sh.style.opacity = (a.op * 0.34 * k).toFixed(3);
    sh.style.transform = 'translate3d(' + Math.round(a.x + SIZE / 2 - 50) + 'px,' + Math.round(ground - 9) + 'px,0) scale(' + (k * a.sc).toFixed(3) + ',' + (k * a.sc).toFixed(3) + ')';
  }

  function writePayload(p){
    p.el.style.opacity = p.op;
    p.el.style.transform = 'translate3d(' + Math.round(p.x - p.hx) + 'px,' + Math.round(p.y - p.hy) + 'px,0) rotate(' +
      p.rot.toFixed(1) + 'deg) scale(' + p.sc.toFixed(3) + ')';
  }

  /* ---------- per-mode rig posing: this is what stops it looking like
       a sprite being slid across the screen ---------- */
  function poseActor(a, tms){
    var r = a.rig;
    if (!r) return;
    var ph = a.phase;              /* 0..1 through the current move */
    var moving = !!a.anim;
    var beat = tms / 1000;

    /* eyes: look at what he is dealing with, else where he is going */
    if (r.eyes){
      var ex = 0, ey = 0;
      var c = centreOf(a);
      if (a.look){
        var dx = a.look.x - c.x, dy = a.look.y - c.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        ex = dx / d * 5.5; ey = dy / d * 4.5;
      } else if (moving){
        ex = clamp((a.anim.tx - a.anim.fx) / 40, -5.5, 5.5);
        ey = clamp((a.anim.ty - a.anim.fy) / 60, -4, 4);
      } else {
        ex = Math.sin(beat * 0.7 + a.key.length) * 2.2;
      }
      /* the drawing is mirrored when he rolls; the eyes must not be */
      if (a.scx < 0) ex = -ex;
      r.eyes.el.setAttribute('transform', 'translate(' + ex.toFixed(1) + ' ' + ey.toFixed(1) + ')');
    }

    if (a.fallen > 0){
      /* on his backside: legs up, arms out, nothing swinging */
      rot(r['leg-l'], -46 * a.fallen); rot(r['leg-r'], -62 * a.fallen);
      rot(r['arm-l'], 38 * a.fallen); rot(r['arm-r'], -30 * a.fallen);
      rot(r.head, -12 * a.fallen);
      return;
    }

    /* a trick owns the pose while it runs */
    if (a.trick){
      var tp = clamp01((tms - a.trick.t0) / a.trick.dur);
      if (tp >= 1){ a.trick = null; if (r.board) rot(r.board, 0); }
      else if (a.trick.kind === 'kickflip' && r.board){
        var f = Math.cos(tp * Math.PI * 2);
        r.board.el.setAttribute('transform', 'translate(0 ' + (-26 * Math.sin(tp * Math.PI)).toFixed(1) +
          ') translate(100 184) scale(1 ' + f.toFixed(3) + ') rotate(' + (tp * 25).toFixed(1) + ') translate(-100 -184)');
        rot(r['leg-l'], -24 * Math.sin(tp * Math.PI)); rot(r['leg-r'], 24 * Math.sin(tp * Math.PI));
        rot(r['arm-l'], -50); rot(r['arm-r'], 50);
        return;
      }
      else if (a.trick.kind === 'cheer'){
        var up = Math.sin(tp * Math.PI);
        rot(r['arm-l'], 70 * up); rot(r['arm-r'], -70 * up);
        rot(r['leg-l'], -10 * up); rot(r['leg-r'], 10 * up);
        return;
      }
      else if (a.trick.kind === 'shrug'){
        var sp = Math.sin(tp * Math.PI);
        rot(r['arm-l'], -38 * sp); rot(r['arm-r'], 38 * sp);
        rot(r.head, Math.sin(tp * Math.PI * 4) * 9);
        return;
      }
      else if (a.trick.kind === 'wave'){
        rot(r['arm-r'], -60 + Math.sin(tp * Math.PI * 6) * 26);
        rot(r['arm-l'], 6);
        return;
      }
    }

    var mode = a.boardless ? 'foot' : a.mode;
    switch (mode){
      case 'foot': {
        /* a real run cycle: legs alternate, arms counter-swing, head bobs */
        var s = moving ? Math.sin(beat * 15) : Math.sin(beat * 2.2) * 0.18;
        rot(r['leg-l'], s * 30);
        rot(r['leg-r'], -s * 30);
        rot(r['arm-l'], -s * 26 - a.effort * 16);
        rot(r['arm-r'], s * 26 + a.effort * 16);
        rot(r.head, s * 4);
        rot(r.antenna, -s * 16 - a.effort * 10);
        break;
      }
      case 'board': {
        /* legs stay planted; the board and body carve, wheels spin */
        var carve = Math.sin(beat * 6) * (moving ? 7 : 2);
        rot(r.board, carve);
        rot(r['leg-l'], carve * 0.3);
        rot(r['leg-r'], -carve * 0.3);
        rot(r['arm-l'], -18 - carve * 1.4);
        rot(r['arm-r'], 12 + carve * 1.2);
        rot(r.head, carve * 0.4);
        var spin = (beat * (moving ? 900 : 90)) % 360;
        for (var i = 0; i < r.wheels.length; i++){
          var w = r.wheels[i];
          w.setAttribute('transform', 'rotate(' + spin.toFixed(0) + ' ' +
            w.getAttribute('cx') + ' ' + w.getAttribute('cy') + ')');
        }
        break;
      }
      case 'jet': {
        /* limbs trail behind the thrust; flame length tracks effort */
        var trail = moving ? 26 : 8 + Math.sin(beat * 3) * 3;
        rot(r['leg-l'], trail); rot(r['leg-r'], trail * 0.8);
        rot(r['arm-l'], -trail * 0.7); rot(r['arm-r'], -trail * 0.5);
        rot(r.antenna, -trail * 0.5 + Math.sin(beat * 5) * 4);
        var flick = 0.7 + a.effort * 0.9 + Math.sin(beat * 40) * 0.12;
        [r.jet, r.jet2].forEach(function(j){
          if (!j) return;
          j.el.setAttribute('transform',
            'translate(' + j.px + ' ' + j.py + ') scale(1 ' + Math.max(0.12, flick).toFixed(2) + ') translate(' + (-j.px) + ' ' + (-j.py) + ')');
        });
        break;
      }
      case 'acro': {
        /* limbs extend through a rotation, the headband tail trails it */
        var ext = moving ? Math.sin(ph * Math.PI) : 0.2;
        rot(r['arm-l'], -34 * ext); rot(r['arm-r'], 34 * ext);
        rot(r['leg-l'], 26 * ext); rot(r['leg-r'], -26 * ext);
        rot(r.tail, -24 - 34 * ext + Math.sin(beat * 4) * 6);
        break;
      }
    }
  }

  /* ---------- actor motion ---------- */
  function move(a, t0, dur, to, opts){
    opts = opts || {};
    /* an interrupted move still resolves: better an early pickup than a
       letter nobody ever collects */
    if (a.anim && a.anim.onEnd){
      var pending = a.anim.onEnd;
      a.anim.onEnd = null;
      try { pending(); } catch (err){}
    }
    a.anim = {
      t0: t0, dur: Math.max(60, dur),
      fx: a.x, fy: a.y, fsc: a.sc,
      tx: to.x, ty: to.y, tsc: to.sc == null ? 1 : to.sc,
      ease: EASES[opts.ease] || easeOut,
      rotMode: opts.rotTo == null ? 'style' : 'lerp',
      rotFrom: a.rot, rotTo: opts.rotTo,
      dirX: to.x - a.x, spins: opts.spins == null ? 0 : opts.spins,
      styleY: opts.styleY == null ? 1 : opts.styleY,
      arc: opts.arc || 0, roll: opts.roll || 0,
      fop: a.op, top: opts.op == null ? 1 : opts.op,
      effort: opts.effort == null ? 0.5 : opts.effort,
      onEnd: opts.onEnd || null, next: opts.next || null
    };
    if (Math.abs(to.x - a.x) > 2) a.lastDx = to.x - a.x;
  }

  function stepActor(a, t){
    tickExpr(a, t);
    var an = a.anim;
    if (!an){ a.effort *= 0.92; return; }
    var p = clamp01((t - an.t0) / an.dur);
    var e = an.ease(p);
    a.phase = p;
    a.effort = an.effort * (1 - Math.abs(p - 0.4));
    a.x = lerp(an.fx, an.tx, e);
    a.y = lerp(an.fy, an.ty, e) + C.styleOffsetY(a.boardless ? 'foot' : a.mode, p) * an.styleY - an.arc * Math.sin(Math.PI * p);
    a.sc = lerp(an.fsc, an.tsc, e);
    a.scx = an.roll ? Math.cos(Math.PI * 2 * an.roll * e) : 1;
    if (Math.abs(a.scx) < 0.08) a.scx = a.scx < 0 ? -0.08 : 0.08;
    /* arrive by fading in quickly; leave by walking off, fading only at the
       very end, so nobody turns into a ghost in the middle of the screen */
    a.op = lerp(an.fop, an.top, an.top < an.fop ? clamp01((p - 0.75) / 0.25) : Math.min(1, p * 3));
    a.rot = an.rotMode === 'lerp'
      ? lerp(an.rotFrom, an.rotTo, e)
      : C.styleRot(a.boardless ? 'foot' : a.mode, p, an.dirX, an.spins);
    if (p >= 1){
      var done = an.onEnd, nxt = an.next;
      a.anim = null;
      a.scx = 1;
      if (done){ try { done(); } catch (err){} }
      if (nxt && !a.anim) move(a, t, nxt.dur, nxt.to, nxt.opts || {});
    }
  }

  /* ---------- letters ---------- */
  function hookOf(a){ return { x: a.x + SIZE * 0.5, y: a.y + SIZE * 0.74 }; }
  /* the direction this scene treats as "forward" */
  function SX(){ return live && live.plan && live.plan.mirror ? -1 : 1; }

  /* How many letters this character already has on the line, so the next one
     rides further back instead of landing on top of the last. */
  function ropedCount(key){
    var n = 0;
    if (!live) return 0;
    for (var i = 0; i < live.payloads.length; i++){
      var q = live.payloads[i];
      if (q.state === 'roped' && q.owner === key) n++;
    }
    return n;
  }

  /*
    Hand a letter to a character. Each additional letter is fanned out and
    up, so an armful of four reads as four letters rather than one tile with
    three hidden behind it.
  */
  function takeHold(a, pl, cx, cy){
    if (a.holding.indexOf(pl) === -1) a.holding.push(pl);
    var n = a.holding.indexOf(pl);
    var dir = (n % 2 === 0) ? 1 : -1;
    var step = Math.max(26, pl.w * 0.46);
    pl.owner = a.key;
    pl.state = 'held';
    pl.offX = cx - pl.hx + dir * step * Math.ceil(n / 2);
    pl.offY = cy - pl.hy - n * (pl.h * 0.42);
    pl.offRot = dir * (6 + n * 4);
    a.look = null;
  }

  /*
    Go to the letter, pick it up, then leave with it. If he is already beside
    it the trip is skipped, so a scene that authored its own approach does
    not pay for a second one.
  */
  function collect(a, pl, t, dur, cx, cy, away, sound){
    var ground = live.groundY;
    var leave = { x: away.x, y: away.y, sc: 0.9 };
    var grounded = !C.CHARS[a.key].airborne;
    var restY = ground - pl.h * 0.5 - 8;
    a.look = { x: pl.x, y: pl.y };

    /*
      He is on wheels or on foot and the letter is above his head. He cannot
      reach it, so it comes to him: knocked loose, it falls, and he meets it
      on the ground. Teleporting it into his arms is what made letters look
      like they vanished for no reason.
    */
    if (grounded && pl.state !== 'free' && pl.y < restY - pl.h * 0.8){
      pl.state = 'free';
      pl.owner = null;
      pl.groundY = restY;
      pl.vx = 0; pl.vy = -0.06; pl.spin = (pl.idx % 2 ? -1 : 1) * 0.05;
      SFX.play('bonk');
      var meet = { x: clamp(pl.x - SIZE * 0.5, -SIZE * 0.3, vw() - SIZE * 0.7),
                   y: ground - SIZE * 0.86 };
      var dropDur = Math.max(260, dur * 0.40);
      move(a, t, dropDur, meet, {
        ease: 'out', effort: 0.6,
        onEnd: function(){ takeHold(a, pl, cx, cy); SFX.play(sound); setExpr(a, 'happy', 600); },
        next: { dur: Math.max(200, dur - dropDur), to: leave, opts: { ease: 'inout', effort: 0.7 } }
      });
      return;
    }

    var at = beside(pl, a, ground, -1);
    var far = Math.abs(a.x - at.x) + Math.abs(a.y - at.y);
    if (far < 60){
      takeHold(a, pl, cx, cy);
      SFX.play(sound);
      move(a, t, dur, leave, { ease: 'inout', effort: 0.7 });
      return;
    }
    var goDur = Math.max(180, dur * 0.44);
    move(a, t, goDur, { x: at.x, y: at.y, sc: 1 }, {
      ease: 'out', effort: 0.6,
      onEnd: function(){ takeHold(a, pl, cx, cy); SFX.play(sound); },
      next: { dur: Math.max(180, dur - goDur), to: leave, opts: { ease: 'inout', effort: 0.7 } }
    });
  }

  function releaseHold(a, pl){
    if (!a) return;
    var i = a.holding.indexOf(pl);
    if (i !== -1) a.holding.splice(i, 1);
  }

  /* Where a free letter will be in `ms`, so a catch is aimed, not lucky. */
  function predict(pl, ms){
    var x = pl.x, y = pl.y, vx = pl.vx, vy = pl.vy;
    for (var t = 0; t < ms; t += 16){
      vy += GRAV * 16; x += vx * 16; y += vy * 16;
      if (y > pl.groundY){ y = pl.groundY; vy = -vy * 0.42; vx *= 0.68; }
    }
    return { x: x, y: y };
  }

  function stepPayload(pl, t, dt){
    if (pl.state === 'gone') return;

    if (pl.state === 'stacked'){
      /* sits where it was put and wobbles, until something takes it */
      var wob = live.wobbleUntil && t < live.wobbleUntil ? 7 : 1.8;
      pl.x += (pl.stackX - pl.x) * 0.22;
      pl.y += (pl.stackY - pl.y) * 0.22;
      pl.rot = pl.offRot + Math.sin(t / (wob > 2 ? 130 : 240) + pl.idx * 1.3) * wob * (1 + pl.idx * 0.25);
      return;
    }

    if (pl.state === 'held'){
      var a = actors[pl.owner];
      if (!a) return;
      pl.x = a.x + pl.offX; pl.y = a.y + a.bob + pl.offY;
      pl.rot = pl.spinWith ? a.rot + pl.offRot : lerp(pl.rot, pl.offRot + Math.sin(t / 180 + pl.idx) * 3, 0.2);
      return;
    }

    if (pl.state === 'roped'){
      var owner = actors[pl.owner];
      if (!owner) return;
      var h = hookOf(owner);
      var sol = C.ropeSolve(pl.x, pl.y, h.x, h.y, pl.rest);
      /* the moment the slack runs out: one jolt, once */
      if (sol.taut && !pl.wasTaut){
        pl.wasTaut = true;
        pl.snapAt = t;
        SFX.play('cordsnap');
        shake(6);
        setExpr(owner, 'wow', 500, t);
      }
      if (!sol.taut) pl.wasTaut = false;
      /* lag so the letter swings behind instead of welding to the hook */
      var k = sol.taut ? 0.52 : 0.0;
      pl.x += (sol.x - pl.x) * k;
      pl.y += (sol.y - pl.y) * k;
      if (sol.taut){
        var lead = Math.atan2(h.y - pl.y, h.x - pl.x);
        pl.rot = lerp(pl.rot, (lead * 180 / Math.PI) * 0.18, 0.12);
      }
      return;
    }

    if (pl.state === 'lined'){
      /* hopping down into the parade line, then marking time */
      var lp = clamp01((t - pl.t0) / pl.dur);
      if (lp < 1){
        var e = easeInOut(lp);
        pl.x = lerp(pl.fx, pl.tx, e);
        pl.y = lerp(pl.fy, pl.ty, e) - 90 * Math.sin(Math.PI * lp);
        pl.rot = lerp(pl.frot, 0, e) + 360 * (pl.idx % 2 ? -1 : 1) * e * (pl.flipIn ? 1 : 0);
        if (!pl.landed && lp > 0.96){ pl.landed = true; dustAt(pl.x, pl.ty + pl.h * 0.5, 3); SFX.play('boing'); }
      } else {
        pl.x = pl.tx;
        pl.y = pl.ty - Math.abs(Math.sin(t / 150 + pl.idx * 0.9)) * 12;
        pl.rot = Math.sin(t / 150 + pl.idx * 0.9) * 5;
      }
      return;
    }

    if (pl.state === 'following'){
      /* a conga line: each letter keeps its place behind the leader, hopping */
      var ld = actors[pl.owner];
      if (!ld) return;
      var lc = ld.x + SIZE / 2;
      var gx = lc - pl.dirSign * (pl.slot + 1) * pl.gap;
      pl.x += (gx - pl.x) * 0.16;
      var hop = Math.abs(Math.sin(t / 130 + pl.idx * 0.8));
      pl.y = pl.ty - hop * 20;
      pl.rot = pl.dirSign * (hop - 0.5) * 12;
      return;
    }

    if (pl.state === 'free'){
      pl.vy += GRAV * dt;
      pl.x += pl.vx * dt;
      pl.y += pl.vy * dt;
      pl.rot += pl.spin * dt;
      if (pl.y > pl.groundY){
        pl.y = pl.groundY;
        if (Math.abs(pl.vy) > 0.06){ SFX.play('bonk'); dustAt(pl.x, pl.groundY + pl.h * 0.5, 2); }
        pl.vy = -pl.vy * 0.42;
        pl.vx *= 0.68; pl.spin *= 0.5;
        if (Math.abs(pl.vy) < 0.08){ pl.vy = 0; pl.spin = 0; pl.rot *= 0.8; }
      }
      /* the walls of the world are real: a letter bounces off the edge */
      if (pl.x < pl.hx && pl.vx < 0){ pl.x = pl.hx; pl.vx = -pl.vx * 0.5; }
      if (pl.x > vw() - pl.hx && pl.vx > 0){ pl.x = vw() - pl.hx; pl.vx = -pl.vx * 0.5; }
    }
  }
  function dustAt(x, y, n){ dust(x, y, n, 34); }

  function drawCords(){
    for (var i = 0; i < live.payloads.length; i++){
      var pl = live.payloads[i];
      if (!pl.cord) continue;
      if (pl.state !== 'roped' || !actors[pl.owner]){ pl.cord.setAttribute('d', ''); continue; }
      var h = hookOf(actors[pl.owner]);
      pl.cord.setAttribute('d', C.cordPath(h.x, h.y, pl.x, pl.y, pl.rest));
      var taut = C.ropeSolve(pl.x, pl.y, h.x, h.y, pl.rest).taut;
      pl.cord.setAttribute('class', 'cord' + (taut ? ' taut' : ''));
    }
    if (live.looseCordEl){
      var lc = live.looseCord;
      live.looseCordEl.setAttribute('d', 'M' + Math.round(lc.x1) + ' ' + Math.round(lc.y) +
        ' Q' + Math.round((lc.x1 + lc.x2) / 2) + ' ' + Math.round(lc.y + 10) + ' ' + Math.round(lc.x2) + ' ' + Math.round(lc.y));
    }
  }

  function shake(px){
    if (!layer || !on) return;
    if (live) live.shake = Math.max(live.shake || 0, px);
  }

  function makePayload(srcEl, idx){
    var r = srcEl.getBoundingClientRect();
    var wrap = document.createElement('div');
    wrap.className = 'letterprop';
    wrap.style.width = r.width + 'px';
    wrap.style.height = r.height + 'px';
    var clone = srcEl.cloneNode(true);
    clone.removeAttribute('id');
    clone.style.margin = '0';
    clone.style.width = r.width + 'px';
    clone.style.height = r.height + 'px';
    clone.style.transform = 'none';
    clone.classList.remove('knocked', 'sliced', 'taken', 'over', 'pulse');
    wrap.appendChild(clone);
    layer.appendChild(wrap);
    srcEl.classList.add('taken');

    var cord = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    cord.setAttribute('class', 'cord');
    cordSvg.appendChild(cord);

    return {
      el: wrap, src: srcEl, cord: cord, idx: idx,
      hx: r.width / 2, hy: r.height / 2, w: r.width, h: r.height,
      x: r.left + r.width / 2, y: r.top + r.height / 2,
      homeX: r.left + r.width / 2, homeY: r.top + r.height / 2,
      rot: 0, sc: 1, op: 1, vx: 0, vy: 0, spin: 0,
      rest: REST, state: 'idle', owner: null,
      offX: 0, offY: 0, offRot: 0, spinWith: false,
      wasTaut: false, snapAt: 0,
      groundY: r.top + r.height / 2
    };
  }

  /* Off-screen point for a direction. Up and down go straight from where he
     is (boxX), so two characters leaving upward never converge on the same
     spot with their letters piled into one. */
  function edgeFor(dir, ground, boxX){
    var ux = boxX == null ? vw() * 0.5 - SIZE / 2 : clamp(boxX, -SIZE * 0.2, vw() - SIZE * 0.8);
    switch (dir){
      case 'up':    return { x: ux, y: -SIZE - 70 };
      case 'down':  return { x: ux, y: vh() + 90 };
      case 'left':  return { x: -SIZE - 90, y: ground };
      default:      return { x: vw() + 90, y: ground };
    }
  }

  /* Where a character stands to work on a letter: beside it, not on it. */
  function beside(pl, a, ground, side){
    var s = (side == null ? -1 : side) * SX();
    var x = pl.x + s * (pl.w * 0.5 + SIZE * 0.42) - SIZE / 2;
    var y = (a.mode === 'foot' || a.mode === 'board')
      ? ground - SIZE * 0.86
      : pl.y - SIZE * 0.92;
    return { x: clamp(x, -SIZE * 0.4, vw() - SIZE * 0.6), y: y };
  }

  /* Which way this letter is going to be towed, looked up from the plan, so
     the wind-up before the yank points the same way as the yank itself. */
  function towDirOf(letter, who){
    if (!live || letter == null) return null;
    var ev = live.plan.events;
    for (var i = 0; i < ev.length; i++){
      if (ev[i].kind === 'tow' && ev[i].letter === letter && ev[i].char === who) return ev[i].dir;
    }
    return null;
  }
  /* How far below him his trail of letters hangs: leaving upward he has to
     climb that much further, or the letters are still dangling on screen
     when the scene ends — and then they would just vanish. */
  function trailBelow(a){
    var extra = 0;
    if (!live) return 0;
    live.payloads.forEach(function(q){
      if (q.owner !== a.key || q.state === 'gone') return;
      if (q.state === 'roped') extra = Math.max(extra, q.rest + q.h);
      else if (q.state === 'held') extra = Math.max(extra, q.offY + q.h - SIZE);
    });
    return extra + 40;
  }
  function leave(a, dir, ground){
    var to = edgeFor(dir, ground, a.x);
    if (dir === 'up') to.y -= trailBelow(a);
    else if (dir === 'left') to.x -= trailBelow(a);
    else if (dir === 'right') to.x += trailBelow(a);
    return to;
  }

  /* An actor-box x, measured forward from a centre point in this scene's direction. */
  function ahead(cx, off){ return cx + SX() * off - SIZE / 2; }

  /* ============================================================
     EVENT HANDLERS — one per beat kind the scene library emits.
     Any kind with no handler is a no-op rather than a crash, so adding a
     beat to a scene can never wedge a performance mid-way.
     ============================================================ */
  function fire(e, t){
    var a = actors[e.char];
    var pl = (e.letter != null) ? live.payloads[e.letter] : null;
    var ground = live.groundY;
    var sx = SX();

    switch (e.kind){

      case 'enter': {
        if (!a) break;
        var target = pl || live.payloads[0];
        var from = edgeFor(live.entryFor[e.char] || 'left', ground - SIZE * 0.86);
        a.x = from.x; a.y = from.y; a.op = 0; a.sc = 0.82; a.fallen = 0; a.boardless = false;
        a.el.classList.remove('boardless');
        var to = target ? beside(target, a, ground, -1)
                        : { x: vw() * 0.42, y: ground - SIZE * 0.86 };
        if (target) a.look = { x: target.x, y: target.y };
        /* arrive and settle, rather than stopping dead on the mark */
        move(a, t, e.dur, { x: to.x, y: to.y, sc: 1 },
          { op: 1, ease: 'back', spins: a.mode === 'acro' ? 1 : 0, effort: 0.8 });
        SFX.play(a.mode === 'jet' ? 'thrust' : a.mode === 'board' ? 'roll' : a.mode === 'foot' ? 'steps' : 'whoosh');
        break;
      }

      /* Close the last bit of distance to a specific letter. */
      case 'approach': {
        if (!a || !pl) break;
        var m = beside(pl, a, ground, -1);
        a.look = { x: pl.x, y: pl.y };
        move(a, t, e.dur, { x: m.x, y: m.y, sc: 1 }, { ease: 'out', effort: 0.5 });
        break;
      }

      /* ---- the cord, in four beats ---- */
      case 'hook': {
        if (!a || !pl) break;
        /* a stacked block is hooked where it stands; it must not start
           following the character, or the tower leaves before it topples */
        pl.wasTaut = false;
        pl.rest = REST + ropedCount(e.char) * 46;
        pl.owner = e.char;
        pl.state = 'roped';
        a.look = { x: pl.x, y: pl.y };
        var h = beside(pl, a, ground, -1);
        move(a, t, e.dur, { x: h.x, y: h.y, sc: 1 }, { ease: 'back', effort: 0.6 });
        SFX.play('cord');
        break;
      }
      /* He moves off; the cord pays out but stays loose — the letter must
         not so much as twitch here, or the snap that follows means nothing. */
      case 'slack': {
        if (!a || !pl) break;
        var away = towDirOf(e.letter, e.char) === 'up'
          ? { x: a.x, y: a.y - 64 }
          : { x: a.x + sx * (a.mode === 'jet' ? 70 : 82), y: a.y - (a.mode === 'jet' ? 26 : 0) };
        move(a, t, e.dur, { x: away.x, y: away.y, sc: 1 }, { ease: 'out', effort: 0.45 });
        break;
      }
      /* Far enough that the rope constraint bites: stepPayload fires the
         jolt and the sound the moment it actually goes taut. */
      case 'snap': {
        if (!a || !pl) break;
        var far = towDirOf(e.letter, e.char) === 'up'
          ? { x: a.x, y: a.y - 80 }
          : { x: a.x + sx * 86, y: a.y - (a.mode === 'jet' ? 18 : 0) };
        move(a, t, e.dur, { x: far.x, y: far.y, sc: 1 }, { ease: 'snap', effort: 1 });
        break;
      }
      case 'resist': {
        /* he pulls and it does not come: strain, then it gives */
        if (!a) break;
        setExpr(a, 'oops', e.dur, t);
        var upPull = towDirOf(e.letter, e.char) === 'up';
        move(a, t, e.dur, { x: a.x + (upPull ? 0 : sx * 16), y: a.y - (upPull ? 12 : 6), sc: 0.99 }, { ease: 'inout', effort: 1 });
        SFX.play('strain');
        break;
      }
      case 'tow': {
        if (!a) break;
        if (pl){
          if (e.roped){
            releaseHold(actors[pl.owner], pl);
            if (pl.state !== 'roped') pl.rest = REST + ropedCount(e.char) * 46;
            pl.owner = e.char; pl.state = 'roped';
          }
          else takeHold(a, pl, SIZE * 0.5, SIZE * 1.0);
        }
        var to2 = leave(a, e.dir, ground - SIZE * 0.86);
        move(a, t, e.dur, { x: to2.x, y: to2.y, sc: 0.88 },
          { ease: 'inout', spins: a.mode === 'acro' ? 2 : 0, effort: 0.9 });
        SFX.play('yank');
        break;
      }

      /* ---- carrying ---- */
      case 'scoop':
      case 'carry': {
        if (!a || !pl) break;
        var lift = (e.kind === 'scoop' && a.mode === 'board') ? SIZE * 0.20 : SIZE * 0.58;
        var away2 = edgeFor(e.dir || 'left', ground - SIZE * 0.86, pl.x - SIZE / 2);
        collect(a, pl, t, e.dur, SIZE * 0.56, lift, away2,
                e.kind === 'scoop' ? 'scoop' : 'pickup');
        break;
      }
      /* Caught out of the air, mid-rotation. Aimed at where the letter will
         be, not where it was, so a catch looks like a catch. */
      case 'snatch': {
        if (!a || !pl) break;
        a.look = { x: pl.x, y: pl.y };
        var catchIt = function(){
          if (pl.state === 'gone') return;
          releaseHold(actors[pl.owner], pl);
          takeHold(a, pl, SIZE * 0.62, SIZE * 0.26);
          pl.spinWith = (a.mode === 'acro');
          SFX.play('catch');
          setExpr(a, 'happy', 700);
        };
        if (pl.state === 'free'){
          var aim = predict(pl, e.dur * 0.7);
          move(a, t, e.dur * 0.7, { x: aim.x - SIZE / 2 + sx * 20, y: aim.y - SIZE * 0.45, sc: 1.04 },
            { ease: 'out', spins: a.mode === 'acro' ? 1 : 0, effort: 0.9, onEnd: catchIt });
        } else {
          catchIt();
          move(a, t, e.dur, { x: pl.x - SIZE / 2 + sx * 44, y: pl.y - SIZE * 0.5, sc: 1.04 },
            { ease: 'back', spins: a.mode === 'acro' ? 1 : 0, effort: 0.9 });
        }
        break;
      }

      /* ---- the stack ---- */
      case 'stack': {
        if (!a) break;
        var tileH = live.payloads[0] ? live.payloads[0].h : 68;
        var offs = C.stackOffsets(live.payloads.length, tileH);
        /* build it where the word already is, so the eye follows the letters
           instead of cutting to an unrelated part of the screen */
        var homeX = 0;
        live.payloads.forEach(function(q){ homeX += q.homeX; });
        homeX = live.payloads.length ? homeX / live.payloads.length : vw() * 0.5;
        var baseX = clamp(homeX, tileH * 1.1 + SIZE * 0.5, vw() - tileH * 1.1 - SIZE * 0.5);
        var baseY = ground - tileH * 0.55;
        live.stackBase = { x: baseX, y: baseY };
        live.payloads.forEach(function(q, i){
          q.state = 'stacked'; q.owner = e.char;
          q.stackX = baseX + offs[i].dx;
          q.stackY = baseY + offs[i].dy;
          q.offRot = offs[i].rot;
        });
        /* stand beside the tower, at its own height, not floating above it */
        var sp = {
          x: ahead(baseX, -(tileH * 0.6 + SIZE * 0.22)),
          y: (a.mode === 'jet' || a.mode === 'acro') ? baseY - SIZE * 0.80 : ground - SIZE * 0.86
        };
        a.look = { x: baseX, y: baseY - tileH };
        move(a, t, e.dur, { x: sp.x, y: sp.y, sc: 1 }, { ease: 'back', effort: 0.7 });
        SFX.play('stack');
        break;
      }
      /* The tower answers for the block that was pulled out from under it. */
      case 'topple': {
        var from2 = e.from == null ? 1 : e.from;
        var falling = [];
        live.payloads.forEach(function(q, i){ if (i >= from2 && q.state !== 'gone') falling.push(q); });
        /* fan them out so the landed word stays readable rather than heaping
           into one pile the child cannot pick letters out of */
        var spread = Math.min(vw() - 120, falling.length * 86);
        falling.forEach(function(q, n){
          releaseHold(actors[q.owner], q);
          var targetX = (vw() - spread) / 2 + spread * (falling.length > 1 ? n / (falling.length - 1) : 0.5);
          var flight = 560 + n * 60;
          q.state = 'free';
          /* groundY is the CENTRE, so half a tile has to clear the line or
             the letter sinks through the bottom of the card */
          q.groundY = ground - q.h * 0.5 - 8;
          q.vx = (targetX - q.x) / flight;
          q.vy = -0.24 - Math.random() * 0.10;
          q.spin = (q.vx >= 0 ? 1 : -1) * (0.08 + Math.random() * 0.10);
        });
        for (var k in actors){ if (actors[k].op > 0.5) setExpr(actors[k], 'wow', 800, t); }
        SFX.play('topple');
        shake(9);
        break;
      }

      case 'pop': {
        if (!pl) break;
        burst(pl.x, pl.y);
        pl.state = 'gone'; pl.op = 0;
        if (a){
          setExpr(a, 'happy', 600, t);
          move(a, t, e.dur, { x: a.x + sx * 26, y: a.y - 18, sc: 1.05 },
            { ease: 'back', spins: a.mode === 'acro' ? 1 : 0, effort: 0.6 });
        }
        SFX.play('pop');
        break;
      }

      /* ---- Zip ---- */
      case 'ollie': {
        if (!a) break;
        var over = actors[e.over];
        var lx = over ? over.x + sx * 90 : a.x + sx * 150;
        if (over) a.look = centreOf(over);
        move(a, t, e.dur, { x: lx, y: a.y, sc: 1 }, { ease: 'out', styleY: 1, arc: 70, effort: 1 });
        SFX.play('ollie');
        break;
      }
      case 'grind': {
        if (!a) break;
        move(a, t, e.dur, { x: (sx > 0 ? vw() * 0.8 : vw() * 0.2) - SIZE / 2, y: ground - SIZE * 0.92, sc: 1 },
          { ease: 'inout', effort: 0.8 });
        SFX.play('grind');
        break;
      }
      case 'kickflip': {
        if (!a) break;
        a.trick = { kind: 'kickflip', t0: t, dur: e.dur };
        setExpr(a, 'wow', e.dur, t);
        move(a, t, e.dur, { x: a.x + sx * 60, y: a.y, sc: 1 }, { ease: 'inout', styleY: 0, arc: 64, effort: 1 });
        SFX.play('kickflip');
        break;
      }
      /* The landing goes wrong: the board carries on without him. */
      case 'bail': {
        if (!a) break;
        a.trick = null;
        spawnLooseBoard(a, sx);
        a.boardless = true;
        a.el.classList.add('boardless');
        a.fallen = 1;
        setExpr(a, 'oops', e.dur + 500, t);
        /* he goes the other way to the board, landing on his backside */
        var away3 = live.board ? -Math.sign(live.board.vx) : -sx;
        move(a, t, e.dur, { x: clamp(a.x + away3 * 40, -SIZE * 0.2, vw() - SIZE * 0.8), y: ground - SIZE * 0.52, sc: 1 },
          { rotTo: away3 * C.MAX_FALL_ROT * 0.55, ease: 'out', effort: 1 });
        dust(a.x + SIZE / 2, ground, 6);
        SFX.play('fall');
        shake(6);
        break;
      }
      /* He runs to the board, hops back on, and it is as if nothing happened. */
      case 'remount': {
        if (!a) break;
        a.fallen = 0;
        var b = live.board;
        var bx = b ? b.x - SIZE / 2 : a.x + sx * 120;
        if (b) a.look = { x: b.x, y: ground - 10 };
        move(a, t, e.dur * 0.75, { x: bx, y: ground - SIZE * 0.86, sc: 1 }, {
          rotTo: 0, ease: 'inout', effort: 0.8,
          onEnd: function(){
            removeLooseBoard();
            a.boardless = false;
            a.el.classList.remove('boardless');
            setExpr(a, 'happy', 700);
            SFX.play('ollie');
          },
          next: { dur: e.dur * 0.25, to: { x: bx, y: ground - SIZE * 0.86, sc: 1 }, opts: { arc: 30, styleY: 0, ease: 'out' } }
        });
        SFX.play('steps');
        break;
      }

      /* ---- Blip ---- */
      case 'overshoot': {
        if (!a) break;
        setExpr(a, 'wow', e.dur, t);
        move(a, t, e.dur, { x: sx > 0 ? Math.min(vw() + 30, a.x + 190) : Math.max(-SIZE - 30, a.x - 190), y: a.y - 24, sc: 0.95 },
          { ease: 'out', effort: 1 });
        SFX.play('thrust');
        break;
      }
      case 'brake': {
        if (!a) break;
        move(a, t, e.dur, { x: a.x - sx * 66, y: a.y + 10, sc: 1.03 },
          { ease: 'back', rotTo: a.mode === 'jet' ? -16 * sx : 0, effort: 1 });
        var bc = artPoint(a, 100, 190);
        for (var s2 = 0; s2 < 5; s2++) particle('smoke', bc.x, bc.y, sx * rnd(20, 60), rnd(-10, 20), rnd(500, 800), 0.8, 2.2);
        SFX.play('brake');
        break;
      }
      /* A rocket roll: the whole body turns over along its length. Rolling
         like this is a flip of the drawing, not a rotation, so it can never
         read as a tumble. */
      case 'roll': {
        if (!a) break;
        setExpr(a, 'happy', e.dur, t);
        move(a, t, e.dur, { x: clamp(a.x + sx * 90, -SIZE * 0.2, vw() - SIZE * 0.8), y: Math.max(40, a.y - 50), sc: 1 },
          { ease: 'inout', roll: 1, rotTo: 0, effort: 1 });
        SFX.play('thrust');
        break;
      }

      /* ---- Trip ---- */
      case 'snag': {
        if (!a) break;
        /* the foot catches: he keeps going from the waist up */
        setExpr(a, 'wow', e.dur + 300, t);
        move(a, t, e.dur, { x: a.x + sx * 26, y: a.y - 8, sc: 1 }, { ease: 'out', rotTo: 22 * sx, effort: 1 });
        SFX.play('snag');
        break;
      }
      case 'fumble': {
        if (!a) break;
        if (pl){
          releaseHold(actors[pl.owner], pl);
          pl.state = 'free';
          pl.owner = null;
          pl.groundY = ground - pl.h * 0.5 - 8;
          pl.vx = 0.13 * sx; pl.vy = -0.24; pl.spin = 0.30 * sx;
        }
        a.fallen = 1;
        setExpr(a, 'oops', e.dur + 400, t);
        move(a, t, e.dur, { x: a.x + sx * 44, y: ground - SIZE * 0.46, sc: 1 },
          { rotTo: sx * C.MAX_FALL_ROT * 0.62, ease: 'out', effort: 1 });
        dust(a.x + SIZE / 2 + sx * 44, ground, 7);
        SFX.play('fall');
        shake(7);
        break;
      }
      case 'dustoff': {
        if (!a) break;
        a.fallen = 0;
        move(a, t, e.dur, { x: a.x + sx * 18, y: ground - SIZE * 0.86, sc: 1 },
          { rotTo: 0, ease: 'back', effort: 0.4 });
        dust(a.x + SIZE / 2, ground, 4);
        SFX.play('dust');
        break;
      }
      case 'rescue': {
        if (!a) break;
        if (a.op < 0.05){
          var rf = edgeFor(live.entryFor[e.char] || 'up', ground - SIZE * 0.86);
          a.x = rf.x; a.y = rf.y; a.sc = 0.82; a.fallen = 0;
        }
        if (pl){
          releaseHold(actors[pl.owner], pl);
          if (a.holding.indexOf(pl) === -1) a.holding.push(pl);
          pl.owner = e.char; pl.state = 'held';
          pl.offX = SIZE * 0.5 - pl.hx; pl.offY = SIZE * 0.86 - pl.hy; pl.offRot = -5;
        }
        setExpr(a, 'happy', e.dur, t);
        var ro = edgeFor(e.dir || 'left', ground - SIZE * 0.8, a.x);
        move(a, t, e.dur, { x: ro.x, y: ro.y, sc: 0.9 },
          { ease: 'inout', spins: a.mode === 'acro' ? 2 : 0, effort: 0.9 });
        SFX.play('rescue');
        break;
      }
      case 'dropcord': {
        /* the cord stays lying across the scene as an obstacle */
        live.looseCord = { x1: vw() * 0.14, x2: vw() * 0.86, y: ground - 8 };
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'cord');
        cordSvg.appendChild(path);
        live.looseCordEl = path;
        break;
      }
      case 'wobble': {
        if (!a) break;
        live.wobbleUntil = t + e.dur;
        a.trick = null;
        setExpr(a, 'wow', e.dur, t);
        /* he teeters under the load, one way then the other */
        move(a, t, e.dur / 2, { x: a.x + sx * 14, y: a.y, sc: 1 }, {
          rotTo: 14 * sx, ease: 'inout', effort: 0.9,
          next: { dur: e.dur / 2, to: { x: a.x - sx * 6, y: a.y, sc: 1 }, opts: { rotTo: -6 * sx, ease: 'inout', effort: 0.9 } }
        });
        SFX.play('strain');
        break;
      }
      case 'cheer': {
        if (!a) break;
        a.trick = { kind: 'cheer', t0: t, dur: e.dur };
        setExpr(a, 'happy', e.dur + 200, t);
        move(a, t, e.dur, { x: a.x, y: a.y, sc: 1 }, { rotTo: 0, ease: 'linear', styleY: 0, arc: 34, effort: 0.3 });
        SFX.play('cheer');
        break;
      }
      /* Trip hauls the whole tower off, stack and all. */
      case 'haul': {
        if (!a || !pl) break;
        live.wobbleUntil = 0;
        if (a.holding.indexOf(pl) === -1) a.holding.push(pl);
        pl.state = 'held'; pl.owner = a.key;
        pl.offX = pl.x - a.x; pl.offY = pl.y - a.y; pl.offRot = pl.rot;
        if (!live.hauled){
          live.hauled = true;
          var hx = edgeFor(e.dir || 'right', ground - SIZE * 0.86);
          /* far enough that the tower beside him clears the edge too */
          hx.x += (e.dir === 'left' ? -1 : 1) * (Math.abs(pl.offX) + pl.w + 40);
          move(a, t, e.dur, { x: hx.x, y: hx.y, sc: 1 }, { ease: 'inout', effort: 0.9, rotTo: 0 });
          SFX.play('steps');
        }
        break;
      }
      /* The payoff happens where we cannot see it. */
      case 'offcrash': {
        var cx = e.dir === 'left' ? 6 : vw() - 6;
        dust(cx, ground, 10, 70);
        sparkle(cx, ground - 60, 6);
        SFX.play('crash');
        shake(10);
        break;
      }

      /* ---- Flip ---- */
      case 'cartwheel': {
        if (!a || !pl) break;
        a.look = { x: pl.x, y: pl.y };
        move(a, t, e.dur, { x: ahead(pl.x, -SIZE * 0.4), y: pl.y - SIZE * 0.3, sc: 1 },
          { spins: 1, ease: 'inout', effort: 0.9 });
        SFX.play('whoosh');
        break;
      }
      /* Handspring under the letter and kick it skyward. */
      case 'handspring': {
        if (!a || !pl) break;
        a.look = { x: pl.x, y: pl.y };
        var under = { x: pl.x - SIZE / 2 - sx * pl.w * 0.3, y: Math.min(ground - SIZE * 0.86, pl.y + pl.h * 0.2 - SIZE * 0.4), sc: 1 };
        move(a, t, e.dur * 0.6, under, {
          ease: 'inout', spins: 1, effort: 0.9,
          onEnd: function(){
            if (pl.state === 'idle' || pl.state === 'stacked'){
              pl.state = 'free'; pl.owner = null;
              pl.groundY = ground - pl.h * 0.5 - 8;
              pl.vx = sx * 0.05; pl.vy = -0.78; pl.spin = sx * 0.4;
              sparkle(pl.x, pl.y, 5);
              SFX.play('boing');
            }
          }
        });
        SFX.play('whoosh');
        break;
      }
      case 'aerial': {
        if (!a) break;
        setExpr(a, 'happy', e.dur, t);
        move(a, t, e.dur, { x: a.x + sx * 90, y: a.y - 70, sc: 1.02 },
          { spins: 2, ease: 'out', effort: 1 });
        sparkle(a.x + SIZE / 2, a.y + SIZE / 2, 6);
        SFX.play('whoosh');
        break;
      }

      /* ---- two-hander beats ---- */
      case 'tug': {
        if (!a) break;
        var other = actors[e.other];
        setExpr(a, 'oops', e.dur, t);
        move(a, t, e.dur, { x: a.x - sx * 30, y: a.y, sc: 1 }, { ease: 'inout', effort: 1 });
        if (other){
          setExpr(other, 'oops', e.dur, t);
          move(other, t, e.dur, { x: other.x + sx * 30, y: other.y, sc: 1 }, { ease: 'inout', effort: 1 });
        }
        SFX.play('strain');
        break;
      }
      case 'realise': {
        if (!a) break;
        var o2 = actors[e.other];
        setExpr(a, 'wow', e.dur + 200, t);
        if (o2){ a.look = centreOf(o2); o2.look = centreOf(a); setExpr(o2, 'wow', e.dur + 200, t); }
        move(a, t, e.dur, { x: a.x, y: a.y - 10, sc: 1 }, { rotTo: -10, ease: 'back', effort: 0.2 });
        if (o2) move(o2, t, e.dur, { x: o2.x, y: o2.y - 10, sc: 1 }, { rotTo: 10, ease: 'back', effort: 0.2 });
        SFX.play('blink');
        break;
      }
      case 'notice': {
        if (!a) break;
        setExpr(a, 'wow', e.dur + 200, t);
        move(a, t, e.dur, { x: a.x - sx * 12, y: a.y - 8, sc: 1 }, { rotTo: -12 * sx, ease: 'back', effort: 0.2 });
        SFX.play('blink');
        break;
      }

      case 'superpass': {
        if (!a) break;
        var sf = edgeFor(sx > 0 ? 'left' : 'right', ground - SIZE * 0.66);
        a.x = sf.x; a.y = sf.y; a.op = 1; a.sc = 1.1;
        setExpr(a, 'happy', e.dur, t);
        move(a, t, e.dur, edgeFor(sx > 0 ? 'right' : 'left', ground - SIZE * 0.66),
          { spins: a.mode === 'acro' ? 3 : 0, ease: 'inout', op: 1, effort: 1 });
        SFX.play('super');
        break;
      }
      case 'flourish': {
        if (!a) break;
        if (a.op < 0.05){
          var ff = edgeFor(sx > 0 ? 'left' : 'right', ground - SIZE * 0.86);
          a.x = ff.x; a.y = ff.y; a.sc = 0.82;
        }
        setExpr(a, 'happy', e.dur, t);
        move(a, t, e.dur, edgeFor(sx > 0 ? 'right' : 'left', ground - SIZE * 0.86),
          { spins: a.mode === 'acro' ? 2 : 0, op: 1, ease: 'inout', effort: 0.8 });
        SFX.play(a.mode === 'board' ? 'grind' : 'whoosh');
        break;
      }

      /* ---- the parade ---- */
      case 'parade': {
        if (!a) break;
        var dirSign = (live.parade && live.parade.dirSign) || sx;
        /* he takes the front, the letters hop down into a line behind him */
        var gap = Math.max(52, (live.payloads[0] ? live.payloads[0].w : 60) * 0.95);
        var n = live.payloads.length;
        var lineW = (n + 1) * gap;
        var frontX = clamp(vw() / 2 + dirSign * lineW / 2, SIZE * 0.5, vw() - SIZE * 0.5);
        live.parade = { dirSign: dirSign, gap: gap, frontX: frontX };
        var ly2 = ground - SIZE * 0.86;
        a.look = { x: frontX - dirSign * gap, y: ground - 30 };
        move(a, t, 560, { x: frontX - SIZE / 2, y: (a.mode === 'jet') ? ly2 - 30 : ly2, sc: 1 }, {
          ease: 'back', effort: 0.6,
          next: { dur: e.dur - 560, to: { x: frontX - SIZE / 2, y: (a.mode === 'jet') ? ly2 - 30 : ly2, sc: 1 },
                  opts: { ease: 'linear', styleY: 0, arc: 0, effort: 0.2, rotTo: 0 } }
        });
        a.trick = { kind: 'wave', t0: t + 560, dur: e.dur - 560 };
        setExpr(a, 'happy', e.dur, t);
        live.payloads.forEach(function(q, i){
          releaseHold(actors[q.owner], q);
          q.state = 'lined'; q.owner = null;
          q.fx = q.x; q.fy = q.y; q.frot = q.rot;
          q.tx = frontX - dirSign * (i + 1) * gap;
          q.ty = ground - q.h * 0.5 - 6;
          q.t0 = t + i * 90; q.dur = 620; q.landed = false; q.flipIn = Math.random() < 0.35;
        });
        SFX.play('whistle');
        break;
      }
      case 'march': {
        if (!a || !live.parade) break;
        var pd = live.parade;
        var dist = (live.payloads.length + 2) * pd.gap + SIZE;
        var endX = pd.dirSign > 0 ? vw() + dist : -dist - SIZE;
        move(a, t, e.dur, { x: endX, y: a.y, sc: 1 }, { ease: 'linear', effort: 0.7, rotTo: 0 });
        SFX.play(a.mode === 'jet' ? 'thrust' : a.mode === 'board' ? 'roll' : 'steps');
        break;
      }
      case 'follow': {
        if (!pl || !live.parade) break;
        var lead2 = actors[e.leader];
        if (!lead2) break;
        pl.state = 'following'; pl.owner = e.leader;
        pl.dirSign = live.parade.dirSign; pl.gap = live.parade.gap;
        pl.slot = pl.idx;
        pl.ty = ground - pl.h * 0.5 - 6;
        break;
      }

      case 'exit': {
        if (!a) break;
        a.fallen = 0;
        setExpr(a, 'happy', e.dur, t);
        move(a, t, e.dur, leave(a, e.dir || 'right', ground - SIZE * 0.86),
          { spins: a.mode === 'acro' ? 2 : 0, op: 0, ease: 'inout', rotTo: a.mode === 'acro' ? null : 0, effort: 0.7 });
        break;
      }
    }
  }

  /* ---------- the loose skateboard (Zip's bail) ---------- */
  function spawnLooseBoard(a, sx){
    removeLooseBoard();
    var src = a.el.querySelector('.board');
    if (!src || !live) return;
    var wrap = document.createElement('div');
    wrap.className = 'looseboard';
    wrap.innerHTML = '<svg viewBox="-16 0 232 214" aria-hidden="true">' + src.outerHTML.replace(/class="board"/, 'class="board-copy"') + '</svg>';
    layer.appendChild(wrap);
    live.board = {
      /* it always shoots off toward open floor, never into the wall beside
         him, so the child can see it get away */
      el: wrap, x: a.x + SIZE / 2, vx: (a.x + SIZE / 2 < vw() / 2 ? 1 : -1) * 0.6, rot: 0,
      y: live.groundY, wheels: Array.prototype.slice.call(wrap.querySelectorAll('.wheel'))
    };
  }
  function stepBoard(dt){
    var b = live && live.board;
    if (!b) return;
    b.x += b.vx * dt;
    b.vx *= Math.pow(0.9975, dt);
    if (b.x < SIZE * 0.4 || b.x > vw() - SIZE * 0.4){ b.vx = -b.vx * 0.5; b.x = clamp(b.x, SIZE * 0.4, vw() - SIZE * 0.4); SFX.play('bonk'); }
    b.rot += b.vx * dt * 3;
    b.el.style.transform = 'translate3d(' + Math.round(b.x - SIZE / 2) + 'px,' + Math.round(b.y - SIZE * 0.93) + 'px,0)';
    b.wheels.forEach(function(w){
      w.setAttribute('transform', 'rotate(' + (b.rot % 360).toFixed(0) + ' ' + w.getAttribute('cx') + ' ' + w.getAttribute('cy') + ')');
    });
  }
  function removeLooseBoard(){
    if (live && live.board){
      if (live.board.el.parentNode) live.board.el.parentNode.removeChild(live.board.el);
      live.board = null;
    }
  }

  /* ---------- the loop ---------- */
  function frame(now){
    if (!live) return;
    var real = now;
    var vnow = live.t0 + (real - live.t0) * timeScale;
    var t = vnow - live.t0;
    var dt = Math.min(48, (real - live.last) * timeScale);
    live.last = real;

    for (var i = 0; i < live.plan.events.length; i++){
      if (live.fired[i]) continue;
      var e = live.plan.events[i];
      if (e.at <= t){
        live.fired[i] = 1;
        try { fire(e, vnow); } catch (err){ live.errors.push(e.kind + ': ' + String(err && err.message || err)); }
      }
    }

    for (var k in actors){
      if (!Object.prototype.hasOwnProperty.call(actors, k)) continue;
      var a = actors[k];
      stepActor(a, vnow);
      a.bob = 0;
      poseActor(a, vnow);
      writeActor(a);
      writeShadow(a, live.groundY);
      emit(a, real, live.groundY);
    }
    for (var j = 0; j < live.payloads.length; j++){
      stepPayload(live.payloads[j], vnow, dt);
      writePayload(live.payloads[j]);
    }
    stepBoard(dt);
    drawCords();

    if (live.shake > 0.4){
      var s = live.shake;
      layer.style.transform = 'translate3d(' + ((Math.random() - 0.5) * s).toFixed(1) + 'px,' +
        ((Math.random() - 0.5) * s).toFixed(1) + 'px,0)';
      live.shake *= 0.86;
    } else if (layer.style.transform){
      layer.style.transform = '';
      live.shake = 0;
    }

    /* Guard 1: wall clock. A slow device can never strand a letter here. */
    if (t >= live.plan.duration + 400 || real >= live.deadline){ finish(); return; }
    live.raf = requestAnimationFrame(frame);
  }

  function parkActor(a){
    a.anim = null; a.op = 0; a.x = -600; a.y = -600;
    a.rot = 0; a.sc = 1; a.scx = 1; a.bob = 0; a.fallen = 0; a.effort = 0; a.holding = [];
    a.look = null; a.trick = null; a.boardless = false;
    a.el.classList.remove('boardless', 'tappable');
    setExpr(a, null);
    writeActor(a);
    a.shadow.style.opacity = 0;
  }

  /* ---------- teardown: unconditional ---------- */
  function teardown(){
    if (!live) return null;
    var l = live;
    if (l.raf) cancelAnimationFrame(l.raf);
    if (l.guard) clearTimeout(l.guard);
    removeLooseBoard();
    live = null;
    l.payloads.forEach(function(p){
      if (p.cord && p.cord.parentNode) p.cord.parentNode.removeChild(p.cord);
      if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el);
    });
    if (l.looseCordEl && l.looseCordEl.parentNode) l.looseCordEl.parentNode.removeChild(l.looseCordEl);
    clearParticles();
    for (var k in actors){
      if (Object.prototype.hasOwnProperty.call(actors, k)) parkActor(actors[k]);
    }
    if (layer) layer.style.transform = '';
    return l;
  }

  function finish(){
    var l = teardown();
    if (l && l.resolve) l.resolve(l.errors);
  }

  /*
    Run a plan against a row of letter elements.
    Resolves when the performance is over, whatever happens to it.
    opts: { layer, card, groundY }
  */
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

    var cardRect = (opts.card || document.body).getBoundingClientRect();
    var payloads = els.map(function(el, i){ return makePayload(el, i); });
    var mirrored = !!plan.mirror;

    var entryFor = {};
    C.CHAR_ORDER.forEach(function(k, i){
      /* ground-bound characters always come in from a side */
      var side = C.CHARS[k].airborne
        ? (['left', 'right', 'up', 'left'])[(i + plan.letters) % 4]
        : (i % 2 ? 'right' : 'left');
      if (mirrored && side === 'left') side = 'right';
      else if (mirrored && side === 'right') side = 'left';
      entryFor[k] = side;
    });

    var ground = opts.groundY != null ? opts.groundY : Math.min(vh() - 20, cardRect.bottom - 8);
    var budget = plan.duration / timeScale;

    return new Promise(function(resolve){
      var settled = false;
      function once(errs){ if (settled) return; settled = true; resolve(errs || []); }

      live = {
        plan: plan, payloads: payloads, fired: [], strays: [], errors: [],
        t0: performance.now(), last: performance.now(),
        deadline: performance.now() + budget + 3000,
        groundY: ground,
        entryFor: entryFor, resolve: once, raf: null, shake: 0, guard: null,
        looseCord: null, looseCordEl: null, board: null, parade: null,
        wobbleUntil: 0, hauled: false
      };
      live.raf = requestAnimationFrame(frame);

      /* Guard 2: independent of the frame loop entirely. */
      live.guard = setTimeout(function(){
        if (settled) return;
        finish();
        once(['stall guard fired']);
      }, budget + 3400);
    });
  }

  /* Abort a performance and put every letter back where it started. */
  function stop(restore){
    var l = teardown();
    if (l && restore){
      l.payloads.forEach(function(p){ if (p.src) p.src.classList.remove('taken'); });
    }
    if (l && l.resolve) l.resolve(['aborted']);
  }

  /* ============================================================
     AMBIENT — the buddies who live on the ground between scenes.

     Each buddy runs a small loop of his own: wander somewhere, maybe show
     off, look around, wait a beat. The rules that make them feel like they
     share a world rather than slide past each other:

       * they know where the others are. Crossing someone's path, Zip ollies
         over him, Blip lifts over him, Flip cartwheels over him, and Trip —
         being Trip — walks straight into him and sits down;
       * they look at things: whatever the child just tapped, each other,
         the letters;
       * they react: a right answer gets a cheer, a wrong one a sympathetic
         shrug, and a poke gets a trick.
     ============================================================ */
  function startAmbient(o){
    o = o || {};
    if (!on) return;
    init(o.layer);
    if (live) return;
    stopAmbient();
    var keys = (o.keys || C.CHAR_ORDER).filter(function(k){ return !!actors[k]; });
    amb = {
      keys: keys, groundY: o.groundY, left: o.left == null ? 8 : o.left,
      right: o.right == null ? vw() - 8 : o.right, lineup: !!o.lineup,
      onTap: o.onTap || null, busy: {}, next: {}, t0: performance.now(), last: performance.now(),
      /* everyone has to fit on the ground: on a phone, four full-size
         characters would stand on each other's feet */
      sc: clamp((((o.right == null ? vw() - 8 : o.right) - (o.left == null ? 8 : o.left)) / keys.length) / 118, 0.72, 1)
    };
    var n = keys.length;
    var span = amb.right - amb.left;
    keys.forEach(function(k, i){
      var a = actors[k];
      parkActor(a);
      a.el.classList.add('tappable');
      /* walk (or fly, or roll, or cartwheel) in from the nearer side */
      var slot = amb.left + span * (n === 1 ? 0.5 : (0.13 + 0.74 * i / (n - 1)));
      slot = clamp(slot, amb.left + SIZE * 0.36, amb.right - SIZE * 0.36);
      var fromLeft = slot < vw() / 2;
      a.x = fromLeft ? -SIZE - 20 : vw() + 20;
      a.y = restY(a);
      a.sc = amb.sc;
      a.op = 1;
      var now = performance.now();
      move(a, now + i * 260, 900 + i * 120, { x: slot - SIZE / 2, y: restY(a), sc: amb.sc },
        { ease: 'back', effort: 0.7, spins: a.mode === 'acro' ? 1 : 0 });
      amb.home = amb.home || {};
      amb.home[k] = slot;
      amb.next[k] = now + 1800 + Math.random() * 2600 + i * 500;
    });
    ambRaf = requestAnimationFrame(ambFrame);
  }

  function restY(a){
    var g = amb ? amb.groundY : vh() - 20;
    var k = amb ? amb.sc : 1;
    /* the box scales about its centre, so the feet move with the scale */
    var y = g - SIZE / 2 - SIZE * 0.36 * k;
    if (a.mode === 'jet') y -= 26 * k;                   /* Blip hovers, always */
    return y;
  }

  function stopAmbient(){
    if (ambRaf) cancelAnimationFrame(ambRaf);
    ambRaf = null;
    if (!amb) return;
    var keys = amb.keys;
    amb = null;
    if (!live){
      keys.forEach(function(k){ parkActor(actors[k]); });
      clearParticles();
    } else {
      keys.forEach(function(k){ actors[k].el.classList.remove('tappable'); });
    }
  }

  function others(a){
    return amb.keys.filter(function(k){ return k !== a.key; }).map(function(k){ return actors[k]; });
  }

  /* Somebody standing between here and there? */
  function blocker(a, toX){
    var lo = Math.min(a.x, toX), hi = Math.max(a.x, toX);
    var list = others(a).filter(function(o){ return o.op > 0.5 && o.x > lo - SIZE * 0.3 && o.x < hi + SIZE * 0.3; });
    if (!list.length) return null;
    list.sort(function(p, q){ return Math.abs(p.x - a.x) - Math.abs(q.x - a.x); });
    return list[0];
  }

  function ambWander(a, now){
    var span = amb.right - amb.left;
    /* the drawn body is the middle ~70% of the box: keep all of it on screen */
    var lo = amb.left - SIZE * 0.14, hi = amb.right - SIZE * 0.86;
    var tx = freeSpot(a, function(){
      /* on the menu they stay near their mark in the line-up */
      return amb.lineup ? amb.home[a.key] - SIZE / 2 + rnd(-26, 26) : amb.left + Math.random() * span - SIZE / 2;
    }, lo, hi);
    var dist = Math.abs(tx - a.x);
    var speed = { jet: 0.32, board: 0.36, foot: 0.22, acro: 0.26 }[a.mode];
    var dur = clamp(dist / speed, 600, 3200);
    var ob = blocker(a, tx);
    var y = restY(a);
    if (ob && a.mode === 'foot' && Math.random() < 0.7){
      /* straight into him. bonk. */
      var stopX = ob.x + (a.x < ob.x ? -SIZE * 0.42 : SIZE * 0.42);
      a.look = centreOf(ob);
      move(a, now, clamp(Math.abs(stopX - a.x) / speed, 300, 2400), { x: stopX, y: y, sc: amb.sc }, {
        ease: 'inout', effort: 0.6,
        onEnd: function(){
          if (!amb) return;
          var t2 = performance.now();
          a.fallen = 1;
          setExpr(a, 'oops', 1400, t2);
          setExpr(ob, 'wow', 900, t2);
          ob.look = centreOf(a);
          SFX.play('bonk');
          dust(a.x + SIZE / 2, amb.groundY, 5);
          var back = a.x + (a.x < ob.x ? -30 : 30);
          move(a, t2, 520, { x: back, y: amb.groundY - SIZE * 0.5 + SIZE * 0.36 * (1 - amb.sc), sc: amb.sc }, {
            rotTo: (a.x < ob.x ? -1 : 1) * C.MAX_FALL_ROT * 0.55, ease: 'out', effort: 1,
            next: { dur: 700, to: { x: back, y: y, sc: amb.sc }, opts: { rotTo: 0, ease: 'back', effort: 0.4 } }
          });
          /* stand him up again when the second move begins */
          setTimeout(function(){ a.fallen = 0; }, 560 / timeScale);
          SFX.play('fall');
          amb.busy[a.key] = t2 + 1400;
        }
      });
      return dur;
    }
    var opts = { ease: 'inout', effort: 0.6 };
    if (ob){
      /* over the top of him, each in his own way */
      a.look = centreOf(ob);
      if (a.mode === 'board'){ opts.arc = 80; opts.styleY = 0; a.trick = { kind: 'kickflip', t0: now + dur * 0.3, dur: dur * 0.4 }; SFX.play('ollie'); }
      else if (a.mode === 'jet'){ opts.arc = 120; SFX.play('thrust'); }
      else if (a.mode === 'acro'){ opts.arc = 110; opts.spins = 1; SFX.play('whoosh'); }
      setExpr(ob, 'wow', dur, now);
      ob.look = centreOf(a);
    }
    move(a, now, dur, { x: tx, y: y, sc: amb.sc }, opts);
    return dur;
  }

  /*
    Personal space. Try a few spots and take the first that keeps him clear
    of where everyone else is (or is heading); failing that, the roomiest.
    Without this they drift into a heap, one hidden behind another.
  */
  function freeSpot(a, propose, lo, hi){
    var need = SIZE * 0.62 * amb.sc, best = null, bestGap = -1;
    for (var i = 0; i < 8; i++){
      var x = clamp(propose(), lo, hi);
      var gap = Infinity;
      others(a).forEach(function(o){
        var ox = o.anim ? o.anim.tx : o.x;
        gap = Math.min(gap, Math.abs(ox - x));
      });
      if (gap >= need) return x;
      if (gap > bestGap){ bestGap = gap; best = x; }
    }
    return best == null ? clamp(a.x, lo, hi) : best;
  }

  function ambTrick(a, now){
    var pick = Math.random();
    var y = restY(a);
    switch (a.mode){
      case 'jet':
        if (pick < 0.5){
          setExpr(a, 'happy', 900, now);
          move(a, now, 900, { x: a.x, y: y - 60, sc: amb.sc }, { roll: 1, rotTo: 0, ease: 'inout', effort: 1,
            next: { dur: 600, to: { x: a.x, y: y, sc: amb.sc }, opts: { ease: 'back', effort: 0.4 } } });
          SFX.play('thrust');
          return 1500;
        }
        /* a burst of thrust, a hard brake, a lean — on the spot in the line-up */
        var dx = amb.lineup ? 0 : (a.x < vw() / 2 ? 1 : -1) * 90;
        move(a, now, 420, { x: a.x + dx, y: y - 16, sc: amb.sc }, { ease: 'out', effort: 1,
          next: { dur: 420, to: { x: a.x + dx * 0.6, y: y, sc: amb.sc }, opts: { rotTo: 0, ease: 'back', effort: 1 } } });
        SFX.play('brake');
        return 900;
      case 'board':
        a.trick = { kind: 'kickflip', t0: now, dur: 640 };
        setExpr(a, 'happy', 800, now);
        move(a, now, 640, { x: a.x, y: y, sc: amb.sc }, { arc: 60, styleY: 0, rotTo: 0, ease: 'linear', effort: 1 });
        SFX.play('kickflip');
        return 900;
      case 'foot':
        if (pick < 0.45){
          /* a trip over nothing at all */
          setExpr(a, 'wow', 500, now);
          move(a, now, 300, { x: a.x + 20, y: y - 6, sc: amb.sc }, { rotTo: 22, ease: 'out', effort: 1,
            next: { dur: 360, to: { x: a.x + 26, y: y, sc: amb.sc }, opts: { rotTo: 0, ease: 'back', effort: 0.5 } } });
          SFX.play('snag');
          return 800;
        }
        a.trick = { kind: 'wave', t0: now, dur: 1200 };
        setExpr(a, 'happy', 1200, now);
        return 1300;
      case 'acro': {
        var dir = a.x < vw() / 2 ? 1 : -1;
        setExpr(a, 'happy', 900, now);
        if (pick < 0.5){
          var cx = amb.lineup ? amb.home[a.key] - SIZE / 2 : freeSpot(a, function(){ return a.x + dir * rnd(80, 130); },
            amb.left - SIZE * 0.14, amb.right - SIZE * 0.86);
          move(a, now, 820, { x: cx, y: y, sc: amb.sc },
            { spins: 1, arc: 40, ease: 'inout', effort: 1 });
        } else {
          /* a backflip on the spot */
          move(a, now, 760, { x: a.x, y: y, sc: amb.sc }, { spins: -1, arc: 90, styleY: 0, ease: 'inout', effort: 1 });
        }
        sparkle(a.x + SIZE / 2, y + SIZE * 0.4, 4);
        SFX.play('whoosh');
        return 950;
      }
    }
    return 800;
  }

  function ambFrame(now){
    if (!amb){ ambRaf = null; return; }
    if (live){ ambRaf = requestAnimationFrame(ambFrame); return; }
    var dt = Math.min(48, now - amb.last);
    amb.last = now;
    for (var i = 0; i < amb.keys.length; i++){
      var a = actors[amb.keys[i]];
      if (!a.anim && now >= (amb.busy[a.key] || 0) && now >= amb.next[a.key]){
        var r = Math.random();
        var took;
        if (r < 0.52) took = ambWander(a, now);
        else if (r < 0.84) took = ambTrick(a, now);
        else { a.look = pickLook(a); took = 900; }
        amb.next[a.key] = now + took + rnd(1400, 4200);
      }
      stepActor(a, now);
      /* breathing, or hovering for Blip, whenever he is not mid-move */
      a.bob = a.anim ? 0 : (a.mode === 'jet' ? Math.sin(now / 420 + i) * 5 : Math.sin(now / 600 + i) * 1.2);
      poseActor(a, now);
      writeActor(a);
      writeShadow(a, amb.groundY);
      emit(a, now, amb.groundY);
    }
    ambRaf = requestAnimationFrame(ambFrame);
  }

  function pickLook(a){
    var list = others(a);
    if (list.length && Math.random() < 0.6){
      var o = list[Math.floor(Math.random() * list.length)];
      return centreOf(o);
    }
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

  /*
    React to what the child is doing.
      'cheer' — right answer: everyone on the ground celebrates, each his way
      'oops'  — wrong answer: a kind shrug, never a laugh
      'look'  — they turn to look at a point on the screen
  */
  function react(kind, point){
    if (!amb || live) return;
    var now = performance.now();
    if (kind === 'wave'){
      /* a nudge: someone turns to where the answer is and waves at it */
      var pickW = amb.keys.filter(function(k){ return !actors[k].fallen; });
      if (!pickW.length) return;
      var wv = actors[pickW[Math.floor(Math.random() * pickW.length)]];
      wv.look = point || null;
      wv.trick = { kind: 'wave', t0: now, dur: 1400 };
      setExpr(wv, 'wow', 700, now);
      amb.busy[wv.key] = now + 1500;
      return;
    }
    if (kind === 'hop'){
      /* one buddy, not the whole crowd, celebrates each small win */
      var free = amb.keys.filter(function(k){ var q = actors[k]; return !q.fallen && now >= (amb.busy[k] || 0); });
      if (!free.length) return;
      var h = actors[free[Math.floor(Math.random() * free.length)]];
      h.look = point || null;
      setExpr(h, 'happy', 800, now);
      move(h, now, 460, { x: h.x, y: restY(h), sc: amb.sc }, { arc: 30, styleY: 0, rotTo: 0, ease: 'linear', effort: 0.6 });
      amb.busy[h.key] = now + 500;
      return;
    }
    amb.keys.forEach(function(k, i){
      var a = actors[k];
      if (a.fallen) return;
      var y = restY(a);
      if (kind === 'look'){
        a.look = point || null;
        return;
      }
      var delay = i * 90;
      if (kind === 'cheer'){
        a.look = null;
        a.trick = { kind: 'cheer', t0: now + delay, dur: 700 };
        setExpr(a, 'happy', 1300, now);
        move(a, now + delay, 700, { x: a.x, y: y, sc: amb.sc },
          { arc: a.mode === 'jet' ? 70 : 50, styleY: 0, rotTo: 0, spins: a.mode === 'acro' ? 1 : 0, ease: 'linear', effort: 1 });
        if (a.mode === 'acro'){ a.trick = null; a.anim.rotMode = 'style'; }
        amb.busy[k] = now + delay + 800;
      } else if (kind === 'oops'){
        a.trick = { kind: 'shrug', t0: now + delay, dur: 900 };
        setExpr(a, 'oops', 1000, now);
        amb.busy[k] = now + delay + 950;
      }
    });
  }

  return {
    init: init, play: play, stop: stop,
    idle: function(){ return !live; },
    enabled: function(){ return on; },
    setEnabled: function(v){ on = !!v; if (!on){ stop(false); stopAmbient(); } },
    setTimeScale: function(v){ timeScale = Math.max(0.25, Math.min(8, Number(v) || 1)); },
    actors: function(){ return actors; },
    ambient: { start: startAmbient, stop: stopAmbient, react: react, active: function(){ return !!amb; } },
    debug: function(){
      if (!live) return null;
      return {
        id: live.plan.id, t: (performance.now() - live.t0) * timeScale,
        states: live.payloads.map(function(p){ return p.state; }),
        errors: live.errors.slice()
      };
    }
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createStage: createStage };
