/* ============================================================
   STAGE — the performance engine.

   A scene plan (pure data, from 20-core.js) is executed here against a
   requestAnimationFrame clock. rAF rather than keyframes because a tow cord
   joins two independently moving points: no keyframe can express "the
   letter does not move until the slack runs out".

   Everything has an explicit state. A letter is idle, held, roped, stacked,
   free or gone, and it can only ever be in one of them. A letter is never
   deleted to make it go away — it is carried, towed, popped or dropped, and
   the child can see which. That is the cure for "letters disappear without
   visible cause".

   Cleanup is unconditional. Whatever happens — the scene ends, the child
   taps Back, the tab is hidden, a device drops frames, an event handler
   throws — teardown() runs, every prop is removed and every actor is
   parked. Two independent stall guards back it up: the frame loop checks a
   wall-clock deadline, and the returned promise races a timer of its own.
   Either alone is enough to unfreeze the game.
   ============================================================ */
function createStage(deps){
  deps = deps || {};
  var C = deps.core;
  var SFX = deps.sfx || { play: function(){} };
  var layer = null, cordSvg = null;
  var actors = {}, live = null, inited = false;
  var on = deps.enabled !== false;

  var SIZE = 148;          /* actor box, px; the drawn body is ~56% of it */
  var REST = 110;          /* cord length: slack until he travels this far */
  var GRAV = 0.0021;       /* px per ms^2 */

  /* ---------- easing ---------- */
  function clamp01(v){ return v < 0 ? 0 : (v > 1 ? 1 : v); }
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
  var EASES = { out:easeOut, inout:easeInOut, back:easeBack, anticipate:easeAnticipate, snap:easeSnap };

  /* ---------- setup ---------- */
  function init(el){
    layer = el || layer;
    if (!layer || inited) return;
    inited = true;
    cordSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    cordSvg.setAttribute('class', 'cordlayer');
    cordSvg.setAttribute('aria-hidden', 'true');
    layer.appendChild(cordSvg);               /* first: cords sit behind everyone */

    C.CHAR_ORDER.forEach(function(key){
      var d = document.createElement('div');
      d.className = 'actor actor-' + key;
      d.id = 'actor-' + key;
      d.innerHTML = deps.art[key]();
      layer.appendChild(d);
      var a = {
        key: key, el: d, mode: C.CHARS[key].mode,
        x: -600, y: -600, sc: 1, rot: 0, op: 0,
        anim: null, phase: 0, effort: 0, fallen: 0, holding: [],
        rig: collectRig(d)
      };
      actors[key] = a;
      writeActor(a);
    });
  }

  /* Cache the rig groups and their pivots once, not every frame. */
  function collectRig(root){
    var out = {};
    ['arm-l','arm-r','leg-l','leg-r','head','antenna','board','tail','jet','jet2'].forEach(function(cls){
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

  function vw(){ return window.innerWidth; }
  function vh(){ return window.innerHeight; }

  function rot(part, deg){
    if (!part) return;
    part.el.setAttribute('transform', 'rotate(' + deg.toFixed(1) + ' ' + part.px + ' ' + part.py + ')');
  }

  /* ---------- writing ---------- */
  function writeActor(a){
    a.el.style.opacity = a.op;
    a.el.style.transform = 'translate3d(' + Math.round(a.x) + 'px,' + Math.round(a.y) + 'px,0) scale(' +
      a.sc.toFixed(3) + ') rotate(' + a.rot.toFixed(1) + 'deg)';
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

    if (a.fallen > 0){
      /* on his backside: legs up, arms out, nothing swinging */
      rot(r['leg-l'], -46 * a.fallen); rot(r['leg-r'], -62 * a.fallen);
      rot(r['arm-l'], 38 * a.fallen); rot(r['arm-r'], -30 * a.fallen);
      rot(r.head, -12 * a.fallen);
      return;
    }

    switch (a.mode){
      case 'foot': {
        /* a real run cycle: legs alternate, arms counter-swing, head bobs */
        var s = moving ? Math.sin(beat * 15) : Math.sin(beat * 2.2) * 0.18;
        rot(r['leg-l'], s * 30);
        rot(r['leg-r'], -s * 30);
        rot(r['arm-l'], -s * 26);
        rot(r['arm-r'], s * 26);
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
        var trail = moving ? 26 : 8;
        rot(r['leg-l'], trail); rot(r['leg-r'], trail * 0.8);
        rot(r['arm-l'], -trail * 0.7); rot(r['arm-r'], -trail * 0.5);
        rot(r.antenna, -trail * 0.5);
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
        rot(r.tail, -24 - 34 * ext);
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
      fop: a.op, top: opts.op == null ? 1 : opts.op,
      effort: opts.effort == null ? 0.5 : opts.effort,
      onEnd: opts.onEnd || null, next: opts.next || null
    };
  }

  function stepActor(a, t){
    var an = a.anim;
    if (!an){ a.effort *= 0.92; return; }
    var p = clamp01((t - an.t0) / an.dur);
    var e = an.ease(p);
    a.phase = p;
    a.effort = an.effort * (1 - Math.abs(p - 0.4));
    a.x = lerp(an.fx, an.tx, e);
    a.y = lerp(an.fy, an.ty, e) + C.styleOffsetY(a.mode, p) * an.styleY;
    a.sc = lerp(an.fsc, an.tsc, e);
    a.op = lerp(an.fop, an.top, Math.min(1, p * 3));
    a.rot = an.rotMode === 'lerp'
      ? lerp(an.rotFrom, an.rotTo, e)
      : C.styleRot(a.mode, p, an.dirX, an.spins);
    if (p >= 1){
      var done = an.onEnd, nxt = an.next;
      a.anim = null;
      if (done){ try { done(); } catch (err){} }
      if (nxt) move(a, t, nxt.dur, nxt.to, nxt.opts || {});
    }
  }

  /* ---------- letters ---------- */
  function hookOf(a){ return { x: a.x + SIZE * 0.5, y: a.y + SIZE * 0.74 }; }

  /*
    Hand a letter to a character. Each additional letter is fanned out and
    up, so an armful of four reads as four letters rather than one tile with
    three hidden behind it.
  */
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
      var meet = { x: Math.max(-SIZE * 0.3, Math.min(vw() - SIZE * 0.7, pl.x - SIZE * 0.5)),
                   y: ground - SIZE * 0.86 };
      var dropDur = Math.max(260, dur * 0.40);
      move(a, t, dropDur, meet, {
        ease: 'out', effort: 0.6,
        onEnd: function(){ takeHold(a, pl, cx, cy); SFX.play(sound); },
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

  function stepPayload(pl, t, dt){
    if (pl.state === 'gone') return;

    if (pl.state === 'stacked'){
      /* sits where it was put and wobbles, until something takes it */
      pl.x += (pl.stackX - pl.x) * 0.22;
      pl.y += (pl.stackY - pl.y) * 0.22;
      pl.rot = pl.offRot + Math.sin(t / 240 + pl.idx * 1.3) * 1.8;
      return;
    }

    if (pl.state === 'held'){
      var a = actors[pl.owner];
      if (!a) return;
      pl.x = a.x + pl.offX; pl.y = a.y + pl.offY;
      pl.rot = pl.spinWith ? a.rot + pl.offRot : lerp(pl.rot, pl.offRot, 0.2);
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

    if (pl.state === 'free'){
      pl.vy += GRAV * dt;
      pl.x += pl.vx * dt;
      pl.y += pl.vy * dt;
      pl.rot += pl.spin * dt;
      if (pl.y > pl.groundY){
        pl.y = pl.groundY;
        if (Math.abs(pl.vy) > 0.06){ SFX.play('bonk'); }
        pl.vy = -pl.vy * 0.42;
        pl.vx *= 0.68; pl.spin *= 0.5;
        if (Math.abs(pl.vy) < 0.08){ pl.vy = 0; pl.spin = 0; }
      }
    }
  }

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
  }

  function shake(px){
    if (!layer || !on) return;
    live && (live.shake = Math.max(live.shake || 0, px));
  }

  function makePayload(srcEl, idx){
    var r = srcEl.getBoundingClientRect();
    var wrap = document.createElement('div');
    wrap.className = 'letterprop';
    wrap.style.width = r.width + 'px';
    wrap.style.height = r.height + 'px';
    var clone = srcEl.cloneNode(true);
    clone.style.margin = '0';
    clone.style.width = r.width + 'px';
    clone.style.height = r.height + 'px';
    clone.classList.remove('knocked', 'sliced', 'taken', 'over');
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

  function edgeFor(dir, ground){
    switch (dir){
      case 'up':    return { x: vw() * 0.5 - SIZE / 2, y: -SIZE - 70 };
      case 'down':  return { x: vw() * 0.5 - SIZE / 2, y: vh() + 90 };
      case 'left':  return { x: -SIZE - 90, y: ground };
      default:      return { x: vw() + 90, y: ground };
    }
  }

  /* Where a character stands to work on a letter: beside it, not on it. */
  function beside(pl, a, ground, side){
    var s = side == null ? -1 : side;
    var x = pl.x + s * (pl.w * 0.5 + SIZE * 0.42) - SIZE / 2;
    var y = (a.mode === 'foot' || a.mode === 'board')
      ? ground - SIZE * 0.86
      : pl.y - SIZE * 0.92;
    return { x: Math.max(-SIZE * 0.4, Math.min(vw() - SIZE * 0.6, x)), y: y };
  }

  function burst(pl){
    var n = 8;
    for (var i = 0; i < n; i++){
      (function(i){
        var s = document.createElement('div');
        s.className = 'shard';
        var ang = (Math.PI * 2 * i) / n + Math.random() * 0.5;
        s.style.left = (pl.x - 6) + 'px';
        s.style.top = (pl.y - 6) + 'px';
        s.style.background = ['#2E7DF7', '#F0862B', '#34B764', '#FF4D4D', '#F5C53D'][i % 5];
        layer.appendChild(s);
        try{
          s.animate([
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: 'translate(' + Math.cos(ang) * 96 + 'px,' + (Math.sin(ang) * 96 + 46) + 'px) scale(.2)', opacity: 0 }
          ], { duration: 620, easing: 'cubic-bezier(.2,.7,.3,1)' }).finished
            .catch(function(){}).then(function(){ s.remove(); });
        }catch(err){ live && live.strays.push(s); }
      })(i);
    }
  }

  /* ============================================================
     EVENT HANDLERS — one per beat kind the scene library emits.
     Any kind with no handler is a no-op rather than a crash, so adding a
     beat to a scene can never wedge a performance mid-way.
     ============================================================ */
  function fire(e, t){
    var a = actors[e.char];
    var pl = (e.letter != null) ? live.payloads[e.letter] : null;
    var ground = live.groundY;

    switch (e.kind){

      case 'enter': {
        if (!a) break;
        var target = pl || live.payloads[0];
        var from = edgeFor(live.entryFor[e.char] || 'left', ground - SIZE * 0.86);
        a.x = from.x; a.y = from.y; a.op = 0; a.sc = 0.82; a.fallen = 0;
        var to = target ? beside(target, a, ground, -1)
                        : { x: vw() * 0.42, y: ground - SIZE * 0.86 };
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
        var h = beside(pl, a, ground, -1);
        move(a, t, e.dur, { x: h.x, y: h.y, sc: 1 }, { ease: 'back', effort: 0.6 });
        SFX.play('cord');
        break;
      }
      /* He moves off; the cord pays out but stays loose — the letter must
         not so much as twitch here, or the snap that follows means nothing. */
      case 'slack': {
        if (!a || !pl) break;
        var away = { x: a.x + (a.mode === 'jet' ? 70 : 82), y: a.y - (a.mode === 'jet' ? 26 : 0) };
        move(a, t, e.dur, { x: away.x, y: away.y, sc: 1 }, { ease: 'out', effort: 0.45 });
        break;
      }
      /* Far enough that the rope constraint bites: stepPayload fires the
         jolt and the sound the moment it actually goes taut. */
      case 'snap': {
        if (!a || !pl) break;
        var far = { x: a.x + 86, y: a.y - (a.mode === 'jet' ? 18 : 0) };
        move(a, t, e.dur, { x: far.x, y: far.y, sc: 1 }, { ease: 'snap', effort: 1 });
        break;
      }
      case 'resist': {
        /* he pulls and it does not come: strain, then it gives */
        if (!a) break;
        move(a, t, e.dur, { x: a.x + 16, y: a.y - 6, sc: 0.99 }, { ease: 'inout', effort: 1 });
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
        var to = edgeFor(e.dir, ground - SIZE * 0.86);
        move(a, t, e.dur, { x: to.x, y: to.y, sc: 0.88 },
          { ease: 'inout', spins: a.mode === 'acro' ? 2 : 0, effort: 0.9 });
        SFX.play('yank');
        break;
      }

      /* ---- carrying ---- */
      case 'scoop':
      case 'carry': {
        if (!a || !pl) break;
        var lift = (e.kind === 'scoop' && a.mode === 'board') ? SIZE * 0.20 : SIZE * 0.58;
        var away = edgeFor(e.dir || 'left', ground - SIZE * 0.86);
        collect(a, pl, t, e.dur, SIZE * 0.56, lift, away,
                e.kind === 'scoop' ? 'scoop' : 'pickup');
        break;
      }
      /* Caught out of the air, mid-rotation. */
      case 'snatch': {
        if (!a || !pl) break;
        takeHold(a, pl, SIZE * 0.62, SIZE * 0.26);
        pl.spinWith = (a.mode === 'acro');
        move(a, t, e.dur, { x: pl.x - SIZE / 2 + 44, y: pl.y - SIZE * 0.5, sc: 1.04 },
          { ease: 'back', spins: a.mode === 'acro' ? 1 : 0, effort: 0.9 });
        SFX.play('catch');
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
        var baseX = Math.max(tileH * 1.1, Math.min(vw() - tileH * 1.1, homeX));
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
          x: baseX - tileH * 0.6 - SIZE * 0.72,
          y: (a.mode === 'jet' || a.mode === 'acro') ? baseY - SIZE * 0.80 : ground - SIZE * 0.86
        };
        move(a, t, e.dur, { x: sp.x, y: sp.y, sc: 1 }, { ease: 'back', effort: 0.7 });
        SFX.play('stack');
        break;
      }
      /* The tower answers for the block that was pulled out from under it. */
      case 'topple': {
        var from = e.from == null ? 1 : e.from;
        var falling = [];
        live.payloads.forEach(function(q, i){ if (i >= from && q.state !== 'gone') falling.push(q); });
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
        SFX.play('topple');
        shake(9);
        break;
      }

      case 'pop': {
        if (!pl) break;
        burst(pl);
        pl.state = 'gone'; pl.op = 0;
        if (a) move(a, t, e.dur, { x: a.x + 26, y: a.y - 18, sc: 1.05 },
          { ease: 'back', spins: a.mode === 'acro' ? 1 : 0, effort: 0.6 });
        SFX.play('pop');
        break;
      }

      /* ---- Zip ---- */
      case 'ollie': {
        if (!a) break;
        var over = actors[e.over];
        var lx = over ? over.x + 30 : a.x + 150;
        move(a, t, e.dur, { x: lx, y: a.y, sc: 1 }, { ease: 'out', styleY: 2.2, effort: 1 });
        SFX.play('ollie');
        break;
      }
      case 'grind': {
        if (!a) break;
        move(a, t, e.dur, { x: vw() * 0.8 - SIZE / 2, y: ground - SIZE * 0.92, sc: 1 },
          { ease: 'inout', effort: 0.8 });
        SFX.play('grind');
        break;
      }

      /* ---- Blip ---- */
      case 'overshoot': {
        if (!a) break;
        move(a, t, e.dur, { x: Math.min(vw() + 30, a.x + 190), y: a.y - 24, sc: 0.95 },
          { ease: 'out', effort: 1 });
        SFX.play('thrust');
        break;
      }
      case 'brake': {
        if (!a) break;
        move(a, t, e.dur, { x: a.x - 66, y: a.y + 10, sc: 1.03 },
          { ease: 'back', rotTo: a.mode === 'jet' ? -16 : 0, effort: 1 });
        SFX.play('brake');
        break;
      }

      /* ---- Trip ---- */
      case 'snag': {
        if (!a) break;
        /* the foot catches: he keeps going from the waist up */
        move(a, t, e.dur, { x: a.x + 26, y: a.y - 8, sc: 1 }, { ease: 'out', rotTo: 22, effort: 1 });
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
          pl.vx = 0.13; pl.vy = -0.24; pl.spin = 0.30;
        }
        a.fallen = 1;
        move(a, t, e.dur, { x: a.x + 44, y: ground - SIZE * 0.46, sc: 1 },
          { rotTo: C.MAX_FALL_ROT * 0.62, ease: 'out', effort: 1 });
        SFX.play('fall');
        shake(7);
        break;
      }
      case 'dustoff': {
        if (!a) break;
        a.fallen = 0;
        move(a, t, e.dur, { x: a.x + 18, y: ground - SIZE * 0.86, sc: 1 },
          { rotTo: 0, ease: 'back', effort: 0.4 });
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
          pl.owner = e.char; pl.state = 'held';
          pl.offX = SIZE * 0.5 - pl.hx; pl.offY = SIZE * 0.86 - pl.hy; pl.offRot = -5;
        }
        var ro = edgeFor(e.dir || 'left', ground - SIZE * 0.8);
        move(a, t, e.dur, { x: ro.x, y: ro.y, sc: 0.9 },
          { ease: 'inout', spins: a.mode === 'acro' ? 2 : 0, effort: 0.9 });
        SFX.play('rescue');
        break;
      }
      case 'dropcord': {
        /* the cord stays lying across the scene as an obstacle */
        live.looseCord = { x1: vw() * 0.14, x2: vw() * 0.86, y: ground - 8 };
        break;
      }

      /* ---- Flip ---- */
      case 'cartwheel': {
        if (!a || !pl) break;
        move(a, t, e.dur, { x: pl.x - SIZE * 0.9, y: pl.y - SIZE * 0.3, sc: 1 },
          { spins: 1, ease: 'inout', effort: 0.9 });
        SFX.play('whoosh');
        break;
      }
      case 'aerial': {
        if (!a) break;
        move(a, t, e.dur, { x: a.x + 90, y: a.y - 70, sc: 1.02 },
          { spins: 2, ease: 'out', effort: 1 });
        SFX.play('whoosh');
        break;
      }

      /* ---- two-hander beats ---- */
      case 'tug': {
        if (!a) break;
        var other = actors[e.other];
        move(a, t, e.dur, { x: a.x - 30, y: a.y, sc: 1 }, { ease: 'inout', effort: 1 });
        if (other) move(other, t, e.dur, { x: other.x + 30, y: other.y, sc: 1 }, { ease: 'inout', effort: 1 });
        SFX.play('strain');
        break;
      }
      case 'realise': {
        if (!a) break;
        var o2 = actors[e.other];
        move(a, t, e.dur, { x: a.x, y: a.y - 10, sc: 1 }, { rotTo: -10, ease: 'back', effort: 0.2 });
        if (o2) move(o2, t, e.dur, { x: o2.x, y: o2.y - 10, sc: 1 }, { rotTo: 10, ease: 'back', effort: 0.2 });
        SFX.play('blink');
        break;
      }
      case 'notice': {
        if (!a) break;
        move(a, t, e.dur, { x: a.x - 12, y: a.y - 8, sc: 1 }, { rotTo: -12, ease: 'back', effort: 0.2 });
        SFX.play('blink');
        break;
      }

      case 'superpass': {
        if (!a) break;
        var sf = edgeFor('left', ground - SIZE * 0.66);
        a.x = sf.x; a.y = sf.y; a.op = 1; a.sc = 1.1;
        move(a, t, e.dur, edgeFor('right', ground - SIZE * 0.66),
          { spins: a.mode === 'acro' ? 3 : 0, ease: 'inout', op: 1, effort: 1 });
        SFX.play('super');
        break;
      }
      case 'flourish': {
        if (!a) break;
        if (a.op < 0.05){
          var ff = edgeFor('left', ground - SIZE * 0.86);
          a.x = ff.x; a.y = ff.y; a.sc = 0.82;
        }
        move(a, t, e.dur, edgeFor('right', ground - SIZE * 0.86),
          { spins: a.mode === 'acro' ? 2 : 0, op: 1, ease: 'inout', effort: 0.8 });
        SFX.play(a.mode === 'board' ? 'grind' : 'whoosh');
        break;
      }

      case 'exit': {
        if (!a) break;
        a.fallen = 0;
        move(a, t, e.dur, edgeFor(e.dir || 'right', ground - SIZE * 0.86),
          { spins: a.mode === 'acro' ? 2 : 0, op: 0, ease: 'inout', rotTo: a.mode === 'acro' ? null : 0, effort: 0.7 });
        break;
      }
    }
  }

  /* ---------- the loop ---------- */
  function frame(now){
    if (!live) return;
    var t = now - live.t0;
    var dt = Math.min(48, now - live.last);
    live.last = now;

    for (var i = 0; i < live.plan.events.length; i++){
      if (live.fired[i]) continue;
      var e = live.plan.events[i];
      if (e.at <= t){
        live.fired[i] = 1;
        try { fire(e, now); } catch (err){ live.errors.push(String(err && err.message || err)); }
      }
    }

    for (var k in actors){
      if (!Object.prototype.hasOwnProperty.call(actors, k)) continue;
      stepActor(actors[k], now);
      poseActor(actors[k], now);
      writeActor(actors[k]);
    }
    for (var j = 0; j < live.payloads.length; j++){
      stepPayload(live.payloads[j], now, dt);
      writePayload(live.payloads[j]);
    }
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
    if (t >= live.plan.duration + 400 || now >= live.deadline){ finish(); return; }
    live.raf = requestAnimationFrame(frame);
  }

  /* ---------- teardown: unconditional ---------- */
  function teardown(){
    if (!live) return null;
    var l = live;
    live = null;
    if (l.raf) cancelAnimationFrame(l.raf);
    if (l.guard) clearTimeout(l.guard);
    l.payloads.forEach(function(p){
      if (p.cord && p.cord.parentNode) p.cord.parentNode.removeChild(p.cord);
      if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el);
    });
    l.strays.forEach(function(s){ if (s && s.parentNode) s.parentNode.removeChild(s); });
    for (var k in actors){
      if (!Object.prototype.hasOwnProperty.call(actors, k)) continue;
      var a = actors[k];
      a.anim = null; a.op = 0; a.x = -600; a.y = -600;
      a.rot = 0; a.sc = 1; a.fallen = 0; a.effort = 0; a.holding = [];
      writeActor(a);
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
  */
  function play(plan, letterEls, opts){
    opts = opts || {};
    var els = Array.prototype.slice.call(letterEls || []);

    if (!on || !plan || !plan.events.length || !els.length){
      els.forEach(function(e){ e.classList.add('taken'); });
      return Promise.resolve([]);
    }
    if (live) finish();
    init(opts.layer);

    var cardRect = (opts.card || document.body).getBoundingClientRect();
    var payloads = els.map(function(el, i){ return makePayload(el, i); });

    var entryFor = {};
    C.CHAR_ORDER.forEach(function(k, i){
      /* ground-bound characters always come in from a side */
      entryFor[k] = C.CHARS[k].airborne
        ? (['left', 'right', 'up', 'left'])[(i + plan.letters) % 4]
        : (i % 2 ? 'right' : 'left');
    });

    return new Promise(function(resolve){
      var settled = false;
      function once(errs){ if (settled) return; settled = true; resolve(errs || []); }

      live = {
        plan: plan, payloads: payloads, fired: [], strays: [], errors: [],
        t0: performance.now(), last: performance.now(),
        deadline: performance.now() + plan.duration + 3000,
        groundY: Math.min(vh() - 20, cardRect.bottom - 8),
        entryFor: entryFor, resolve: once, raf: null, shake: 0, guard: null,
        looseCord: null
      };
      live.raf = requestAnimationFrame(frame);

      /* Guard 2: independent of the frame loop entirely. */
      live.guard = setTimeout(function(){
        if (settled) return;
        finish();
        once(['stall guard fired']);
      }, plan.duration + 3400);
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

  return {
    init: init, play: play, stop: stop,
    idle: function(){ return !live; },
    enabled: function(){ return on; },
    setEnabled: function(v){ on = !!v; },
    actors: function(){ return actors; },
    debug: function(){
      if (!live) return null;
      return {
        id: live.plan.id, t: performance.now() - live.t0,
        states: live.payloads.map(function(p){ return p.state; }),
        errors: live.errors.slice()
      };
    }
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createStage: createStage };
