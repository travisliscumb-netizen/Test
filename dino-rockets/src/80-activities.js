/* ============================================================
   ACTIVITIES — the five ways a word is practised.

     MEET     see it, hear it, tap any letter to hear its name
     ZAP      meteors fly past carrying words: zap the one you hear
     BUILD    letter crystals into the rocket's fuel cells, in order
     MISSING  the word with gaps: fill each from three believable letters
     BLAST    the word is hidden: spell it from memory on the launch pad

   Each activity is handed a context and calls ctx.done(result) exactly
   once. Nothing here outlives its screen: every timer goes through
   env.later and every loop checks env.alive, both keyed to the screen
   token, so leaving mid-activity stops everything by construction.
   ============================================================ */
function createActivities(env){
  var C = env.C, $ = env.$, $all = env.$all, el = env.el;

  var HEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';

  /* ---------- building blocks ---------- */
  function tileEl(ch, tag){
    var t = el(tag || 'div', 'tile');
    t.setAttribute('data-letter', ch);
    if ((tag || 'div') === 'button'){ t.type = 'button'; t.setAttribute('aria-label', 'Letter ' + ch); }
    t.appendChild(el('span', 'up', ch));
    t.appendChild(el('span', 'lo', ch.toLowerCase()));
    return t;
  }
  function slotEl(){ var s = el('div', 'slot'); s.appendChild(el('span', 'up', '')); s.appendChild(el('span', 'lo', '')); return s; }
  function fillSlot(s, ch){
    s.querySelector('.up').textContent = ch;
    s.querySelector('.lo').textContent = ch.toLowerCase();
    s.classList.remove('next', 'gap');
    s.classList.add('filled');
    s.setAttribute('aria-label', ch);
  }
  function markNext(slots, i){ slots.forEach(function(s, k){ s.classList.toggle('next', k === i && !s.classList.contains('filled')); }); }
  function centre(node){ var r = node.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function fitTile(box, n, maxT){
    var w = box.clientWidth - 24;
    var big = window.innerWidth >= 700 ? 1.5 : 1;       /* a tablet gets tablet-sized letters */
    return Math.max(34, Math.min((maxT || 80) * big, Math.floor(w / (n + 0.12 * (n - 1)))));
  }
  function hearBtn(big){
    var b = el('button', 'hear' + (big ? ' big' : ''));
    b.type = 'button'; b.setAttribute('aria-label', 'Hear the word'); b.innerHTML = HEAR;
    return b;
  }
  function wireHear(b, word){
    b.addEventListener('click', function(){
      b.classList.add('talking');
      env.sayWord(word, { dedupeMs: 0 }).then(function(){ b.classList.remove('talking'); });
    });
  }
  /* the real tile flies into the slot, so he sees the letter he picked arrive */
  function flyTo(tile, slot, done){
    var a = tile.getBoundingClientRect(), b = slot.getBoundingClientRect();
    var dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    var cur = tile.style.transform || '';
    tile.classList.remove('dragging', 'returning', 'float');
    tile.classList.add('flying');
    tile.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) ' + cur + ' scale(' + (b.width / a.width).toFixed(3) + ')';
    env.later(function(){ tile.classList.remove('flying'); done(); }, 300);
  }
  /* drag owned by the tile itself, with pointer capture: nothing leaks */
  function makeDraggable(tile, onTap, onDrop){
    var start = null, dragging = false, pid = null;
    function reset(){ start = null; dragging = false; if (pid != null){ try { tile.releasePointerCapture(pid); } catch (e){} } pid = null; }
    tile.addEventListener('pointerdown', function(e){
      if (tile.classList.contains('used') || tile.classList.contains('flying')) return;
      start = { x: e.clientX, y: e.clientY }; pid = e.pointerId;
      try { tile.setPointerCapture(pid); } catch (err){}
    });
    tile.addEventListener('pointermove', function(e){
      if (!start || e.pointerId !== pid) return;
      var dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!dragging && dx * dx + dy * dy > 64){ dragging = true; tile.classList.remove('returning', 'float'); tile.classList.add('dragging'); }
      if (dragging) tile.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.08)';
    });
    tile.addEventListener('pointerup', function(e){
      if (!start || e.pointerId !== pid) return;
      var was = dragging, x = e.clientX, y = e.clientY;
      reset();
      if (!was){ onTap(); return; }
      if (!onDrop(x, y)){ tile.classList.remove('dragging'); tile.classList.add('returning'); tile.style.transform = ''; }
    });
    tile.addEventListener('pointercancel', function(e){ if (e.pointerId !== pid) return; reset(); tile.classList.remove('dragging'); tile.style.transform = ''; });
    tile.addEventListener('click', function(e){ if (e.detail === 0) onTap(); });
  }
  function slotUnder(slots, x, y){
    for (var i = 0; i < slots.length; i++){
      var r = slots[i].getBoundingClientRect(), pad = r.width * 0.3;
      if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return i;
    }
    return -1;
  }
  /* ============================================================
     THE FUEL DOCK — every right answer fuels the rocket. A glowing drop
     falls from the letter he placed into its cell on the fuel line, the
     tank in the rocket's window rises, and when it is full the engines
     light. The same rocket takes off at the countdown.
     ============================================================ */
  function fuelDock(root, n, opts){
    opts = opts || {};
    var box = el('div', 'fuel-dock' + (opts.big ? ' big' : ''));
    var pipe = el('div', 'fuel-pipe');
    var cells = [];
    for (var i = 0; i < n; i++){ var c = el('i', 'cell'); c.appendChild(el('b')); pipe.appendChild(c); cells.push(c); }
    var rk = el('div', 'fuel-rocket');
    rk.innerHTML = env.rocketSvg ? env.rocketSvg() : '';
    var tank = el('div', 'tank'), level = el('i', 'level');
    tank.appendChild(level); rk.appendChild(tank);
    var label = el('span', 'fuel-label', 'FUEL');
    box.appendChild(label); box.appendChild(pipe); box.appendChild(rk);
    root.appendChild(box);
    var filled = 0, done = {};
    function setLevel(){
      var pct = Math.round(filled / n * 100);
      level.style.height = pct + '%';
      label.textContent = filled >= n ? 'FULL!' : 'FUEL';
      if (filled >= n && !box.classList.contains('ready')){
        box.classList.add('ready');
        env.sfx.play('ignite');
        env.later(function(){ env.sfx.play('rumble'); }, 200);
      }
    }
    return {
      el: box, rocket: rk,
      /* instantly, for letters that were already in place */
      set: function(i){ if (done[i]) return; done[i] = 1; filled++; cells[i].classList.add('full', 'quiet'); setLevel(); },
      /* a drop of fuel from `from` (an element) into cell i */
      fill: function(i, from){
        if (i == null){ i = 0; while (done[i] && i < n) i++; }
        if (i >= n || done[i]) return;
        done[i] = 1;
        var cell = cells[i];
        var a = from ? centre(from) : centre(cell), b = centre(cell);
        var drop = el('i', 'fuel-drop');
        drop.style.left = a.x + 'px'; drop.style.top = a.y + 'px';
        document.body.appendChild(drop);
        var dx = b.x - a.x, dy = b.y - a.y;
        var ms = 380;
        try {
          drop.animate([
            { transform: 'translate(-50%,-50%) scale(.6)', opacity: 1 },
            { transform: 'translate(calc(-50% + ' + (dx * 0.5) + 'px), calc(-50% + ' + (dy * 0.5 - 30) + 'px)) scale(1.1)', opacity: 1, offset: 0.5 },
            { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(.5)', opacity: 0.9 }
          ], { duration: ms, easing: 'cubic-bezier(.4,0,.6,1)' });
        } catch (e){ ms = 0; }
        env.later(function(){
          if (drop.parentNode) drop.parentNode.removeChild(drop);
          cell.classList.add('full');
          filled++; setLevel();
          env.sfx.play('glug');
        }, ms);
        /* the drop must never outlive the screen */
        setTimeout(function(){ if (drop.parentNode) drop.parentNode.removeChild(drop); }, ms + 600);
      },
      full: function(){ return filled >= n; }
    };
  }

  function shake(node){ node.classList.remove('nope'); void node.offsetWidth; node.classList.add('nope'); }

  /* ============================================================
     MEET
     ============================================================ */
  function meet(ctx){
    var w = ctx.word, root = ctx.root;
    root.innerHTML = '';
    root.classList.add('meet');
    var row = el('div', 'prompt-row');
    row.appendChild(el('p', 'prompt', 'Meet your word!'));
    var hb = hearBtn(false); wireHear(hb, w); row.appendChild(hb);
    root.appendChild(row);
    var holo = el('div', 'holo');
    var slotsBox = el('div', 'slots');
    holo.appendChild(slotsBox);
    holo.appendChild(el('div', 'lower', w.toLowerCase()));
    holo.appendChild(el('div', 'meet-hint', 'Tap a letter to hear it'));
    root.appendChild(holo);
    root.style.setProperty('--tile', fitTile(root, w.length, 76) + 'px');
    var slots = w.split('').map(function(ch, i){
      var s = slotEl(); fillSlot(s, ch);
      s.setAttribute('role', 'button'); s.tabIndex = 0;
      s.addEventListener('click', function(){
        env.sfx.play('tap');
        env.speech.say(env.soundOf(ch), { dedupeMs: 0, key: 'meet:' + i, keep: true });
        s.classList.add('lit'); env.later(function(){ s.classList.remove('lit'); }, 360);
        env.react('look', centre(s));
      });
      slotsBox.appendChild(s);
      return s;
    });
    var go = el('button', 'btn btn-launch', "I'm ready! ›");
    go.type = 'button'; go.hidden = true;
    go.addEventListener('click', function(){ env.sfx.play('tap'); ctx.done({}); });
    root.appendChild(go);
    env.later(function(){
      env.speech.say('This word is: ' + w.toLowerCase(), { rate: 0.85 }).then(function(ok){
        if (!env.alive(ctx.tok)) return;
        return env.spellSlots(w, slots);
      }).then(function(){
        if (!env.alive(ctx.tok)) return;
        go.hidden = false;
        return env.sayWord(w, { dedupeMs: 0 });
      });
    }, 350);
    /* nobody should be stuck here: the button appears anyway */
    env.later(function(){ go.hidden = false; }, 1500 + w.length * 900);
    env.setNudge(function(){ go.hidden = false; env.react('wave', centre(go)); env.speech.say('Tap ready when you are!', { dedupeMs: 0 }); });
  }

  /* ============================================================
     ZAP — meteors with words drift across space
     ============================================================ */
  function zap(ctx){
    var w = ctx.word, root = ctx.root, round = 0, ROUNDS = 2, locked = false;
    root.innerHTML = '';
    var row = el('div', 'prompt-row');
    row.appendChild(el('p', 'prompt', 'Zap the word you hear!'));
    var hb = hearBtn(false); wireHear(hb, w); row.appendChild(hb);
    root.appendChild(row);
    var field = el('div', 'zap-field');
    root.appendChild(field);
    var dock = fuelDock(root, ROUNDS);
    var roundLbl = el('div', 'zap-round', '');
    root.appendChild(roundLbl);
    var meteors = [], raf = null, last = 0;

    function startRound(){
      round++;
      locked = false;
      roundLbl.textContent = 'Round ' + round + ' of ' + ROUNDS;
      meteors.forEach(function(m){ if (m.el.parentNode) m.el.parentNode.removeChild(m.el); });
      meteors = [];
      var opts = C.zapOptions(w, round === 1 ? 3 : 4);
      var W = field.clientWidth, H = field.clientHeight;
      var lanes = opts.length;
      opts.forEach(function(word, i){
        var m = el('button', 'meteor', word.toLowerCase());
        m.type = 'button';
        field.appendChild(m);
        var dir = i % 2 ? -1 : 1;
        var mw = m.offsetWidth || 130, mh = m.offsetHeight || 74;
        var speed = (round === 1 ? 0.045 : 0.07) * (0.8 + Math.random() * 0.4);
        var laneY = (H - mh) * (lanes === 1 ? 0.5 : (0.08 + 0.84 * i / (lanes - 1)));
        var o = { el: m, word: word, x: Math.random() * Math.max(10, W - mw), y: laneY, vx: dir * speed, w: mw, h: mh, bob: Math.random() * 6, hit: false };
        if (dir < 0) m.classList.add('left');
        m.addEventListener('click', function(){ tapMeteor(o); });
        meteors.push(o);
      });
      last = performance.now();
      if (!raf) raf = requestAnimationFrame(loop);
      env.later(function(){ env.speech.say((round === 1 ? 'Zap the word: ' : 'Again! Zap: ') + w.toLowerCase(), { rate: 0.85 }); }, 300);
    }
    function loop(now){
      if (!env.alive(ctx.tok) || !field.isConnected){ raf = null; return; }
      var dt = Math.min(48, now - last); last = now;
      var W = field.clientWidth;
      meteors.forEach(function(m){
        if (m.hit) return;
        m.x += m.vx * dt;
        if (m.x < 4){ m.x = 4; m.vx = Math.abs(m.vx); m.el.classList.remove('left'); }
        if (m.x > W - m.w - 4){ m.x = W - m.w - 4; m.vx = -Math.abs(m.vx); m.el.classList.add('left'); }
        var yy = m.y + Math.sin(now / 500 + m.bob) * 6;
        m.el.style.transform = 'translate(' + m.x.toFixed(1) + 'px,' + yy.toFixed(1) + 'px) rotate(' + (Math.sin(now / 700 + m.bob) * 4).toFixed(1) + 'deg)';
      });
      raf = requestAnimationFrame(loop);
    }
    function laser(to){
      var fr = field.getBoundingClientRect();
      var from = { x: fr.width / 2, y: fr.height + 10 };
      var tx = to.x - fr.left, ty = to.y - fr.top;
      var dx = tx - from.x, dy = ty - from.y, len = Math.sqrt(dx * dx + dy * dy);
      var l = el('div', 'laser');
      l.style.left = from.x + 'px'; l.style.top = from.y + 'px'; l.style.width = len + 'px';
      l.style.transform = 'rotate(' + Math.atan2(dy, dx) + 'rad)';
      field.appendChild(l);
      env.later(function(){ if (l.parentNode) l.parentNode.removeChild(l); }, 260);
    }
    function boom(m){
      var fr = field.getBoundingClientRect(), c = centre(m.el);
      var cols = ['#FFC53D', '#FF8A1F', '#fff', '#8FE3FF'];
      for (var i = 0; i < 14; i++){
        var p = el('i', null);
        p.style.cssText = 'position:absolute;width:10px;height:10px;border-radius:3px;left:' + (c.x - fr.left) + 'px;top:' + (c.y - fr.top) + 'px;background:' + cols[i % 4];
        field.appendChild(p);
        var ang = Math.random() * Math.PI * 2, r = 40 + Math.random() * 60;
        try { p.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(' + Math.cos(ang) * r + 'px,' + Math.sin(ang) * r + 'px) scale(.2)', opacity: 0 }], { duration: 600, easing: 'ease-out' }); } catch (e){}
        (function(pp){ env.later(function(){ if (pp.parentNode) pp.parentNode.removeChild(pp); }, 620); })(p);
      }
    }
    function tapMeteor(m){
      if (locked || m.hit) return;
      env.react('look', centre(m.el));
      if (m.word === w){
        locked = true; m.hit = true;
        laser(centre(m.el));
        env.sfx.play('zap');
        env.later(function(){
          boom(m); env.sfx.play('explode');
          dock.fill(round - 1, m.el);
          m.el.style.opacity = '0'; m.el.classList.add('hit');
          env.react('cheer');
          env.speech.say(env.pick('found', env.FOUND) + ' ' + w.toLowerCase(), { rate: 0.9, keep: true });
        }, 140);
        /* the next round waits for the praise to be heard, not a guessed delay */
        var praised = false, gone = false;
        function next(){ if (!praised || !gone || !env.alive(ctx.tok)) return; if (round < ROUNDS) startRound(); else { raf = null; ctx.done({}); } }
        env.later(function(){ gone = true; next(); }, 1100);
        (function waitSpeech(){
          env.later(function(){ if (!env.speech.busy()){ praised = true; next(); } else waitSpeech(); }, 150);
        })();
      } else {
        m.el.classList.remove('wrong'); void m.el.offsetWidth; m.el.classList.add('wrong');
        env.sfx.play('wrong'); env.react('oops');
        env.later(function(){ env.speech.say(env.pick('try', env.TRY) + ' ' + w.toLowerCase(), { dedupeMs: 0, rate: 0.85 }); }, 350);
      }
    }
    env.later(startRound, 80);
    env.setNudge(function(){
      if (locked) return;
      var right = meteors.filter(function(m){ return m.word === w; })[0];
      if (right) env.react('wave', centre(right.el));
      env.speech.say('Which one says ' + w.toLowerCase() + '?', { dedupeMs: 0, rate: 0.85 });
    });
  }

  /* ============================================================
     BUILD — letter crystals into fuel cells
     ============================================================ */
  function build(ctx){
    var w = ctx.word, root = ctx.root, pos = 0, misses = 0, finished = false;
    root.innerHTML = '';
    var row = el('div', 'prompt-row');
    var pr = el('p', 'prompt'); pr.innerHTML = 'Fuel the rocket: <b>' + w.toLowerCase() + '</b>';
    row.appendChild(pr);
    var hb = hearBtn(false); wireHear(hb, w); row.appendChild(hb);
    root.appendChild(row);
    var slotsBox = el('div', 'slots'), tray = el('div', 'tray');
    root.appendChild(slotsBox);
    var dock = fuelDock(root, w.length);
    root.appendChild(tray);
    root.appendChild(el('p', 'hint', 'Tap or drag the crystals in order'));
    root.style.setProperty('--tile', fitTile(root, w.length, 76) + 'px');
    var perRow = Math.ceil(w.length / (w.length > 5 ? 2 : 1));
    tray.style.setProperty('--tile', Math.max(fitTile(root, w.length, 76), fitTile(root, perRow + 1, 74), 52) + 'px');
    var slots = w.split('').map(function(){ var s = slotEl(); slotsBox.appendChild(s); return s; });
    markNext(slots, 0);
    function hint(){
      var need = w[pos], done = false;
      $all('.tile', tray).forEach(function(t){
        var on = !done && !t.classList.contains('used') && t.getAttribute('data-letter') === need;
        if (on) done = true;
        t.classList.toggle('next-hint', on);
      });
    }
    function wrong(t){
      misses++; shake(t); env.sfx.play('wrong'); env.react('oops');
      if (misses >= 2){ env.later(function(){ env.speech.say('Find ' + env.soundOf(w[pos]), { dedupeMs: 0 }); }, 300); hint(); }
    }
    function place(t){
      var i = pos; pos++; misses = 0;
      $all('.tile', tray).forEach(function(x){ x.classList.remove('next-hint'); });
      env.sfx.play('place');
      env.speech.say(env.soundOf(w[i]), { dedupeMs: 0, key: 'build:' + i, keep: true });
      if (i < w.length - 1) env.react('hop', centre(slots[i]));
      flyTo(t, slots[i], function(){
        t.classList.add('used'); t.style.transform = '';
        fillSlot(slots[i], w[i]); markNext(slots, pos);
        dock.fill(i, slots[i]);
        if (pos === w.length && !finished){ finished = true; env.clearNudge(); ctx.done({ slots: slots }); }
      });
    }
    function tryTile(t){
      if (finished || t.classList.contains('used') || t.classList.contains('flying')) return false;
      env.react('look', centre(t));
      if (t.getAttribute('data-letter') === w[pos]){ place(t); return true; }
      wrong(t); return false;
    }
    C.scramble(w).forEach(function(ch, i){
      var t = tileEl(ch, 'button');
      t.classList.add('float');
      t.style.animationDelay = (-i * 0.37) + 's';
      makeDraggable(t, function(){ tryTile(t); }, function(x, y){
        var at = slotUnder(slots, x, y);
        if (at === -1) return false;
        if (at !== pos){ wrong(t); return false; }
        return tryTile(t);
      });
      tray.appendChild(t);
    });
    env.later(function(){ env.speech.say('Fuel the rocket. Spell ' + w.toLowerCase(), { rate: 0.85, keep: true }); }, 350);
    env.setNudge(function(){
      if (finished) return;
      hint();
      var t = $('.tile.next-hint', tray);
      if (t) env.react('wave', centre(t));
      env.speech.say('Find ' + env.soundOf(w[pos]), { dedupeMs: 0, rate: 0.85 });
    });
  }

  /* ============================================================
     MISSING — fill the gaps
     ============================================================ */
  function missing(ctx){
    var w = ctx.word, root = ctx.root, finished = false;
    var gaps = C.missingSlots(w, ctx.stat && ctx.stat.posMisses);
    var gi = 0, misses = 0;
    root.innerHTML = '';
    var row = el('div', 'prompt-row');
    var pr = el('p', 'prompt'); pr.innerHTML = 'Missing pieces! <b>' + w.toLowerCase() + '</b>';
    row.appendChild(pr);
    var hb = hearBtn(false); wireHear(hb, w); row.appendChild(hb);
    root.appendChild(row);
    var slotsBox = el('div', 'slots');
    root.appendChild(slotsBox);
    var dock = fuelDock(root, w.length);
    var choices = el('div', 'choices');
    root.appendChild(choices);
    root.appendChild(el('p', 'hint', 'Which letter goes in the glowing box?'));
    root.style.setProperty('--tile', fitTile(root, w.length, 76) + 'px');
    var slots = w.split('').map(function(ch, i){
      var s = slotEl();
      if (gaps.indexOf(i) === -1){ fillSlot(s, ch); dock.set(i); }
      slotsBox.appendChild(s);
      return s;
    });
    function showGap(){
      slots.forEach(function(s, i){ s.classList.toggle('gap', i === gaps[gi] && !s.classList.contains('filled')); });
      choices.innerHTML = '';
      misses = 0;
      var need = w[gaps[gi]];
      C.missingChoices(need).forEach(function(ch){
        var t = tileEl(ch, 'button');
        t.addEventListener('click', function(){
          if (finished || t.classList.contains('flying')) return;
          env.react('look', centre(t));
          if (ch === need){
            var i = gaps[gi];
            env.sfx.play('place');
            env.speech.say(env.soundOf(ch), { dedupeMs: 0, key: 'miss:' + i, keep: true });
            flyTo(t, slots[i], function(){
              t.classList.add('used');
              fillSlot(slots[i], ch);
              dock.fill(i, slots[i]);
              gi++;
              if (gi >= gaps.length){ finished = true; choices.innerHTML = ''; env.clearNudge(); ctx.done({ slots: slots }); }
              else { env.react('hop', centre(slots[i])); showGap(); }
            });
          } else {
            misses++; shake(t); env.sfx.play('wrong'); env.react('oops');
            if (misses >= 2){
              $all('.tile', choices).forEach(function(x){ x.classList.toggle('next-hint', x.getAttribute('data-letter') === need); });
              env.later(function(){ env.speech.say('Find ' + env.soundOf(need), { dedupeMs: 0 }); }, 300);
            }
          }
        });
        choices.appendChild(t);
      });
    }
    showGap();
    env.later(function(){ env.speech.say('Fill in the missing letters. ' + w.toLowerCase(), { rate: 0.85, keep: true }); }, 350);
    env.setNudge(function(){
      if (finished) return;
      var need = w[gaps[gi]];
      var t = $all('.tile', choices).filter(function(x){ return x.getAttribute('data-letter') === need; })[0];
      if (t){ t.classList.add('next-hint'); env.react('wave', centre(t)); }
      env.speech.say(w.toLowerCase() + '. Find ' + env.soundOf(need), { dedupeMs: 0, rate: 0.85 });
    });
  }

  /* ============================================================
     BLAST — spell it from memory
     ============================================================ */
  function blast(ctx){
    var w = ctx.word, root = ctx.root, pos = 0, finished = false;
    var result = { misses: 0, missPositions: [], peeked: false };
    var posMiss = {};
    root.innerHTML = '';
    var row = el('div', 'prompt-row');
    var pr = el('p', 'prompt', ctx.review ? 'Zap the Meteor King! Spell it' : 'Blast off! Spell it from memory');
    row.appendChild(pr);
    var hb = hearBtn(false); wireHear(hb, w); row.appendChild(hb);
    root.appendChild(row);
    var slotsBox = el('div', 'slots');
    root.appendChild(slotsBox);
    var dock = fuelDock(root, w.length, { big: true });
    var keys = el('div', 'keys');
    root.appendChild(keys);
    root.style.setProperty('--tile', fitTile(root, w.length, 70) + 'px');
    var slots = w.split('').map(function(){ var s = slotEl(); slotsBox.appendChild(s); return s; });
    markNext(slots, 0);
    var keyList = C.blastKeys(w);
    keys.style.gridTemplateColumns = 'repeat(' + (keyList.length > 8 ? 5 : 4) + ',1fr)';
    function peek(){
      result.peeked = true;
      var p = el('div', 'peek', w);
      root.appendChild(p);
      env.sfx.play('powerup');
      env.sayWord(w, { dedupeMs: 0 });
      env.later(function(){ if (p.parentNode) p.parentNode.removeChild(p); }, 1700);
    }
    function glow(){
      $all('.key', keys).forEach(function(k){ k.classList.toggle('hint', k.getAttribute('data-letter') === w[pos]); });
    }
    keyList.forEach(function(ch){
      var k = el('button', 'key', ch);
      k.type = 'button'; k.setAttribute('data-letter', ch); k.setAttribute('aria-label', 'Letter ' + ch);
      k.addEventListener('click', function(){
        if (finished) return;
        if (ch === w[pos]){
          var i = pos; pos++;
          $all('.key', keys).forEach(function(x){ x.classList.remove('hint'); });
          fillSlot(slots[i], ch); markNext(slots, pos);
          dock.fill(i, slots[i]);
          env.sfx.play('place');
          env.speech.say(env.soundOf(ch), { dedupeMs: 0, key: 'blast:' + i, keep: true });
          if (pos === w.length){ finished = true; env.clearNudge(); ctx.done({ slots: slots, result: result }); }
          else env.react('hop', centre(slots[i]));
        } else {
          result.misses++; result.missPositions.push(pos);
          posMiss[pos] = (posMiss[pos] || 0) + 1;
          shake(k); env.sfx.play('wrong'); env.react('oops');
          if (posMiss[pos] === 2){ peek(); glow(); }
          else if (posMiss[pos] > 2) glow();
        }
      });
      keys.appendChild(k);
    });
    env.later(function(){ env.speech.say('Spell ' + w.toLowerCase() + ' from memory!', { rate: 0.85, keep: true }); }, 350);
    /* a stall first gets the word again; only a second stall shows the key,
       and that counts as help, so the word keeps its practice next time */
    var nudges = 0;
    env.setNudge(function(){
      if (finished) return;
      nudges++;
      env.sayWord(w, { dedupeMs: 0 });
      if (nudges < 2) return;
      result.peeked = true;
      glow();
      var k = $all('.key', keys).filter(function(x){ return x.getAttribute('data-letter') === w[pos]; })[0];
      if (k) env.react('wave', centre(k));
    });
  }

  /* ============================================================
     LETTER RACE — the word flashes up, vanishes, and he races a comet
     to catch its letters as they float about. Winning is a bonus;
     finishing is always a success.
     ============================================================ */
  function race(ctx){
    var w = ctx.word, root = ctx.root, pos = 0, finished = false, started = false, misses = 0, t0 = 0, raf = null, won = false;
    root.innerHTML = '';
    var row = el('div', 'prompt-row');
    var pr = el('p', 'prompt'); pr.innerHTML = 'Letter race! <b>' + w.toLowerCase() + '</b>';
    row.appendChild(pr);
    var hb = hearBtn(false); wireHear(hb, w); row.appendChild(hb);
    root.appendChild(row);
    var slotsBox = el('div', 'slots'); root.appendChild(slotsBox);
    var dock = fuelDock(root, w.length);
    var track = el('div', 'race-track');
    var me = el('i', 'race-me', '🚀'), comet = el('i', 'race-comet', '☄️'), flag = el('i', 'race-flag', '🏁');
    track.appendChild(flag); track.appendChild(comet); track.appendChild(me);
    root.appendChild(track);
    var field = el('div', 'zap-field race-field'); root.appendChild(field);
    root.style.setProperty('--tile', fitTile(root, w.length, 64) + 'px');
    var slots = w.split('').map(function(){ var s = slotEl(); slotsBox.appendChild(s); return s; });
    var budget = 3500 + w.length * 2300;
    /* he sees it first, then it goes and he has to remember it */
    slots.forEach(function(s, i){ fillSlot(s, w[i]); s.classList.add('preview'); });
    var tiles = [];
    function begin(){
      if (!env.alive(ctx.tok)) return;
      slots.forEach(function(s){ s.classList.remove('filled', 'preview'); s.querySelector('.up').textContent = ''; s.querySelector('.lo').textContent = ''; });
      markNext(slots, 0);
      var W = field.clientWidth, H = field.clientHeight;
      var letters = C.raceLetters(w);
      /* start spread over a grid, so no letter begins hidden under another */
      var cols = Math.max(2, Math.ceil(Math.sqrt(letters.length * W / Math.max(1, H)))), rowsN = Math.ceil(letters.length / cols);
      var cells = C.shuffle(letters.map(function(_, i){ return i; }));
      letters.forEach(function(ch, i){
        var t = tileEl(ch, 'button'); t.classList.add('race-tile');
        field.appendChild(t);
        var tw = t.offsetWidth || 56, th = t.offsetHeight || 60;
        var cell = cells[i], cx = (cell % cols + 0.5) * W / cols, cy = (Math.floor(cell / cols) + 0.5) * H / rowsN;
        var o = { el: t, ch: ch, x: Math.max(2, Math.min(W - tw - 2, cx - tw / 2 + (Math.random() - 0.5) * 10)), y: Math.max(2, Math.min(H - th - 2, cy - th / 2 + (Math.random() - 0.5) * 10)), w: tw, h: th,
                  vx: (Math.random() < 0.5 ? -1 : 1) * (0.03 + Math.random() * 0.03), vy: (Math.random() < 0.5 ? -1 : 1) * (0.02 + Math.random() * 0.03), used: false };
        t.addEventListener('click', function(){ tap(o); });
        tiles.push(o);
      });
      started = true; t0 = performance.now();
      env.sfx.play('go');
      env.speech.say('Go! Spell ' + w.toLowerCase(), { rate: 0.9 });
      raf = requestAnimationFrame(loop);
    }
    var last = 0;
    function loop(now){
      if (!env.alive(ctx.tok) || !field.isConnected){ raf = null; return; }
      var dt = Math.min(48, now - (last || now)); last = now;
      var W = field.clientWidth, H = field.clientHeight;
      tiles.forEach(function(o){
        if (o.used) return;
        o.x += o.vx * dt; o.y += o.vy * dt;
        if (o.x < 2 || o.x > W - o.w - 2){ o.vx = -o.vx; o.x = Math.max(2, Math.min(W - o.w - 2, o.x)); }
        if (o.y < 2 || o.y > H - o.h - 2){ o.vy = -o.vy; o.y = Math.max(2, Math.min(H - o.h - 2, o.y)); }
      });
      /* letters bump off each other, so the one he needs is never hidden */
      var live = tiles.filter(function(o){ return !o.used; });
      for (var i = 0; i < live.length; i++) for (var j = i + 1; j < live.length; j++){
        var a = live[i], b = live[j];
        var dx = (b.x + b.w / 2) - (a.x + a.w / 2), dy = (b.y + b.h / 2) - (a.y + a.h / 2);
        var ox = (a.w + b.w) / 2 + 4 - Math.abs(dx), oy = (a.h + b.h) / 2 + 4 - Math.abs(dy);
        if (ox > 0 && oy > 0){
          if (ox < oy){ var sx = dx < 0 ? -1 : 1; a.x -= sx * ox / 2; b.x += sx * ox / 2; var tvx = a.vx; a.vx = b.vx; b.vx = tvx; }
          else { var sy = dy < 0 ? -1 : 1; a.y -= sy * oy / 2; b.y += sy * oy / 2; var tvy = a.vy; a.vy = b.vy; b.vy = tvy; }
        }
      }
      live.forEach(function(o){
        o.x = Math.max(2, Math.min(W - o.w - 2, o.x)); o.y = Math.max(2, Math.min(H - o.h - 2, o.y));
        o.el.style.transform = 'translate(' + o.x.toFixed(1) + 'px,' + o.y.toFixed(1) + 'px)';
      });
      if (!finished){
        var cp = Math.min(1, (now - t0) / budget);
        comet.style.left = (cp * 88) + '%';
        me.style.left = (pos / w.length * 88) + '%';
      }
      raf = requestAnimationFrame(loop);
    }
    function tap(o){
      if (!started || finished || o.used) return;
      env.react('look', centre(o.el));
      if (o.ch === w[pos]){
        var i = pos; pos++; misses = 0;
        o.used = true;
        tiles.forEach(function(q){ q.el.classList.remove('next-hint'); });
        env.sfx.play('place');
        env.speech.say(env.soundOf(w[i]), { dedupeMs: 0, key: 'race:' + i, keep: true });
        o.el.style.transform = 'translate(' + o.x.toFixed(1) + 'px,' + o.y.toFixed(1) + 'px)';
        flyTo(o.el, slots[i], function(){
          o.el.classList.add('used');
          fillSlot(slots[i], w[i]); markNext(slots, pos);
          dock.fill(i, slots[i]);
          me.style.left = (pos / w.length * 88) + '%';
          if (pos === w.length && !finished){
            finished = true; env.clearNudge();
            won = performance.now() - t0 < budget;
            track.classList.add(won ? 'won' : 'done');
            if (won){ env.sfx.play('powerup'); env.toast('🏁 You beat the comet!'); }
            ctx.done({ slots: slots, won: won });
          } else if (pos < w.length) env.react('hop', centre(slots[i]));
        });
      } else {
        misses++; shake(o.el); env.sfx.play('wrong'); env.react('oops');
        if (misses >= 2){
          var right = tiles.filter(function(q){ return !q.used && q.ch === w[pos]; })[0];
          if (right) right.el.classList.add('next-hint');
          env.later(function(){ env.speech.say('Find ' + env.soundOf(w[pos]), { dedupeMs: 0 }); }, 300);
        }
      }
    }
    env.later(function(){ env.speech.say('Here is your word: ' + w.toLowerCase() + '. Remember it!', { rate: 0.85 }); }, 300);
    env.later(begin, 2300);
    env.setNudge(function(){
      if (finished || !started) return;
      var right = tiles.filter(function(q){ return !q.used && q.ch === w[pos]; })[0];
      if (right){ right.el.classList.add('next-hint'); env.react('wave', centre(right.el)); }
      env.speech.say('Find ' + env.soundOf(w[pos]), { dedupeMs: 0, rate: 0.85 });
    });
  }

  /* ============================================================
     SPELL CHECK — which one is spelled right? (in his grown-up's
     sentence, when there is one)
     ============================================================ */
  function check(ctx){
    var w = ctx.word, root = ctx.root, finished = false;
    root.innerHTML = '';
    var row = el('div', 'prompt-row');
    row.appendChild(el('p', 'prompt', 'Which one is spelled right?'));
    var hb = hearBtn(false); wireHear(hb, w); row.appendChild(hb);
    root.appendChild(row);
    var sentence = ctx.sentence || '';
    if (sentence){
      var sp = el('p', 'sentence');
      sentence.split(/(\s+)/).forEach(function(tok){
        if (tok.replace(/[^A-Za-z]/g, '').toUpperCase() === w) sp.appendChild(el('span', 'blank', '?'));
        else sp.appendChild(document.createTextNode(tok));
      });
      root.appendChild(sp);
    }
    var box = el('div', 'opt-cards');
    root.appendChild(box);
    var dock = fuelDock(root, 1);
    C.checkOptions(w).forEach(function(opt){
      var b = el('button', 'opt-card', opt.toLowerCase()); b.type = 'button';
      b.addEventListener('click', function(){
        if (finished || b.classList.contains('nope-done')) return;
        env.react('look', centre(b));
        if (opt === w){
          finished = true; env.clearNudge();
          b.classList.add('right');
          $all('.opt-card', box).forEach(function(x){ if (x !== b) x.classList.add('dim'); });
          env.sfx.play('correct'); env.react('cheer');
          dock.fill(0, b);
          var blank = $('.blank', root); if (blank){ blank.textContent = w.toLowerCase(); blank.classList.add('fill'); }
          env.speech.say(env.pick('found', env.FOUND) + ' That spells ' + w.toLowerCase() + '.', { rate: 0.9, keep: true }).then(function(){
            if (env.alive(ctx.tok)) env.later(function(){ ctx.done({}); }, 300);
          });
        } else {
          b.classList.add('nope-done'); shake(b);
          env.sfx.play('wrong'); env.react('oops');
          env.later(function(){ env.speech.say('Not that one. Look closely at each letter.', { dedupeMs: 0, rate: 0.9 }); }, 250);
        }
      });
      box.appendChild(b);
    });
    env.later(function(){
      env.speech.say(sentence ? sentence + '. Which ' + w.toLowerCase() + ' is spelled right?' : 'Which one spells ' + w.toLowerCase() + '?', { rate: 0.85, keep: true });
    }, 350);
    env.setNudge(function(){
      if (finished) return;
      var right = $all('.opt-card', box).filter(function(x){ return x.textContent === w.toLowerCase(); })[0];
      if (right) env.react('wave', centre(right));
      env.speech.say('Which one spells ' + w.toLowerCase() + '?', { dedupeMs: 0, rate: 0.85 });
    });
  }

  /* ============================================================
     RHYME TIME — which word rhymes? The shared ending lights up.
     ============================================================ */
  function rhyme(ctx){
    var w = ctx.word, root = ctx.root, finished = false;
    var data = C.rhymeOptions(w);
    if (!data){ ctx.done({}); return; }
    var rime = C.rimeOf(w);
    root.innerHTML = '';
    var row = el('div', 'prompt-row');
    var pr = el('p', 'prompt'); pr.innerHTML = 'What rhymes with <b>' + w.toLowerCase() + '</b>?';
    row.appendChild(pr);
    var hb = hearBtn(false); wireHear(hb, w); row.appendChild(hb);
    root.appendChild(row);
    function withRime(word){
      var lw = word.toLowerCase(), r = rime.toLowerCase(), at = lw.lastIndexOf(r);
      if (!r || at === -1 || at + r.length !== lw.length) return document.createTextNode(lw);
      var f = document.createDocumentFragment();
      f.appendChild(document.createTextNode(lw.slice(0, at)));
      f.appendChild(el('span', 'rime', lw.slice(at)));
      return f;
    }
    var big = el('div', 'rhyme-word'); big.appendChild(withRime(w)); root.appendChild(big);
    var box = el('div', 'opt-cards'); root.appendChild(box);
    var dock = fuelDock(root, 1);
    data.options.forEach(function(opt){
      var b = el('button', 'opt-card', opt.toLowerCase()); b.type = 'button';
      b.addEventListener('click', function(){
        if (finished || b.classList.contains('nope-done')) return;
        env.react('look', centre(b));
        if (opt === data.answer){
          finished = true; env.clearNudge();
          b.textContent = ''; b.appendChild(withRime(opt)); b.classList.add('right');
          $all('.opt-card', box).forEach(function(x){ if (x !== b) x.classList.add('dim'); });
          env.sfx.play('correct'); env.react('cheer');
          dock.fill(0, b);
          env.speech.say(w.toLowerCase() + ', ' + opt.toLowerCase() + '. They rhyme!', { rate: 0.85, keep: true }).then(function(){
            if (env.alive(ctx.tok)) env.later(function(){ ctx.done({}); }, 300);
          });
        } else {
          b.classList.add('nope-done'); shake(b);
          env.sfx.play('wrong'); env.react('oops');
          env.later(function(){ env.speech.say(w.toLowerCase() + ', ' + opt.toLowerCase() + '. No rhyme. Try another!', { dedupeMs: 0, rate: 0.85 }); }, 250);
        }
      });
      box.appendChild(b);
    });
    env.later(function(){
      env.speech.say('What rhymes with ' + w.toLowerCase() + '? ' + data.options.map(function(x){ return x.toLowerCase(); }).join(', ') + '?', { rate: 0.8, keep: true });
    }, 350);
    env.setNudge(function(){
      if (finished) return;
      env.speech.say('Say them out loud. Which one ends like ' + w.toLowerCase() + '?', { dedupeMs: 0, rate: 0.85 });
    });
  }

  return {
    meet: meet, zap: zap, build: build, missing: missing, blast: blast, race: race, check: check, rhyme: rhyme,
    tileEl: tileEl, slotEl: slotEl, fillSlot: fillSlot, centre: centre, fitTile: fitTile, fuelDock: fuelDock
  };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { createActivities: createActivities };
