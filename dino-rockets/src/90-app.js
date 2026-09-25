/* ============================================================
   APP — the mission.

   The week's words are a route through space: one planet per word. On
   each planet the word is practised through a short run of activities
   (chosen by how well he already knows it), the rocket blasts off, the
   crew clears the letters, and an egg hatches a baby dino that joins his
   Dino Base for good. When every planet is done, a meteor shower brings
   the shakiest words back one more time — a spaced, from-memory review.

   Rules that hold the file together:
     1. go() is the only way to change screen; it bumps a token, clears
        timers, the nudge, speech and any scene, so nothing from a screen
        he has left can fire on the next one.
     2. Inside the play screen each activity gets its own step token too.
     3. Listeners live on the element they serve (see 80-activities.js).
   ============================================================ */
(function(){
  'use strict';
  var C = __CORE;
  var STORE_KEY = 'graysons-dino-rockets.v1';
  var PASSCODE = '9999';
  var params = new URLSearchParams(location.search);

  function $(s, r){ return (r || document).querySelector(s); }
  function $all(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function clamp(v, lo, hi){ return v < lo ? lo : (v > hi ? hi : v); }

  /* ---------------- settings ---------------- */
  function load(){ try { return C.normalizeSettings(JSON.parse(localStorage.getItem(STORE_KEY))); } catch (e){ return C.normalizeSettings(null); } }
  function save(){ try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); return true; } catch (e){ return false; } }
  var S = load();

  /* ---------------- services ---------------- */
  var sfx = createSfx();
  sfx.setMuted(!S.sfx || params.has('mute'));
  var synth = ('speechSynthesis' in window) ? window.speechSynthesis : null;
  var speech = createSpeech({
    synth: synth,
    makeUtterance: function(text, o){
      var u = new SpeechSynthesisUtterance(text);
      u.rate = o.rate; u.pitch = 1.08; u.lang = 'en-US';
      if (o.voice) u.voice = o.voice;
      if (o.volume != null) u.volume = o.volume;
      return u;
    }
  });
  if (synth && synth.addEventListener) synth.addEventListener('voiceschanged', function(){ speech.pickVoice(); });
  var stage = createStage({ core: C, sfx: sfx, art: DINO_ART });
  stage.init($('#fxLayer'));
  if (params.get('speed')) stage.setTimeScale(params.get('speed'));

  var unlocked = false;
  function unlockAudio(){
    sfx.unlock();
    if (!unlocked){ unlocked = true; speech.prime(); if (S.music && !params.has('mute')) sfx.startMusic(); }
    speech.unlock();
  }
  document.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
  /* the voice always wins: the music drops right down whenever anything is being said */
  setInterval(function(){ sfx.duck(speech.busy()); }, 150);

  function soundOf(ch){ return C.letterSound(ch, C.letterOverrides(S)); }
  function sayWord(w, o){ return speech.say(String(w).toLowerCase(), o); }

  var lastLine = {};
  function pick(kind, list){
    var pool = list.filter(function(x){ return x !== lastLine[kind]; });
    var line = pool[Math.floor(Math.random() * pool.length)];
    lastLine[kind] = line; return line;
  }
  var FOUND = ['Yes!', 'You got it!', 'Great listening!', "That's it!", 'Nice one!', 'Boom!'];
  var SPELLED = ['Awesome!', 'Super!', 'Way to go!', 'Brilliant!', 'Fantastic!', 'Rocket power!'];
  var TRY = ['Try again.', 'Not that one. Listen.', 'Almost! Listen again.'];

  /* ---------------- screen control ---------------- */
  var screen = null, tok = 0, stepTok = 0, timers = [];
  function later(fn, ms){
    var t = tok, st = stepTok;
    var id = setTimeout(function(){ if (t === tok && st === stepTok) fn(); }, ms);
    timers.push(id); return id;
  }
  function alive(st){ return st === stepTok; }

  /* the nudge: a stalled child hears the prompt again and a buddy waves at the answer */
  var nudge = null;
  function setNudge(fn){ clearNudge(); nudge = { fn: fn, count: 0, id: null, tok: tok, st: stepTok }; armNudge(); }
  function armNudge(){
    if (!nudge) return;
    clearTimeout(nudge.id);
    if (nudge.count >= 3 || nudge.tok !== tok || nudge.st !== stepTok) return;
    nudge.id = setTimeout(function(){
      if (!nudge || nudge.tok !== tok || nudge.st !== stepTok || !stage.idle()) return;
      nudge.count++;
      try { nudge.fn(); } catch (e){}
      armNudge();
    }, 9000);
  }
  function clearNudge(){ if (nudge) clearTimeout(nudge.id); nudge = null; }
  document.addEventListener('pointerdown', function(){ if (nudge) armNudge(); }, { passive: true });

  var ENTER = {}, LEAVE = {};
  function go(name, arg){
    if (LEAVE[screen]) try { LEAVE[screen](); } catch (e){}
    tok++; stepTok++;
    clearNudge();
    timers.forEach(clearTimeout); timers = [];
    speech.reset();
    if (!stage.idle()) stage.stop(false);
    $('#confetti').innerHTML = '';
    var prev = screen; screen = name;
    $all('.screen').forEach(function(s){ s.classList.toggle('on', s.getAttribute('data-screen') === name); });
    document.body.setAttribute('data-screen', name);
    if (ENTER[name]) ENTER[name](arg, prev);
  }

  /* ---------------- world ---------------- */
  var currentPlanet = null;
  function applyPlanet(p){
    currentPlanet = p;
    var st = document.body.style;
    st.setProperty('--sky1', p.sky[0]); st.setProperty('--sky2', p.sky[1]);
    st.setProperty('--ground', p.ground); st.setProperty('--rim', p.rim);
    st.setProperty('--rock', p.rock); st.setProperty('--glow', p.glow);
    document.body.setAttribute('data-planet', p.id);
  }
  function planetOf(i){ return C.planetFor(i, S.week.offset); }
  function groundY(){ return $('#space .surface').getBoundingClientRect().top + 8; }

  var buddyKeys = null, buddyLineup = false;
  function buddies(keys, lineup, force){
    var same = buddyKeys && keys.join() === buddyKeys.join() && buddyLineup === !!lineup;
    if (same && !force && stage.ambient.active()) return;
    buddyKeys = keys; buddyLineup = !!lineup;
    stage.ambient.start({
      keys: keys, groundY: groundY(), left: 6, right: window.innerWidth - 6, lineup: lineup, ceil: cardBottom(),
      dust: currentPlanet ? currentPlanet.rim : null,
      onTap: function(key){ if (screen === 'home' || screen === 'done' || screen === 'hatch') speech.say("I'm " + C.CHARS[key].name + '!', { rate: 0.95 }); }
    });
  }
  /* the lowest edge of the screen's card: buddies live below it, never over it
     (+8 covers the few pixels the entrance animation's scale hides) */
  function cardBottom(){
    var c = $('.screen.on .card, .screen.on .mission-card');
    return c ? c.getBoundingClientRect().bottom + 8 : null;
  }
  function noBuddies(){ stage.ambient.stop(); buddyKeys = null; }
  function pickBuddies(){
    var lead = C.pickLead(S.leadHistory);
    var rest = C.shuffle(C.CHAR_ORDER.filter(function(k){ return k !== lead; }));
    return [rest[0], lead];
  }

  var toastT = null;
  function toast(msg, ms){
    var t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function(){ t.classList.remove('on'); }, ms || 2600);
  }
  function confetti(){
    var box = $('#confetti'); box.innerHTML = '';
    var cols = ['#FF8A1F', '#1E6FE8', '#FFC53D', '#3FBF4F', '#8FE3FF', '#FFFFFF', '#E53935'];
    for (var i = 0; i < 80; i++){
      var c = el('i'); c.style.left = (Math.random() * 100) + 'vw'; c.style.background = cols[i % cols.length];
      box.appendChild(c);
      try { c.animate([{ transform: 'translate(0,0) rotate(0)' }, { transform: 'translate(' + ((Math.random() - 0.5) * 160) + 'px,' + (window.innerHeight + 60) + 'px) rotate(' + ((Math.random() - 0.5) * 1080) + 'deg)' }],
        { duration: 2200 + Math.random() * 1800, delay: Math.random() * 600, easing: 'cubic-bezier(.3,.1,.6,1)', fill: 'forwards' }); } catch (e){}
    }
    later(function(){ box.innerHTML = ''; }, 4800);
  }

  var ROCKET_SVG = '<svg viewBox="0 0 120 170" aria-hidden="true">' +
    '<path d="M60 6 C84 26 92 58 88 96 L32 96 C28 58 36 26 60 6Z" fill="#fff" stroke="#0A1433" stroke-width="5"/>' +
    '<path d="M60 6 C72 16 80 30 84 44 L36 44 C40 30 48 16 60 6Z" fill="#FF8A1F" stroke="#0A1433" stroke-width="5"/>' +
    '<circle cx="60" cy="66" r="13" fill="#8FE3FF" stroke="#0A1433" stroke-width="5"/>' +
    '<path d="M32 76 L12 108 L34 104 Z M88 76 L108 108 L86 104 Z" fill="#1E6FE8" stroke="#0A1433" stroke-width="5" stroke-linejoin="round"/>' +
    '<rect x="40" y="94" width="40" height="12" rx="4" fill="#5E6B80" stroke="#0A1433" stroke-width="4"/>' +
    '<path class="flame" d="M44 108 Q60 170 76 108 Z" fill="#FF8A1F"/><path class="flame" d="M50 108 Q60 150 70 108 Z" fill="#FFE08A"/></svg>';

  /* ---------------- activities ---------------- */
  var env = {
    C: C, $: $, $all: $all, el: el, speech: speech, sfx: sfx, stage: stage,
    later: later, alive: alive, soundOf: soundOf, sayWord: sayWord, pick: pick,
    FOUND: FOUND, TRY: TRY, setNudge: setNudge, clearNudge: clearNudge,
    react: function(kind, point){ stage.ambient.react(kind, point); },
    spellSlots: function(word, slots){
      return speech.spell(word, { soundOf: soundOf, onLetter: function(i){ slots.forEach(function(s, k){ s.classList.toggle('lit', k === i); }); } })
        .then(function(ok){ slots.forEach(function(s){ s.classList.remove('lit'); }); return ok; });
    }
  };
  var ACT = createActivities(env);
  var ACT_ICON = { meet: '👀', zap: '☄️', build: '🔋', missing: '🧩', blast: '🚀' };

  function perform(els){
    var lead = C.pickLead(S.leadHistory);
    var plan = C.planScene({ letters: els.length, lead: lead, history: S.sceneHistory });
    S.sceneHistory = C.remember(S.sceneHistory, plan.id, 8);
    S.leadHistory = C.remember(S.leadHistory, plan.lead, 8);
    save();
    window.__lastScene = { id: plan.id, lead: plan.lead, mirror: plan.mirror };
    return stage.play(plan, els, { layer: $('#fxLayer'), groundY: groundY(), dust: currentPlanet ? currentPlanet.rim : null });
  }

  /* ============================================================
     LAUNCH PAD
     ============================================================ */
  var selfProblems = [];
  ENTER.home = function(){
    var n = S.words.length, done = S.week.done.length, next = C.nextPlanet(S.week, n);
    applyPlanet(planetOf(next === -1 ? 0 : next));
    $('#missionCount').textContent = n ? done + ' of ' + n + ' planets' : 'no words yet';
    var track = $('#missionTrack'); track.innerHTML = '';
    S.words.forEach(function(w, i){
      var d = el('i', S.week.done.indexOf(i) !== -1 ? 'done' : (i === next ? 'next' : ''));
      d.style.setProperty('--pc', planetOf(i).ground);
      track.appendChild(d);
    });
    $('#playLabel').textContent = !n ? 'ADD WORDS' : (next !== -1 ? (done ? 'KEEP GOING!' : 'BLAST OFF!') : (S.week.finale ? 'PLAY AGAIN' : 'METEOR SHOWER!'));
    $('#babyCount').textContent = S.babies.length ? String(S.babies.length) : '';
    try { selfProblems = C.selfCheck(S.words); } catch (e){ selfProblems = ['self-check crashed: ' + e.message]; }
    if (!save()) selfProblems.push('this browser will not save progress (private browsing?)');
    var sc = $('#selfCheck');
    sc.classList.toggle('bad', selfProblems.length > 0);
    sc.textContent = selfProblems.length ? '⚠ ' + selfProblems.length + ' problem' + (selfProblems.length > 1 ? 's' : '') + ' — tap' : '✓ All systems go' + (speech.available() ? '' : ' (no voice)');
    buddies(C.CHAR_ORDER.slice(), true);
  };
  $('#selfCheck').addEventListener('click', function(){
    toast(selfProblems.length ? selfProblems.slice(0, 3).join(' • ') : 'Checked: words, activities and all ' + C.SCENES.length + ' crew scenes.', 4000);
  });
  $('#btnPlay').addEventListener('click', function(){
    sfx.play('tap');
    if (!S.words.length){ go('pass'); return; }
    var next = C.nextPlanet(S.week, S.words.length);
    if (next !== -1) startPlanet(next);
    else if (!S.week.finale) startFinale();
    else go('map');
  });
  $('#btnMap').addEventListener('click', function(){ sfx.play('tap'); go('map'); });
  $('#btnBase').addEventListener('click', function(){ sfx.play('tap'); go('base'); });
  $('#btnGrownups').addEventListener('click', function(){ sfx.play('tap'); go('pass'); });

  /* ============================================================
     STAR MAP
     ============================================================ */
  ENTER.map = function(){
    var map = $('#map'); map.innerHTML = '';
    var n = S.words.length, next = C.nextPlanet(S.week, n);
    applyPlanet(planetOf(next === -1 ? 0 : next));
    S.words.forEach(function(w, i){
      var p = planetOf(i), done = S.week.done.indexOf(i) !== -1;
      var node = el('div', 'map-node' + (done ? ' done' : '') + (i === next ? ' next' : ''));
      var b = el('button', 'planet-btn'); b.type = 'button';
      b.setAttribute('aria-label', 'Planet ' + (i + 1) + ': ' + w.toLowerCase());
      ['ground', 'rim', 'rock', 'glow'].forEach(function(k){ b.style.setProperty('--' + k, p[k]); });
      if (done && S.week.eggs[i] != null){
        var badge = el('span', 'done-badge'); var bb = el('span', 'baby'); bb.innerHTML = babyArt(C.makeBaby(S.week.eggs[i])); badge.appendChild(bb); b.appendChild(badge);
      }
      if (i === next){ var r = el('span', 'map-rocket'); r.innerHTML = ROCKET_SVG; b.appendChild(r); }
      b.addEventListener('click', function(){ sfx.play('tap'); startPlanet(i); });
      node.appendChild(b);
      var lab = el('div', 'map-label');
      lab.appendChild(el('span', 'map-word', w.toLowerCase()));
      lab.appendChild(el('span', 'map-planet', p.name + (done ? ' ✓' : '')));
      node.appendChild(lab);
      map.appendChild(node);
    });
    if (n){
      var fin = el('div', 'map-node map-finale' + (next === -1 && !S.week.finale ? ' next' : '') + (next !== -1 ? ' locked' : ''));
      var fb = el('button', 'planet-btn'); fb.type = 'button'; fb.setAttribute('aria-label', 'Meteor shower');
      fb.innerHTML = '<span style="font-size:40px;line-height:86px">☄️</span>';
      fb.addEventListener('click', function(){
        sfx.play('tap');
        if (next !== -1){ toast('Visit every planet first!'); return; }
        startFinale();
      });
      fin.appendChild(fb);
      var fl = el('div', 'map-label');
      fl.appendChild(el('span', 'map-word', 'Meteor shower'));
      fl.appendChild(el('span', 'map-planet', S.week.finale ? 'Done ✓' : 'Final challenge'));
      fin.appendChild(fl);
      map.appendChild(fin);
    }
    noBuddies();
  };

  /* ============================================================
     FLIGHT
     ============================================================ */
  var P = null;   /* the planet (or review) being played */
  function startPlanet(i){
    var w = S.words[i];
    var stat = C.normalizeStat(S.stats[w], w);
    P = { review: false, i: i, word: w, planet: planetOf(i), stat: stat, acts: C.activitiesFor(stat.level), step: 0 };
    go('flight');
  }
  ENTER.flight = function(){
    var p = P.review ? { name: 'the Meteor Shower' } : P.planet;
    $('#flightRocket').innerHTML = ROCKET_SVG;
    $('#flightText').textContent = 'Flying to ' + p.name + '…';
    noBuddies();
    sfx.play('warp');
    later(function(){ speech.say('Next stop: ' + p.name + '!', { rate: 0.95 }); }, 200);
    later(function(){ if (!P.review) applyPlanet(P.planet); go('play'); }, params.has('fast') ? 300 : 2100);
  };

  /* ============================================================
     PLAY — one planet's activities in order
     ============================================================ */
  function renderSteps(){
    var box = $('#steps'); box.innerHTML = '';
    var n = P.review ? P.list.length : P.acts.length;
    for (var k = 0; k < n; k++){
      var i = el('i', k < P.step ? 'done' : (k === P.step ? 'now' : ''), k < P.step ? '✓' : (P.review ? '☄️' : ACT_ICON[P.acts[k]]));
      box.appendChild(i);
    }
    $('#planetTag').textContent = P.review ? 'Meteor shower' : P.planet.name;
  }
  ENTER.play = function(){
    renderSteps();
    $('#btnPlayBack').textContent = '‹ Map';
    buddies(pickBuddies(), false, true);
    runStep();
  };
  function runStep(){
    stepTok++;
    clearNudge();
    renderSteps();
    var root = $('#activity');
    root.style.animation = 'none'; void root.offsetWidth; root.style.animation = 'screenIn .3s';
    var act = P.review ? 'blast' : P.acts[P.step];
    var word = P.review ? P.list[P.step] : P.word;
    var st = stepTok, doneOnce = false;
    ACT[act]({
      word: word, root: root, tok: st, stat: P.stat, review: P.review,
      done: function(res){ if (doneOnce || st !== stepTok) return; doneOnce = true; afterStep(act, word, res || {}, st); }
    });
  }
  function afterStep(act, word, res, st){
    if (act === 'build' || act === 'missing'){
      env.react('cheer');
      sfx.play('correct');
      later(function(){
        env.spellSlots(word, res.slots).then(function(){
          if (st !== stepTok) return;
          return sayWord(word, { dedupeMs: 0 });
        }).then(function(){
          if (st !== stepTok) return;
          return perform(res.slots);
        }).then(function(){ if (st === stepTok) nextStep(); });
      }, 400);
      return;
    }
    if (act === 'blast'){
      var r = res.result || {};
      S.stats[word] = C.recordBlast(S.stats[word], word, r, Date.now());
      save();
      sfx.play('correct');
      env.react('cheer');
      later(function(){
        env.spellSlots(word, res.slots).then(function(){
          if (st !== stepTok) return;
          return speech.say(pick('spelled', SPELLED) + ' You spelled ' + word.toLowerCase() + '!', { rate: 0.9 });
        }).then(function(){
          if (st !== stepTok) return;
          if (P.review) return perform(res.slots);
          return countdownAndLaunch().then(function(){ if (st === stepTok) return perform(res.slots); });
        }).then(function(){
          if (st !== stepTok) return;
          if (P.review){ P.step++; if (P.step < P.list.length) runStep(); else finishFinale(); }
          else go('hatch');
        });
      }, 400);
      return;
    }
    later(nextStep, act === 'meet' ? 100 : 300);
  }
  function nextStep(){ P.step++; runStep(); }

  /* 3, 2, 1 — and the rocket goes */
  function countdownAndLaunch(){
    return new Promise(function(resolve){
      var st = stepTok;
      var card = $('#playCard');
      var cd = el('div', 'countdown'); card.appendChild(cd);
      var n = 3;
      function tick(){
        if (st !== stepTok){ cd.remove(); resolve(); return; }
        if (n > 0){ cd.innerHTML = '<span>' + n + '</span>'; sfx.play('countdown'); speech.say(String(n), { dedupeMs: 0, rate: 1 }); n--; later(tick, 750); return; }
        cd.innerHTML = '<span>GO!</span>'; sfx.play('go'); sfx.play('blastoff');
        var r = el('div', 'launch-rocket'); r.innerHTML = ROCKET_SVG; document.body.appendChild(r);
        var startY = window.innerHeight - 200;
        try {
          r.animate([{ transform: 'translateY(' + startY + 'px)' }, { transform: 'translateY(' + (startY + 20) + 'px)', offset: 0.15 }, { transform: 'translateY(-260px)' }],
            { duration: 1500, easing: 'cubic-bezier(.5,0,.8,.6)', fill: 'forwards' });
        } catch (e){}
        setTimeout(function(){ r.remove(); cd.remove(); resolve(); }, 1550);
      }
      tick();
    });
  }
  $('#btnPlayBack').addEventListener('click', function(){ sfx.play('tap'); go(P && P.review ? 'home' : 'map'); });

  /* ============================================================
     EGG HATCH — the reward is a new friend
     ============================================================ */
  var hatchState = null;
  ENTER.hatch = function(){
    var seed = ((Date.now() & 0x7fffffff) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    var baby = C.makeBaby(seed);
    hatchState = { seed: seed, baby: baby, taps: 0, open: false };
    var egg = $('#egg');
    egg.className = 'egg'; egg.innerHTML = '<svg class="crack" viewBox="0 0 100 128" aria-hidden="true"></svg>';
    egg.style.setProperty('--egg', shade(baby.body, 0.55)); egg.style.setProperty('--spot', baby.body);
    egg.hidden = false;
    $('#babyReveal').hidden = true; $('#babyName').hidden = true; $('#btnHatchNext').hidden = true;
    $('#hatchHint').hidden = false; $('#hatchHint').textContent = 'Tap the egg!';
    $('#hatchTitle').textContent = 'A surprise!';
    buddies(C.CHAR_ORDER.slice(), true, true);
    later(function(){ speech.say('Something is hatching! Tap the egg!', { rate: 0.95 }); }, 400);
    setNudge(function(){ if (!hatchState.open){ wobble(); speech.say('Tap the egg!', { dedupeMs: 0 }); } });
  };
  var CRACKS = ['M50 30 L44 44 L54 52 L46 64', 'M46 64 L30 70 L36 82 M54 52 L70 58 L64 72', 'M36 82 L28 96 M64 72 L76 86 L70 98 M50 30 L58 20'];
  function wobble(){ var e = $('#egg'); e.classList.remove('wobble'); void e.offsetWidth; e.classList.add('wobble'); }
  $('#egg').addEventListener('click', function(){
    if (!hatchState || hatchState.open) return;
    hatchState.taps++;
    wobble();
    sfx.play('crack');
    var svg = $('#egg .crack');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', CRACKS[Math.min(2, hatchState.taps - 1)]);
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#5B3A1A'); path.setAttribute('stroke-width', '3.5'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    env.react('look', ACT.centre($('#egg')));
    $('#hatchHint').textContent = hatchState.taps < 3 ? ['Again!', 'One more!'][hatchState.taps - 1] : '';
    if (hatchState.taps >= 3) hatchOpen();
  });
  function hatchOpen(){
    var h = hatchState; h.open = true;
    clearNudge();
    var egg = $('#egg'); egg.classList.add('gone');
    sfx.play('hatch');
    /* remember it: in the base for good, and on this planet on the map */
    S.babies.push({ seed: h.seed, at: Date.now() });
    if (!P.review){
      if (S.week.done.indexOf(P.i) === -1) S.week.done.push(P.i);
      S.week.eggs[P.i] = h.seed;
    }
    save();
    later(function(){
      egg.hidden = true;
      var rv = $('#babyReveal'); rv.innerHTML = babyArt(h.baby); rv.hidden = false;
      var nm = $('#babyName'); nm.innerHTML = 'Meet ' + h.baby.name + '!<small>a baby ' + { rex: 'T. rex', trike: 'triceratops', dash: 'raptor', swoop: 'pterosaur' }[h.baby.kind] + '</small>';
      nm.hidden = false;
      $('#hatchHint').hidden = true;
      $('#hatchTitle').textContent = 'A new friend!';
      confetti(); sfx.play('fanfare');
      env.react('cheer');
      speech.say('Meet ' + h.baby.name + '! A baby ' + { rex: 'T rex', trike: 'triceratops', dash: 'raptor', swoop: 'pterosaur' }[h.baby.kind] + '!', { rate: 0.95 });
      var more = C.nextPlanet(S.week, S.words.length);
      var nb = $('#btnHatchNext');
      nb.textContent = more !== -1 ? 'Next planet ›' : 'Meteor shower! ›';
      nb.hidden = false;
    }, 420);
  }
  $('#btnHatchNext').addEventListener('click', function(){
    sfx.play('tap');
    var more = C.nextPlanet(S.week, S.words.length);
    if (more !== -1) startPlanet(more); else startFinale();
  });

  /* ============================================================
     METEOR SHOWER — the spaced, from-memory review
     ============================================================ */
  function startFinale(){
    var list = C.reviewQueue(S.words, S.stats, Math.min(4, S.words.length));
    P = { review: true, list: list, step: 0, stat: null, acts: [] };
    go('flight');
  }
  function finishFinale(){
    S.week.finale = true; save();
    go('done');
  }

  /* ============================================================
     MISSION COMPLETE
     ============================================================ */
  ENTER.done = function(){
    $('#doneLine').textContent = 'You spelled all ' + S.words.length + ' word' + (S.words.length === 1 ? '' : 's') + ' and hatched ' + S.week.done.length + ' baby dino' + (S.week.done.length === 1 ? '' : 's') + '!';
    var box = $('#doneWords'); box.innerHTML = '';
    S.words.forEach(function(w){ box.appendChild(el('span', null, w.toLowerCase())); });
    applyPlanet(planetOf(0));
    confetti(); sfx.play('fanfare');
    buddies(C.CHAR_ORDER.slice(), true, true);
    later(function(){ env.react('cheer'); }, 800);
    later(function(){ speech.say('Mission complete! Amazing work, Grayson!', { rate: 0.92 }); }, 500);
    var again = function(){ env.react('cheer'); later(again, 4200); };
    later(again, 4200);
  };
  $('#btnDoneBase').addEventListener('click', function(){ sfx.play('tap'); go('base'); });
  $('#btnDoneHome').addEventListener('click', function(){ sfx.play('tap'); go('home'); });

  /* ============================================================
     DINO BASE — every baby he has ever hatched, living together
     ============================================================ */
  var baseLoop = null;
  ENTER.base = function(){
    noBuddies();
    applyPlanet(C.PLANETS[4]);
    var box = $('#babies'); box.innerHTML = '';
    $('#baseCount').textContent = S.babies.length ? S.babies.length + ' dino' + (S.babies.length === 1 ? '' : 's') : '';
    $('#baseEmpty').hidden = S.babies.length > 0;
    /* the babies stand on the ground in up to three rows: the back rows a
       little higher and smaller, so a big family reads as a crowd, not a pile */
    var W = window.innerWidth, gy = groundY();
    var list = S.babies.slice(-24);
    var size = clamp(Math.floor(W / 4.4), 72, 170);
    var perRow = Math.max(2, Math.floor((W - 12) / (size * 0.72)));
    var rows = Math.min(3, Math.ceil(list.length / perRow));
    var babies = list.map(function(rec, i){
      var b = C.makeBaby(rec.seed);
      var row = rows - 1 - (i % rows);                  /* 0 = front */
      var k = 1 - row * 0.14, s = size * k;
      var node = el('button', 'baby'); node.type = 'button';
      node.style.width = node.style.height = s + 'px';
      node.style.zIndex = String(10 - row);
      node.innerHTML = babyArt(b) + '<span class="tag">' + b.name + '</span>';
      node.setAttribute('aria-label', b.name);
      node.querySelectorAll('.eye').forEach(function(e){ e.style.animationDelay = (-Math.random() * 4).toFixed(2) + 's'; });
      box.appendChild(node);
      var inRow = Math.ceil(list.length / rows), slot = Math.floor(i / rows);
      var lo = 6, hi = W - s - 6;
      var x = lo + (hi - lo) * (inRow === 1 ? 0.5 : slot / (inRow - 1)) + (Math.random() - 0.5) * s * 0.3;
      var o = { node: node, b: b, s: s, lo: lo, hi: hi, x: clamp(x, lo, hi), baseY: gy - s * 0.93 - row * size * 0.2,
                face: Math.random() < 0.5 ? 1 : -1, tx: null, next: performance.now() + 600 + Math.random() * 2400, hop: 0, hopT: 0 };
      node.addEventListener('click', function(){
        sfx.play('giggle');
        o.hopT = performance.now(); o.hop = 1;
        node.classList.add('named');
        speech.say(b.name + '!', { rate: 1.05 });
        setTimeout(function(){ node.classList.remove('named'); }, 1800);
      });
      return o;
    });
    var last = performance.now(), mine = tok;
    function frame(now){
      if (mine !== tok){ baseLoop = null; return; }
      var dt = Math.min(48, now - last); last = now;
      babies.forEach(function(o){
        if (o.tx == null && now > o.next){ o.tx = clamp(o.x + (Math.random() - 0.5) * W * 0.6, o.lo, o.hi); o.face = o.tx > o.x ? 1 : -1; }
        if (o.tx != null){
          var d = o.tx - o.x, stp = 0.06 * dt;
          if (Math.abs(d) <= stp){ o.x = o.tx; o.tx = null; o.next = now + 1200 + Math.random() * 3500; if (Math.random() < 0.3){ o.hopT = now; o.hop = 1; } }
          else o.x += Math.sign(d) * stp;
        }
        var hp = o.hop ? Math.min(1, (now - o.hopT) / 520) : 1;
        if (hp >= 1) o.hop = 0;
        var jump = o.hop ? Math.sin(hp * Math.PI) * o.s * 0.5 : 0;
        var walk = o.tx != null ? Math.abs(Math.sin(now / 110)) * 5 : 0;
        o.node.style.transform = 'translate(' + o.x.toFixed(1) + 'px,' + (o.baseY - jump - walk).toFixed(1) + 'px) scaleX(' + o.face + ')';
      });
      baseLoop = requestAnimationFrame(frame);
    }
    if (babies.length) baseLoop = requestAnimationFrame(frame);
    later(function(){
      speech.say(S.babies.length ? 'Welcome to Dino Base! You have ' + S.babies.length + ' baby dino' + (S.babies.length === 1 ? '' : 's') + '!' : 'Finish a planet to hatch your first baby dino!', { rate: 0.95 });
    }, 400);
  };
  LEAVE.base = function(){ if (baseLoop) cancelAnimationFrame(baseLoop); baseLoop = null; };

  /* ============================================================
     GROWN-UPS
     ============================================================ */
  var entry = '';
  (function(){
    var pad = $('#keypad');
    ['1','2','3','4','5','6','7','8','9','','0','⌫'].forEach(function(k){
      var b = el('button', k ? '' : 'blank', k); b.type = 'button';
      if (k === '⌫') b.setAttribute('aria-label', 'Delete');
      if (!k){ b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); }
      b.addEventListener('click', function(){
        if (!k) return;
        sfx.play('tap');
        if (k === '⌫') entry = entry.slice(0, -1); else if (entry.length < 4) entry += k;
        dots();
        if (entry.length === 4){
          var ok = entry === PASSCODE;
          later(function(){
            if (ok){ entry = ''; go('words'); return; }
            var d = $('#passDots'); d.classList.remove('bad'); void d.offsetWidth; d.classList.add('bad');
            sfx.play('wrong'); entry = ''; later(dots, 420);
          }, 160);
        }
      });
      pad.appendChild(b);
    });
  })();
  function dots(){ $all('#passDots i').forEach(function(d, i){ d.classList.toggle('on', i < entry.length); }); if (!entry.length) $('#passDots').classList.remove('bad'); }
  ENTER.pass = function(){ entry = ''; dots(); noBuddies(); };

  var clearArmed = false;
  function drawList(){
    var ul = $('#wordList'); ul.innerHTML = '';
    if (!S.words.length) ul.appendChild(el('li', 'empty', "No words yet — add this week's list above"));
    S.words.forEach(function(w, i){
      var li = el('li');
      li.appendChild(el('span', 'n', String(i + 1)));
      li.appendChild(el('span', 'w', w.toLowerCase()));
      var x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Remove ' + w.toLowerCase());
      x.addEventListener('click', function(){ setWords(C.removeWord(S.words, w)); });
      li.appendChild(x); ul.appendChild(li);
    });
    $('#listCount').textContent = S.words.length ? S.words.length + (S.words.length === 1 ? ' word' : ' words') : '';
    $('#btnSavePlay').disabled = !S.words.length; $('#btnSavePlay').style.opacity = S.words.length ? '' : '.5';
    clearArmed = false; $('#btnClear').textContent = 'Clear all';
    var pl = $('#progressList'); pl.innerHTML = '';
    S.words.forEach(function(w){
      var st = C.normalizeStat(S.stats[w], w);
      var li = el('li');
      li.appendChild(el('span', 'w', w.toLowerCase()));
      var stars = el('span', 'stars');
      for (var k = 0; k < 3; k++) stars.appendChild(el('span', k < st.level ? '' : 'off', '★'));
      li.appendChild(stars);
      li.appendChild(el('span', 'm', st.plays ? st.plays + ' play' + (st.plays > 1 ? 's' : '') + (st.misses ? ', ' + st.misses + ' slip' + (st.misses > 1 ? 's' : '') : '') : 'new'));
      pl.appendChild(li);
    });
  }
  /* a changed list is a new week: settings normalisation starts a fresh route */
  function setWords(list){
    S.words = list;
    S = C.normalizeSettings(S);
    save(); drawList();
  }
  ENTER.words = function(){
    noBuddies();
    drawList();
    $('#addInput').value = '';
    $('#optSfx').checked = S.sfx; $('#optMusic').checked = S.music;
    fillSelect($('#optA'), C.A_SOUND_CHOICES, S.aSound);
    fillSelect($('#optE'), C.E_SOUND_CHOICES, S.eSound);
    $('#addNote').className = 'note';
    $('#addNote').textContent = 'Add one word, or paste the whole list: commas, spaces, numbers or new lines all work.';
  };
  function fillSelect(sel, choices, cur){
    sel.innerHTML = '';
    choices.forEach(function(c){ var o = el('option', null, '"' + c + '"'); o.value = c; if (c === cur) o.selected = true; sel.appendChild(o); });
  }
  $('#addForm').addEventListener('submit', function(e){
    e.preventDefault();
    var raw = $('#addInput').value, before = S.words.length;
    var tokens = raw.split(/[\s,;\/|.]+/).filter(function(t){ return t && !/^\d+\)?$/.test(t); });
    var accepted = C.parseWordInput(raw);
    setWords(C.addWords(S.words, raw));
    var added = S.words.length - before;
    var skipped = tokens.filter(function(t){ return accepted.indexOf(C.cleanWord(t)) === -1; });
    $('#addInput').value = '';
    var note = $('#addNote');
    if (skipped.length){ note.className = 'note warn'; note.textContent = 'Skipped ' + skipped.slice(0, 4).join(', ') + ' — words need 2 to 12 letters.'; }
    else if (!added && accepted.length){ note.className = 'note warn'; note.textContent = S.words.length >= C.MAX_WORDS ? 'The list is full (' + C.MAX_WORDS + ' words).' : 'Already on the list.'; }
    else { note.className = 'note'; note.textContent = added ? 'Added ' + added + (added === 1 ? ' word.' : ' words.') : 'Type a word first.'; }
    $('#addInput').focus();
  });
  $('#btnClear').addEventListener('click', function(){
    if (!clearArmed){ clearArmed = true; $('#btnClear').textContent = 'Tap again to clear'; return; }
    setWords([]);
  });
  $('#btnSample').addEventListener('click', function(){ setWords(C.DEFAULT_WORDS.slice()); });
  $('#btnSavePlay').addEventListener('click', function(){ if (!S.words.length) return; save(); startPlanet(C.nextPlanet(S.week, S.words.length) === -1 ? 0 : C.nextPlanet(S.week, S.words.length)); });
  $('#btnResetWeek').addEventListener('click', function(){ S.week.done = []; S.week.eggs = {}; S.week.finale = false; save(); toast('Mission restarted — the planets are waiting!'); });
  $('#optSfx').addEventListener('change', function(e){ S.sfx = e.target.checked; sfx.setMuted(!S.sfx); save(); if (S.sfx) sfx.play('correct'); });
  $('#optMusic').addEventListener('change', function(e){ S.music = e.target.checked; save(); if (S.music) sfx.startMusic(); else sfx.stopMusic(); });
  $('#optA').addEventListener('change', function(e){ S.aSound = e.target.value; save(); });
  $('#optE').addEventListener('change', function(e){ S.eSound = e.target.value; save(); });
  $('#btnVoiceTest').addEventListener('click', function(){
    speech.reset();
    speech.spell('AND', { soundOf: soundOf }).then(function(ok){ if (ok) return speech.spell('SEE', { soundOf: soundOf }); });
  });

  $all('[data-back]').forEach(function(b){ b.addEventListener('click', function(){ sfx.play('tap'); go(b.getAttribute('data-back')); }); });

  var resizeT = null;
  window.addEventListener('resize', function(){
    clearTimeout(resizeT);
    resizeT = setTimeout(function(){ if (stage.ambient.active() && buddyKeys) buddies(buddyKeys, buddyLineup, true); }, 200);
  });
  document.addEventListener('visibilitychange', function(){
    if (document.hidden){ speech.reset(); if (!stage.idle()) stage.stop(false); sfx.stopMusic(); }
    else if (S.music && unlocked && !params.has('mute')) sfx.startMusic();
  });

  /* test hooks (read-only use) */
  window.__game = {
    core: C, stage: stage, speech: speech, sfx: sfx, settings: function(){ return S; },
    state: function(){ return { screen: screen, planet: P && P.i, word: P && (P.review ? P.list[P.step] : P.word), step: P && P.step, acts: P && (P.review ? P.list.map(function(){ return 'blast'; }) : P.acts), review: P && P.review }; },
    go: go, startPlanet: startPlanet,
    /* jump the current planet to step k, optionally swapping in another activity */
    jump: function(k, act){ if (!P || screen !== 'play') return; if (act && !P.review) P.acts[k] = act; P.step = k; runStep(); }
  };

  go('home');
})();
