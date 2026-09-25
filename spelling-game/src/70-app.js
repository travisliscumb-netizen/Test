/* ============================================================
   APP — screens, the word round, and the grown-ups area.

   Flow for every word:  INTRO -> FIND -> BUILD -> (scene) -> LEARN -> (scene)
   and after the last word, DONE.

   Three rules hold the whole file together:
     1. go() is the only way to change screen, and it bumps a token. Every
        delayed action checks the token it was born with, so nothing from
        a screen the child has left can ever fire on the next one.
     2. speech.reset() runs on every screen change, so no voice carries
        over either (see 30-speech.js for why that matters).
     3. Listeners live on the element they serve. A tile owns its own
        pointer handlers and uses pointer capture, so re-rendering can
        never leak window listeners the way v5's drag did.
   ============================================================ */
(function(){
  'use strict';
  var C = __CORE;
  var STORE_KEY = 'graysons-spelling-game.v6';
  var PASSCODE = '9999';
  var params = new URLSearchParams(location.search);

  function $(sel, root){ return (root || document).querySelector(sel); }
  function $all(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, text){
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function clamp(v, lo, hi){ return v < lo ? lo : (v > hi ? hi : v); }

  /* ---------------- settings ---------------- */
  function load(){
    try { return C.normalizeSettings(JSON.parse(localStorage.getItem(STORE_KEY))); }
    catch (e){ return C.normalizeSettings(null); }
  }
  function save(){
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); return true; }
    catch (e){ return false; }
  }
  var S = load();

  /* ---------------- services ---------------- */
  var sfx = createSfx();
  sfx.setMuted(!S.sfx || params.has('mute'));
  var synth = ('speechSynthesis' in window) ? window.speechSynthesis : null;
  var speech = createSpeech({
    synth: synth,
    makeUtterance: function(text, o){
      var u = new SpeechSynthesisUtterance(text);
      u.rate = o.rate; u.pitch = 1.05; u.lang = 'en-US';
      if (o.voice) u.voice = o.voice;
      if (o.volume != null) u.volume = o.volume;
      return u;
    }
  });
  if (synth && synth.addEventListener) synth.addEventListener('voiceschanged', function(){ speech.pickVoice(); });

  var stage = createStage({ core: C, sfx: sfx, art: CHAR_ART });
  stage.init($('#fxLayer'));
  if (params.get('speed')) stage.setTimeScale(params.get('speed'));

  /* iOS will not speak or play a sound until a real tap has happened, and
     the first utterance has to start inside that tap. */
  var unlocked = false;
  function unlockAudio(){
    sfx.unlock();
    if (!unlocked){ unlocked = true; speech.prime(); }
    speech.unlock();
  }
  document.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });

  /* Praise that does not repeat itself: the same line every time stops
     meaning anything by the second week. Never the same one twice running. */
  var lastLine = {};
  function pick(kind, list){
    var pool = list.filter(function(x){ return x !== lastLine[kind]; });
    var line = pool[Math.floor(Math.random() * pool.length)];
    lastLine[kind] = line;
    return line;
  }
  var FOUND = ['Yes!', 'You got it!', 'Great listening!', "That's it!", 'Nice one!', 'Correct!'];
  var SPELLED = ['Awesome!', 'Super!', 'Way to go!', 'Brilliant!', 'Fantastic!', 'Woo hoo!'];
  var TRY = ['Try again.', 'Not quite. Listen.', 'Almost! Listen again.'];

  function soundOf(ch){ return C.letterSound(ch, C.letterOverrides(S)); }
  function sayWord(w, opts){ return speech.say(String(w).toLowerCase(), opts); }

  /* ---------------- screen control ---------------- */
  var screen = null, tok = 0, timers = [];
  function later(fn, ms){
    var mine = tok;
    var id = setTimeout(function(){ if (mine === tok) fn(); }, ms);
    timers.push(id);
    return id;
  }
  function alive(mine){ return mine === tok; }

  /*
    The nudge. A five-year-old who stalls for a few seconds is a
    five-year-old about to wander off. If nothing is tapped for a while the
    prompt is said again and a buddy waves at the answer — three times at
    most, so it helps rather than nags. Any tap resets the clock.
  */
  var nudge = null;
  function setNudge(fn){
    clearNudge();
    nudge = { fn: fn, count: 0, id: null, tok: tok };
    armNudge();
  }
  function armNudge(){
    if (!nudge) return;
    clearTimeout(nudge.id);
    if (nudge.count >= 3 || nudge.tok !== tok) return;
    nudge.id = setTimeout(function(){
      if (!nudge || nudge.tok !== tok || !stage.idle()) return;
      nudge.count++;
      try { nudge.fn(); } catch (e){}
      armNudge();
    }, 9000);
  }
  function clearNudge(){ if (nudge) clearTimeout(nudge.id); nudge = null; }
  document.addEventListener('pointerdown', function(){ if (nudge) armNudge(); }, { passive: true });

  var ENTER = {};
  function go(name, arg){
    tok++;
    clearNudge();
    timers.forEach(clearTimeout); timers = [];
    speech.reset();
    if (!stage.idle()) stage.stop(false);
    $('#confetti').innerHTML = '';
    var prev = screen;
    screen = name;
    $all('.screen').forEach(function(s){ s.classList.toggle('on', s.getAttribute('data-screen') === name); });
    document.body.setAttribute('data-screen', name);
    if (ENTER[name]) ENTER[name](arg, prev);
  }

  function groundY(){
    var g = $('#world .ground');
    return g.getBoundingClientRect().top + 10;
  }

  /* who is hanging around on the ground, and how */
  var buddyKeys = null, buddyLineup = false;
  function buddies(keys, lineup, force){
    /* the same buddies stay put from screen to screen; they only walk on
       again when the cast changes or after a scene has cleared the stage */
    var same = buddyKeys && keys.join() === buddyKeys.join() && buddyLineup === !!lineup;
    if (same && !force && stage.ambient.active()) return;
    buddyKeys = keys; buddyLineup = !!lineup;
    stage.ambient.start({
      keys: keys, groundY: groundY(), left: 6, right: window.innerWidth - 6, lineup: lineup,
      onTap: function(key){
        if (screen === 'menu' || screen === 'done'){
          speech.say("I'm " + C.CHARS[key].name + '!', { rate: 0.95 });
        }
      }
    });
  }
  function pickBuddies(){
    var lead = C.pickLead(S.leadHistory);
    var rest = C.shuffle(C.CHAR_ORDER.filter(function(k){ return k !== lead; }));
    return [rest[0], lead];
  }

  function theme(name){
    C.THEMES.forEach(function(t){ document.body.classList.toggle('theme-' + t, t === name); });
    S.theme = name; save();
  }

  var toastTimer = null;
  function toast(msg, ms){
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.classList.remove('on'); }, ms || 2600);
  }

  /* ---------------- building blocks ---------------- */
  function tileEl(ch, tag){
    var t = el(tag || 'div', 'tile');
    t.setAttribute('data-letter', ch);
    if ((tag || 'div') === 'button'){ t.type = 'button'; t.setAttribute('aria-label', 'Letter ' + ch); }
    t.appendChild(el('span', 'up', ch));
    t.appendChild(el('span', 'lo', ch.toLowerCase()));
    return t;
  }
  function slotEl(){
    var s = el('div', 'slot');
    s.appendChild(el('span', 'up', ''));
    s.appendChild(el('span', 'lo', ''));
    return s;
  }
  function fillSlot(s, ch){
    s.querySelector('.up').textContent = ch;
    s.querySelector('.lo').textContent = ch.toLowerCase();
    s.classList.remove('next');
    s.classList.add('filled');
    s.setAttribute('aria-label', ch);
  }
  function slotCentre(el){ var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function markNext(slots, i){
    slots.forEach(function(s, k){ s.classList.toggle('next', k === i); });
  }

  /* One tile size per word, so a ten-letter word still fits on a phone. */
  function fitTile(card, n, maxT){
    var w = card.clientWidth - 36;
    var t = Math.floor(w / (n + 0.12 * (n - 1)));
    return clamp(t, 34, maxT || 82);
  }

  function steps(stageName){
    var order = ['find', 'build', 'learn'];
    var at = order.indexOf(stageName);
    $all('.screen.on .steps li').forEach(function(li){
      var k = order.indexOf(li.getAttribute('data-step'));
      li.classList.toggle('done', k < at);
      li.classList.toggle('now', k === at);
    });
  }

  /* Fly a tile into a slot, then fill the slot. The travelling tile is the
     real one, so the child sees the letter he picked arrive. */
  function flyTo(tile, slot, done){
    var a = tile.getBoundingClientRect(), b = slot.getBoundingClientRect();
    var dx = (b.left + b.width / 2) - (a.left + a.width / 2);
    var dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    /* prepend the screen-space move to whatever it already has (a drag, a
       scatter position and tilt), and scale last so it lands slot-sized */
    var cur = tile.style.transform || '';
    tile.classList.remove('dragging', 'returning');
    tile.classList.add('flying');
    tile.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) ' + cur + ' scale(' + (b.width / a.width).toFixed(3) + ')';
    var mine = tok;
    setTimeout(function(){
      if (!alive(mine)) return;
      tile.classList.remove('flying');
      done();
    }, 300);
  }

  /* Say each letter as its slot lights up; resolves when the word is done. */
  function spellSlots(word, slots){
    return speech.spell(word, {
      soundOf: soundOf,
      onLetter: function(i){
        slots.forEach(function(s, k){ s.classList.toggle('lit', k === i); });
      }
    }).then(function(ok){
      slots.forEach(function(s){ s.classList.remove('lit'); });
      return ok;
    });
  }

  /* ---------------- the performance ---------------- */
  function perform(els){
    var lead = C.pickLead(S.leadHistory);
    var plan = C.planScene({ letters: els.length, lead: lead, history: S.sceneHistory });
    S.sceneHistory = C.remember(S.sceneHistory, plan.id, 8);
    S.leadHistory = C.remember(S.leadHistory, plan.lead, 8);
    save();
    window.__lastScene = { id: plan.id, lead: plan.lead, mirror: plan.mirror, cast: plan.cast.join(',') };
    return stage.play(plan, els, { layer: $('#fxLayer'), groundY: groundY() });
  }

  /* ---------------- round state ---------------- */
  var R = { words: [], i: 0, word: '' };

  function startRound(i){
    if (!S.words.length){ go('empty'); return; }
    R.words = S.words.slice();
    R.i = clamp(i || 0, 0, R.words.length - 1);
    theme(C.pickTheme(S.theme));
    go('intro');
  }

  /* ============================================================
     MENU
     ============================================================ */
  ENTER.menu = function(){
    var tiles = $('#titleTiles');
    if (!tiles.childNodes.length){
      /* one unbreakable group per word, so it can only ever wrap between words */
      var n = 0;
      ['SPELLING', 'GAME'].forEach(function(word){
        var g = el('span', 'tw');
        word.split('').forEach(function(ch){
          var b = el('b', n % 3 === 1 ? 'o' : '', ch);
          b.style.setProperty('--r', ((n % 2 ? 1 : -1) * (2 + (n % 3))) + 'deg');
          b.style.animationDelay = (-n * 0.23) + 's';
          g.appendChild(b);
          n++;
        });
        tiles.appendChild(g);
      });
    }
    var chips = $('#menuChips');
    chips.innerHTML = '';
    S.words.forEach(function(w, i){
      var b = el('button', null, w.toLowerCase());
      b.type = 'button';
      b.setAttribute('aria-label', 'Start at ' + w.toLowerCase());
      b.addEventListener('click', function(){ sfx.play('tap'); startRound(i); });
      chips.appendChild(b);
    });
    $('#wordCount').textContent = S.words.length === 1 ? '1 word' : S.words.length + ' words';
    $('#btnPlay').disabled = false;
    runSelfCheck();
    buddies(C.CHAR_ORDER.slice(), true);
  };

  var selfProblems = [];
  function runSelfCheck(){
    var b = $('#selfCheck');
    try { selfProblems = C.selfCheck(S.words); }
    catch (e){ selfProblems = ['self-check crashed: ' + e.message]; }
    if (!save()) selfProblems.push('this browser will not save the word list (private browsing?)');
    b.classList.toggle('bad', selfProblems.length > 0);
    b.textContent = selfProblems.length
      ? '⚠ ' + selfProblems.length + (selfProblems.length === 1 ? ' problem' : ' problems') + ' — tap to see'
      : '✓ All set' + (speech.available() ? '' : ' (no voice on this browser)');
  }
  $('#selfCheck').addEventListener('click', function(){
    if (selfProblems.length) toast(selfProblems.slice(0, 3).join(' • '), 6000);
    else toast('Everything checked out: words, stages and all ' + C.SCENES.length + ' scenes.', 3000);
  });

  $('#btnPlay').addEventListener('click', function(){ sfx.play('tap'); startRound(0); });
  $('#btnGrownups').addEventListener('click', function(){ sfx.play('tap'); go('pass'); });
  $('#btnEmptyGrownups').addEventListener('click', function(){ sfx.play('tap'); go('pass'); });

  ENTER.empty = function(){ buddies(['trip'], false); };

  /* ============================================================
     WORD INTRO
     ============================================================ */
  function progressDots(){
    $all('.screen.on .progress').forEach(function(p){
      p.innerHTML = '';
      R.words.forEach(function(w, i){ p.appendChild(el('i', i < R.i ? 'done' : (i === R.i ? 'now' : ''))); });
    });
  }

  ENTER.intro = function(arg, prev){
    R.word = R.words[R.i];
    var w = R.word;
    $('#introOf').textContent = 'Word ' + (R.i + 1) + ' of ' + R.words.length;
    var hero = $('#introWord');
    hero.innerHTML = '';
    var card = $('#s-intro .card');
    hero.style.setProperty('--hero-tile', fitTile(card, w.length, 86) + 'px');
    w.split('').forEach(function(ch){ hero.appendChild(tileEl(ch)); });
    $('#introLower').textContent = w.toLowerCase();
    progressDots();
    if (prev !== 'find') R.buddies = pickBuddies();
    buddies(R.buddies, false);
    later(function(){ sayWord(w); }, 420);
  };
  $('#btnIntroHear').addEventListener('click', function(){ sayWord(R.word, { dedupeMs: 0 }); });
  $('#btnIntroSpell').addEventListener('click', function(){
    var tiles = $all('#introWord .tile');
    speech.reset();
    speech.spell(R.word, { soundOf: soundOf, onLetter: function(i){
      tiles.forEach(function(t, k){ t.style.transform = k === i ? 'translateY(-10px) scale(1.08)' : ''; });
    } }).then(function(){ tiles.forEach(function(t){ t.style.transform = ''; }); });
  });
  $('#btnIntroGo').addEventListener('click', function(){ sfx.play('tap'); go('find'); });

  /* ============================================================
     FIND — hear it, pick it
     ============================================================ */
  ENTER.find = function(){
    steps('find');
    var w = R.word, locked = false;
    var box = $('#findChoices');
    box.innerHTML = '';
    C.makeOptions(w).forEach(function(opt){
      var b = el('button', 'choice', opt.toLowerCase());
      b.type = 'button';
      b.addEventListener('click', function(){
        if (locked || b.classList.contains('wrong')) return;
        var r = b.getBoundingClientRect();
        stage.ambient.react('look', { x: r.left + r.width / 2, y: r.top + r.height / 2 });
        if (opt === w){
          locked = true;
          b.classList.add('right');
          sfx.play('correct');
          stage.ambient.react('cheer');
          speech.reset();
          speech.say(pick('found', FOUND) + ' ' + w.toLowerCase(), { rate: 0.9 });
          later(function(){ go('build'); }, 1500);
        } else {
          b.classList.add('wrong');
          sfx.play('wrong');
          stage.ambient.react('oops');
          later(function(){ speech.say(pick('try', TRY) + ' ' + w.toLowerCase(), { dedupeMs: 0, rate: 0.85 }); }, 450);
        }
      });
      box.appendChild(b);
    });
    buddies(R.buddies, false);
    later(function(){ if (!locked) speech.say('Find the word. ' + w.toLowerCase(), { rate: 0.85 }); }, 380);
    setNudge(function(){
      if (locked) return;
      var right = $all('#findChoices .choice').filter(function(b){ return b.textContent === w.toLowerCase(); })[0];
      stage.ambient.react('wave', right ? slotCentre(right) : null);
      speech.say('Which one says ' + w.toLowerCase() + '?', { dedupeMs: 0, rate: 0.85 });
    });
  };
  $('#btnFindHear').addEventListener('click', function(){
    var b = $('#btnFindHear');
    b.classList.add('talking');
    sayWord(R.word, { dedupeMs: 0 }).then(function(){ b.classList.remove('talking'); });
  });

  /* ============================================================
     DRAG — owned by each tile, released on every exit path
     ============================================================ */
  function makeDraggable(tile, onTap, onDrop){
    var start = null, dragging = false, pid = null;
    function reset(){
      start = null; dragging = false;
      if (pid != null){ try { tile.releasePointerCapture(pid); } catch (e){} }
      pid = null;
    }
    tile.addEventListener('pointerdown', function(e){
      if (tile.classList.contains('used') || tile.classList.contains('flying')) return;
      start = { x: e.clientX, y: e.clientY };
      pid = e.pointerId;
      try { tile.setPointerCapture(pid); } catch (err){}
    });
    tile.addEventListener('pointermove', function(e){
      if (!start || e.pointerId !== pid) return;
      var dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!dragging && dx * dx + dy * dy > 64){
        dragging = true;
        tile.classList.remove('returning');
        tile.classList.add('dragging');
      }
      if (dragging) tile.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.08)';
    });
    function up(e){
      if (!start || e.pointerId !== pid) return;
      var wasDrag = dragging, x = e.clientX, y = e.clientY;
      reset();
      if (!wasDrag){ onTap(); return; }
      if (!onDrop(x, y)){
        tile.classList.remove('dragging');
        tile.classList.add('returning');
        tile.style.transform = '';
      }
    }
    tile.addEventListener('pointerup', up);
    /* keyboard (Enter/Space) arrives as a click with no pointer behind it */
    tile.addEventListener('click', function(e){ if (e.detail === 0) onTap(); });
    tile.addEventListener('pointercancel', function(e){
      if (e.pointerId !== pid) return;
      reset();
      tile.classList.remove('dragging');
      tile.style.transform = '';
    });
  }

  function slotUnder(slots, x, y){
    for (var i = 0; i < slots.length; i++){
      var r = slots[i].getBoundingClientRect();
      var pad = r.width * 0.3;
      if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return i;
    }
    return -1;
  }

  /* ============================================================
     BUILD — put the letters in order
     ============================================================ */
  ENTER.build = function(){
    steps('build');
    var w = R.word, pos = 0, misses = 0, finished = false;
    var card = $('#buildCard');
    card.style.setProperty('--tile', fitTile(card, w.length, 80) + 'px');
    $('#buildWordLabel').textContent = w.toLowerCase();
    var slotsBox = $('#buildSlots'), tray = $('#buildTray');
    slotsBox.innerHTML = ''; tray.innerHTML = '';
    /* the boxes must fit on one line, but the letters he taps wrap onto two,
       so they stay finger-sized even for a long word */
    var perRow = Math.ceil(w.length / (w.length > 5 ? 2 : 1));
    tray.style.setProperty('--tile', Math.max(fitTile(card, w.length, 80), fitTile(card, perRow + 1, 76), 50) + 'px');
    var slots = w.split('').map(function(){ var s = slotEl(); slotsBox.appendChild(s); return s; });
    markNext(slots, 0);

    function hint(){
      var need = w[pos];
      $all('.tile', tray).forEach(function(t){
        t.classList.toggle('next-hint', !t.classList.contains('used') && t.getAttribute('data-letter') === need);
      });
    }
    function wrong(t){
      misses++;
      t.classList.remove('nope'); void t.offsetWidth; t.classList.add('nope');
      sfx.play('wrong');
      stage.ambient.react('oops');
      if (misses >= 2){
        later(function(){ speech.say(soundOf(w[pos]), { dedupeMs: 0 }); }, 300);
        hint();
      }
    }
    function place(t){
      if (finished) return;
      var i = pos;
      pos++;
      misses = 0;
      $all('.tile', tray).forEach(function(x){ x.classList.remove('next-hint'); });
      sfx.play('place');
      speech.say(soundOf(w[i]), { dedupeMs: 0, key: 'build:' + i });
      if (i < w.length - 1) stage.ambient.react('hop', slotCentre(slots[i]));
      flyTo(t, slots[i], function(){
        t.classList.add('used');
        t.style.transform = '';
        fillSlot(slots[i], w[i]);
        markNext(slots, pos);
        if (pos === w.length) complete();
      });
    }
    function tryTile(t){
      if (finished || t.classList.contains('used') || t.classList.contains('flying')) return false;
      var r = t.getBoundingClientRect();
      stage.ambient.react('look', { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      if (t.getAttribute('data-letter') === w[pos]){ place(t); return true; }
      wrong(t);
      return false;
    }
    function complete(){
      finished = true;
      var mine = tok;
      sfx.play('correct');
      stage.ambient.react('cheer');
      later(function(){
        spellSlots(w, slots).then(function(){
          if (!alive(mine)) return;
          return sayWord(w, { dedupeMs: 0 });
        }).then(function(){
          if (!alive(mine)) return;
          return perform(slots);
        }).then(function(){
          if (alive(mine)) go('learn');
        });
      }, 500);
    }

    C.scrambleLetters(w).forEach(function(ch){
      var t = tileEl(ch, 'button');
      makeDraggable(t, function(){ tryTile(t); }, function(x, y){
        var at = slotUnder(slots, x, y);
        if (at === -1) return false;
        if (at !== pos){ wrong(t); return false; }
        return tryTile(t);
      });
      tray.appendChild(t);
    });
    buddies(R.buddies, false);
    later(function(){ speech.say('Build ' + w.toLowerCase(), { rate: 0.85 }); }, 380);
    setNudge(function(){
      if (finished) return;
      hint();
      var t = $all('.tile.next-hint', tray)[0];
      stage.ambient.react('wave', t ? slotCentre(t) : null);
      speech.say('Find ' + soundOf(w[pos]), { dedupeMs: 0, rate: 0.85 });
    });
  };
  $('#btnBuildHear').addEventListener('click', function(){ sayWord(R.word, { dedupeMs: 0 }); });

  /* ============================================================
     LEARN — hunt the letters in a scatter
     ============================================================ */
  var hunt = null;
  function layoutHunt(){
    if (!hunt) return;
    var area = $('#learnHunt');
    var W = area.clientWidth, H = area.clientHeight;
    var n = hunt.tiles.length;
    var t = clamp(Math.floor(Math.sqrt((W * H) / (n * 2.6))), 46, 80);
    t = Math.min(t, fitTile($('#learnCard'), Math.min(n, 5), 80));
    area.style.setProperty('--tile', t + 'px');
    var th = Math.round(t * 1.08);
    var res = C.scatterPositions(n, Math.max(t, W - 6), Math.max(th, H - th * 0.1), Math.max(t, th), 10);
    hunt.tiles.forEach(function(tile, i){
      var p = res.positions[i];
      /* position with left/top and tilt with `rotate`, so transform stays
         free for the wiggle and the flight into the slot */
      var rot = ((i * 37 + hunt.seed) % 17) - 8;
      tile.style.left = p.x + 'px';
      tile.style.top = p.y + 'px';
      tile.style.rotate = rot + 'deg';
    });
  }

  ENTER.learn = function(){
    steps('learn');
    var w = R.word, pos = 0, misses = 0, finished = false;
    var card = $('#learnCard');
    card.style.setProperty('--tile', fitTile(card, w.length, 72) + 'px');
    $('#learnWordLabel').textContent = w.toLowerCase();
    $('#btnNext').hidden = true;
    $('#learnCheer').hidden = true;
    $('#learnHint').hidden = false;
    $('#learnHint').textContent = 'Tap the letters in order';
    card.classList.remove('finished');
    var slotsBox = $('#learnSlots'), area = $('#learnHunt');
    slotsBox.innerHTML = ''; area.innerHTML = '';
    var slots = w.split('').map(function(){ var s = slotEl(); slotsBox.appendChild(s); return s; });
    markNext(slots, 0);

    hunt = { tiles: [], seed: 0 };
    C.makeSearchLetters(w).forEach(function(ch){
      var t = tileEl(ch, 'button');
      t.addEventListener('click', function(){
        if (finished || t.classList.contains('found') || t.classList.contains('flying')) return;
        var r = t.getBoundingClientRect();
        stage.ambient.react('look', { x: r.left + r.width / 2, y: r.top + r.height / 2 });
        if (ch === w[pos]){
          var i = pos;
          pos++; misses = 0;
          hunt.tiles.forEach(function(x){ x.classList.remove('next-hint'); });
          sfx.play('place');
          speech.say(soundOf(ch), { dedupeMs: 0, key: 'learn:' + i });
          if (i < w.length - 1) stage.ambient.react('hop', slotCentre(slots[i]));
          flyTo(t, slots[i], function(){
            t.classList.add('found');
            fillSlot(slots[i], ch);
            markNext(slots, pos);
            if (pos === w.length) complete();
          });
        } else {
          misses++;
          t.classList.remove('nope'); void t.offsetWidth; t.classList.add('nope');
          sfx.play('wrong');
          stage.ambient.react('oops');
          if (misses >= 2){
            later(function(){ speech.say('Find ' + soundOf(w[pos]), { dedupeMs: 0 }); }, 300);
            learnHint();
          }
        }
      });
      /* the wobble animation must not fight the scatter transform */
      t.addEventListener('animationend', function(){ t.classList.remove('nope'); });
      area.appendChild(t);
      hunt.tiles.push(t);
    });
    layoutHunt();

    /* glow on the letter he needs next: the same help Build gives */
    function learnHint(){
      var need = w[pos], done = false;
      hunt.tiles.forEach(function(t){
        var on = !done && !t.classList.contains('found') && t.getAttribute('data-letter') === need;
        if (on) done = true;
        t.classList.toggle('next-hint', on);
      });
    }
    setNudge(function(){
      if (finished) return;
      learnHint();
      var t = $all('.tile.next-hint', area)[0];
      stage.ambient.react('wave', t ? slotCentre(t) : null);
      speech.say('Find ' + soundOf(w[pos]), { dedupeMs: 0, rate: 0.85 });
    });

    function complete(){
      finished = true;
      var mine = tok;
      sfx.play('correct');
      stage.ambient.react('cheer');
      $('#learnHint').textContent = 'You spelled ' + w.toLowerCase() + '!';
      later(function(){
        spellSlots(w, slots).then(function(){
          if (!alive(mine)) return;
          return speech.say(pick('spelled', SPELLED) + ' You spelled ' + w.toLowerCase() + '!', { rate: 0.9 });
        }).then(function(){
          if (!alive(mine)) return;
          $all('.tile', area).forEach(function(t){ t.classList.add('found'); });
          return perform(slots);
        }).then(function(){
          if (!alive(mine)) return;
          /* the characters hand the word back: it pops into place again,
             so the last thing he sees is the word he spelled */
          var last = C.nextIndex(R.i, R.words.length) === -1;
          card.classList.add('finished');
          slots.forEach(function(sl, k){
            sl.classList.remove('taken', 'filled');
            setTimeout(function(){ if (alive(mine)) sl.classList.add('filled'); }, 90 * k);
          });
          var cheers = ['Awesome!', 'You did it!', 'Super speller!', 'Brilliant!', 'High five!', 'Great job!'];
          var ch = $('#learnCheer');
          ch.textContent = cheers[Math.floor(Math.random() * cheers.length)];
          ch.hidden = false;
          $('#learnHint').hidden = true;
          var nb = $('#btnNext');
          nb.textContent = last ? 'Finish! 🏆' : 'Next word ›';
          nb.hidden = false;
          buddies(R.buddies, false);
          later(function(){ stage.ambient.react('cheer'); }, 900);
        });
      }, 500);
    }
    buddies(R.buddies, false);
    later(function(){ speech.say('Find the letters. ' + w.toLowerCase(), { rate: 0.85 }); }, 380);
  };
  $('#btnLearnHear').addEventListener('click', function(){ sayWord(R.word, { dedupeMs: 0 }); });
  $('#btnLearnMix').addEventListener('click', function(){
    if (!hunt) return;
    sfx.play('whoosh');
    hunt.seed += 5;
    hunt.tiles.forEach(function(t){ t.classList.add('returning'); });
    layoutHunt();
    later(function(){ hunt && hunt.tiles.forEach(function(t){ t.classList.remove('returning'); }); }, 320);
  });
  $('#btnNext').addEventListener('click', function(){
    sfx.play('tap');
    var n = C.nextIndex(R.i, R.words.length);
    if (n === -1){ go('done'); return; }
    R.i = n;
    go('intro');
  });

  /* ============================================================
     DONE
     ============================================================ */
  ENTER.done = function(){
    $('#doneLine').textContent = R.words.length === 1
      ? 'You spelled your word!' : 'You spelled all ' + R.words.length + ' words!';
    var chips = $('#doneChips');
    chips.innerHTML = '';
    R.words.forEach(function(w){ chips.appendChild(el('span', null, w.toLowerCase())); });
    sfx.play('fanfare');
    confetti();
    buddies(C.CHAR_ORDER.slice(), true);
    later(function(){ stage.ambient.react('cheer'); }, 900);
    later(function(){ speech.say('You did it! Great job, Grayson!', { rate: 0.9 }); }, 600);
    var again = function(){ stage.ambient.react('cheer'); later(again, 4200); };
    later(again, 4200);
  };
  $('#btnAgain').addEventListener('click', function(){ sfx.play('tap'); startRound(0); });
  $('#btnDoneMenu').addEventListener('click', function(){ sfx.play('tap'); go('menu'); });

  function confetti(){
    var box = $('#confetti');
    box.innerHTML = '';
    var colors = ['#FF8A1F', '#1E6FE8', '#FFC53D', '#5DA8FF', '#FFB566', '#FFFFFF'];
    for (var i = 0; i < 70; i++){
      var c = el('i');
      c.style.left = (Math.random() * 100) + 'vw';
      c.style.background = colors[i % colors.length];
      box.appendChild(c);
      var drift = (Math.random() - 0.5) * 160, spin = (Math.random() - 0.5) * 1080;
      try {
        c.animate([
          { transform: 'translate(0,0) rotate(0deg)' },
          { transform: 'translate(' + drift + 'px,' + (window.innerHeight + 60) + 'px) rotate(' + spin + 'deg)' }
        ], { duration: 2200 + Math.random() * 1800, delay: Math.random() * 700, easing: 'cubic-bezier(.3,.1,.6,1)', fill: 'forwards' });
      } catch (e){}
    }
    later(function(){ box.innerHTML = ''; }, 4800);
  }

  /* ============================================================
     GROWN-UPS — passcode
     ============================================================ */
  var entry = '';
  (function buildKeypad(){
    var pad = $('#keypad');
    ['1','2','3','4','5','6','7','8','9','','0','⌫'].forEach(function(k){
      var b = el('button', k ? '' : 'blank', k);
      b.type = 'button';
      if (k === '⌫') b.setAttribute('aria-label', 'Delete');
      if (!k){ b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); }
      b.addEventListener('click', function(){
        if (!k) return;
        sfx.play('tap');
        if (k === '⌫') entry = entry.slice(0, -1);
        else if (entry.length < 4) entry += k;
        drawDots();
        if (entry.length === 4){
          var ok = entry === PASSCODE;
          later(function(){
            if (ok){ entry = ''; go('words'); return; }
            var d = $('#passDots');
            d.classList.remove('bad'); void d.offsetWidth; d.classList.add('bad');
            sfx.play('wrong');
            entry = '';
            later(drawDots, 420);
          }, 160);
        }
      });
      pad.appendChild(b);
    });
  })();
  function drawDots(){
    $all('#passDots i').forEach(function(d, i){ d.classList.toggle('on', i < entry.length); });
    if (!entry.length) $('#passDots').classList.remove('bad');
  }
  ENTER.pass = function(){ entry = ''; drawDots(); stage.ambient.stop(); };

  /* ============================================================
     GROWN-UPS — the word list
     ============================================================ */
  var clearArmed = false;
  function drawList(){
    var ul = $('#wordList');
    ul.innerHTML = '';
    if (!S.words.length){
      ul.appendChild(el('li', 'empty', 'No words yet — add this week\'s list above'));
    }
    S.words.forEach(function(w, i){
      var li = el('li');
      li.appendChild(el('span', 'n', String(i + 1)));
      li.appendChild(el('span', 'w', w.toLowerCase()));
      var x = el('button', 'x', '×');
      x.type = 'button';
      x.setAttribute('aria-label', 'Remove ' + w.toLowerCase());
      x.addEventListener('click', function(){
        S.words = C.removeWord(S.words, w);
        save(); drawList();
      });
      li.appendChild(x);
      ul.appendChild(li);
    });
    $('#listCount').textContent = S.words.length ? S.words.length + (S.words.length === 1 ? ' word' : ' words') : '';
    $('#btnSavePlay').disabled = !S.words.length;
    $('#btnSavePlay').style.opacity = S.words.length ? '' : '.5';
    clearArmed = false;
    $('#btnClear').textContent = 'Clear all';
  }
  ENTER.words = function(){
    stage.ambient.stop();
    drawList();
    $('#addInput').value = '';
    $('#optSfx').checked = S.sfx;
    fillSelect($('#optA'), C.A_SOUND_CHOICES, S.aSound);
    fillSelect($('#optE'), C.E_SOUND_CHOICES, S.eSound);
    $('#addNote').className = 'note';
    $('#addNote').textContent = 'Add one word, or paste the whole list: commas, spaces or new lines all work.';
  };
  function fillSelect(sel, choices, cur){
    sel.innerHTML = '';
    choices.forEach(function(c){
      var o = el('option', null, '"' + c + '"');
      o.value = c;
      if (c === cur) o.selected = true;
      sel.appendChild(o);
    });
  }
  $('#addForm').addEventListener('submit', function(e){
    e.preventDefault();
    var input = $('#addInput');
    var raw = input.value;
    var before = S.words.length;
    var tokens = raw.split(/[\s,;\/|]+/).filter(Boolean);
    S.words = C.addWords(S.words, raw);
    var added = S.words.length - before;
    var accepted = C.parseWordInput(raw);
    var skipped = tokens.filter(function(tk){ return accepted.indexOf(C.cleanWord(tk)) === -1; });
    save(); drawList();
    input.value = '';
    var note = $('#addNote');
    if (skipped.length){
      note.className = 'note warn';
      note.textContent = 'Skipped ' + skipped.slice(0, 4).join(', ') + ' — words need 2 to 12 letters.';
    } else if (!added && accepted.length){
      note.className = 'note warn';
      note.textContent = S.words.length >= C.MAX_WORDS ? 'The list is full (' + C.MAX_WORDS + ' words).' : 'Already on the list.';
    } else {
      note.className = 'note';
      note.textContent = added ? 'Added ' + added + (added === 1 ? ' word.' : ' words.') : 'Type a word first.';
    }
    input.focus();
  });
  $('#btnClear').addEventListener('click', function(){
    if (!clearArmed){ clearArmed = true; $('#btnClear').textContent = 'Tap again to clear'; return; }
    S.words = []; save(); drawList();
  });
  $('#btnSample').addEventListener('click', function(){ S.words = C.DEFAULT_WORDS.slice(); save(); drawList(); });
  $('#btnSavePlay').addEventListener('click', function(){
    if (!S.words.length) return;
    save(); startRound(0);
  });
  $('#optSfx').addEventListener('change', function(e){
    S.sfx = e.target.checked; sfx.setMuted(!S.sfx); save();
    if (S.sfx) sfx.play('correct');
  });
  $('#optA').addEventListener('change', function(e){ S.aSound = e.target.value; save(); });
  $('#optE').addEventListener('change', function(e){ S.eSound = e.target.value; save(); });
  $('#btnVoiceTest').addEventListener('click', function(){
    speech.reset();
    speech.spell('AND', { soundOf: soundOf }).then(function(ok){
      if (ok) return speech.spell('SEE', { soundOf: soundOf });
    });
  });

  /* ---------------- back buttons ---------------- */
  $all('[data-back]').forEach(function(b){
    b.addEventListener('click', function(){
      sfx.play('tap');
      go(b.getAttribute('data-back'));
    });
  });

  /* ---------------- the world keeps up with the device ---------------- */
  var resizeT = null;
  window.addEventListener('resize', function(){
    clearTimeout(resizeT);
    resizeT = setTimeout(function(){
      if (screen === 'learn' && hunt) layoutHunt();
      if (stage.ambient.active() && buddyKeys) buddies(buddyKeys, buddyLineup, true);
    }, 200);
  });
  document.addEventListener('visibilitychange', function(){
    if (document.hidden){
      speech.reset();
      if (!stage.idle()) stage.stop(false);
    }
  });

  /* ---------------- test hooks (read-only use) ---------------- */
  window.__game = {
    core: C, stage: stage, speech: speech, sfx: sfx, settings: function(){ return S; },
    state: function(){ return { screen: screen, i: R.i, word: R.word, words: R.words.slice() }; },
    go: go
  };

  theme(S.theme || C.pickTheme(null));
  go('menu');
})();
