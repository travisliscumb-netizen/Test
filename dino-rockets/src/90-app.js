/* ============================================================
   APP — the mission.

   The week's words are a route through space: one planet per word. On
   each planet the word is practised through a short run of activities
   (chosen by how well he already knows it), the rocket blasts off, the
   crew clears the letters, and an egg hatches a baby dino that joins his
   Dino Base for good. When every planet is done, the Meteor King brings
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
  var stage = createStage({ core: C, sfx: sfx, art: DINO_ART, memberArt: memberArt });
  stage.init($('#fxLayer'));
  /* the four he takes on missions, as they are now (level, size, badges) */
  function crewMembers(){ return C.rosterMembers(S); }
  function syncCast(){ stage.setCast(crewMembers()); }
  syncCast();
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
      onTap: function(key){
        var m = C.memberInfo(S, key);
        if (m && (screen === 'home' || screen === 'done' || screen === 'hatch')) speech.say("I'm " + m.name + '!', { rate: 0.95 });
      }
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
    var lead = C.pickLead(S.leadHistory, null, S.roster);
    var rest = C.shuffle(S.roster.filter(function(k){ return k !== lead; }));
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

  /* the rocket, in whichever paint job he picked in the hangar */
  function rocketSvg(skinId){
    var k = C.ROCKET_SKINS.filter(function(x){ return x.id === (skinId || S.skin); })[0] || C.ROCKET_SKINS[0];
    return '<svg viewBox="0 0 120 170" aria-hidden="true">' +
      '<path d="M60 6 C84 26 92 58 88 96 L32 96 C28 58 36 26 60 6Z" fill="' + k.body + '" stroke="#0A1433" stroke-width="5"/>' +
      (k.stripe ? '<path d="M34 78 L86 78 L87 86 L33 86 Z" fill="' + k.stripe + '"/>' : '') +
      '<path d="M60 6 C72 16 80 30 84 44 L36 44 C40 30 48 16 60 6Z" fill="' + k.nose + '" stroke="#0A1433" stroke-width="5"/>' +
      '<circle cx="60" cy="64" r="13" fill="' + k.window + '" stroke="#0A1433" stroke-width="5"/><circle cx="56" cy="60" r="4" fill="#fff" opacity=".8"/>' +
      '<path d="M32 76 L12 108 L34 104 Z M88 76 L108 108 L86 104 Z" fill="' + k.fins + '" stroke="#0A1433" stroke-width="5" stroke-linejoin="round"/>' +
      '<rect x="40" y="94" width="40" height="12" rx="4" fill="#5E6B80" stroke="#0A1433" stroke-width="4"/>' +
      '<path class="flame" d="M44 108 Q60 170 76 108 Z" fill="#FF8A1F"/><path class="flame" d="M50 108 Q60 150 70 108 Z" fill="#FFE08A"/></svg>';
  }

  /* ---------------- activities ---------------- */
  var env = {
    C: C, $: $, $all: $all, el: el, speech: speech, sfx: sfx, stage: stage,
    later: later, alive: alive, soundOf: soundOf, sayWord: sayWord, pick: pick,
    FOUND: FOUND, TRY: TRY, setNudge: setNudge, clearNudge: clearNudge,
    react: function(kind, point){ stage.ambient.react(kind, point); },
    toast: function(m){ toast(m); },
    rocketSvg: function(){ return rocketSvg(); },
    spellSlots: function(word, slots){
      return speech.spell(word, { soundOf: soundOf, onLetter: function(i){ slots.forEach(function(s, k){ s.classList.toggle('lit', k === i); }); } })
        .then(function(ok){ slots.forEach(function(s){ s.classList.remove('lit'); }); return ok; });
    }
  };
  var ACT = createActivities(env);
  var ACT_ICON = { meet: '👀', zap: '☄️', build: '🔋', missing: '🧩', blast: '🚀', race: '🏁', check: '🔍', rhyme: '🎵' };

  function perform(els){
    var cast = crewMembers();
    var lead = C.pickLead(S.leadHistory, null, cast.map(function(m){ return m.id; }));
    var plan = C.planScene({ letters: els.length, lead: lead, cast: cast, history: S.sceneHistory });
    if (plan.id) S.sceneHistory = [C.histEntry(plan)].concat(S.sceneHistory).slice(0, 12);
    S.leadHistory = C.remember(S.leadHistory, plan.lead, 8);
    /* everyone in the scene earns experience; the lead the most */
    var aw = C.awardScene(S.crew, plan);
    S.crew = aw.crew;
    save();
    window.__lastScene = { id: plan.id, lead: plan.lead, mirror: plan.mirror, who: Object.keys(plan.members || {}) };
    return stage.play(plan, els, { layer: $('#fxLayer'), groundY: groundY(), dust: currentPlanet ? currentPlanet.rim : null })
      .then(function(r){ celebrate(aw.ups); return r; });
  }

  /* ---------------- levelling up ---------------- */
  var upQueue = [], upBusy = false;
  function celebrate(ups){
    (ups || []).forEach(function(u){ upQueue.push(u); });
    if (!upBusy) nextUp();
  }
  /* what a new level brings: growing up, and any scene he can now lead */
  function levelNews(m, level){
    var before = { id: m.id, kind: m.kind, power: m.power, level: level - 1 }, after = { id: m.id, kind: m.kind, power: m.power, level: level };
    var grewFrom = C.growFor(m, level - 1), grewTo = C.growFor(m, level);
    var learned = C.SCENES.filter(function(sc){ return C.canLead(sc, after) && !C.canLead(sc, before); }).map(function(sc){ return sc.name; });
    if (grewFrom !== grewTo) return { line: grewTo === 'grown' ? 'All grown up!' : 'Grew into a big kid!', say: m.name + ' grew up!' };
    if (learned.length) return { line: 'Learned ' + learned.slice(0, 2).join(' and ') + '!', say: m.name + ' learned ' + learned[0] + '!' };
    if (level === 4) return { line: 'Earned a gold star badge!', say: m.name + ' earned a gold star!' };
    if (level === 5) return { line: 'Earned a crown!', say: m.name + ' earned a crown!' };
    return { line: 'Stronger than ever!', say: '' };
  }
  function nextUp(){
    var u = upQueue.shift();
    if (!u){ upBusy = false; return; }
    upBusy = true;
    var m = C.memberInfo(S, u.id);
    if (!m){ nextUp(); return; }
    var news = levelNews(m, u.level);
    window.__levelUps = (window.__levelUps || 0) + 1;
    syncCast();
    stage.celebrate(u.id);
    $('#luArt').innerHTML = memberArt(m);
    $('#luTitle').textContent = m.name + ' is level ' + u.level + '!';
    $('#luLine').textContent = news.line;
    var box = $('#levelUp');
    box.hidden = false; box.style.animation = 'none'; void box.offsetWidth; box.style.animation = '';
    sfx.play('fanfare');
    speech.say('Level up! ' + m.name + ' is level ' + u.level + '. ' + news.say, { rate: 0.95, keep: true });
    setTimeout(function(){ box.hidden = true; nextUp(); }, 3000);
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
    $('#playLabel').textContent = !n ? 'ADD WORDS' : (next !== -1 ? (done ? 'KEEP GOING!' : 'BLAST OFF!') : (S.week.finale ? 'PLAY AGAIN' : 'BOSS BATTLE!'));
    $('#babyCount').textContent = S.babies.length ? String(S.babies.length) : '';
    $('#partCount').textContent = S.parts ? '🔩' + S.parts : '';
    try { selfProblems = C.selfCheck(S.words, crewMembers()); } catch (e){ selfProblems = ['self-check crashed: ' + e.message]; }
    if (!save()) selfProblems.push('this browser will not save progress (private browsing?)');
    var sc = $('#selfCheck');
    sc.classList.toggle('bad', selfProblems.length > 0);
    sc.textContent = selfProblems.length ? '⚠ ' + selfProblems.length + ' problem' + (selfProblems.length > 1 ? 's' : '') + ' — tap' : '✓ All systems go' + (speech.available() ? '' : ' (no voice)');
    buddies(S.roster.slice(), true);
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
  $('#btnHangar').addEventListener('click', function(){ sfx.play('tap'); go('hangar'); });
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
      if (i === next){ var r = el('span', 'map-rocket'); r.innerHTML = rocketSvg(); b.appendChild(r); }
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
      var fb = el('button', 'planet-btn'); fb.type = 'button'; fb.setAttribute('aria-label', 'The Meteor King');
      fb.innerHTML = '<span class="map-boss">' + BOSS_SVG + '</span>';
      fb.addEventListener('click', function(){
        sfx.play('tap');
        if (next !== -1){ toast('Visit every planet first!'); return; }
        startFinale();
      });
      fin.appendChild(fb);
      var fl = el('div', 'map-label');
      fl.appendChild(el('span', 'map-word', 'Meteor King'));
      fl.appendChild(el('span', 'map-planet', S.week.finale ? 'Beaten ✓' : 'Boss battle'));
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
    P = { review: false, i: i, word: w, planet: planetOf(i), stat: stat, acts: C.activitiesFor(stat.level, stat, w), step: 0 };
    go('flight');
  }
  ENTER.flight = function(){
    var p = P.review ? { name: 'the Meteor King' } : P.planet;
    $('#flightRocket').innerHTML = rocketSvg();
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
      var i = el('i', k < P.step ? 'done' : (k === P.step ? 'now' : ''), k < P.step ? '✓' : (P.review ? '👑' : ACT_ICON[P.acts[k]]));
      box.appendChild(i);
    }
    $('#planetTag').textContent = P.review ? 'Boss battle' : P.planet.name;
  }
  /* ---------------- the Meteor King ---------------- */
  var BOSS_SVG = '<svg viewBox="0 0 120 120" aria-hidden="true">' +
    '<path d="M60 8 C92 8 112 30 112 60 C112 92 90 112 60 112 C28 112 8 92 8 60 C8 30 30 8 60 8Z" fill="#7A5A48" stroke="#2A1810" stroke-width="5"/>' +
    '<circle cx="36" cy="40" r="9" fill="#5B4034"/><circle cx="84" cy="84" r="11" fill="#5B4034"/><circle cx="88" cy="36" r="6" fill="#5B4034"/>' +
    '<path d="M22 12 l10 14 8 -18 8 16 12 -20 12 20 8 -16 8 18 10 -14 -2 22 H24 Z" fill="#FFC53D" stroke="#8A5A08" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M34 54 L52 60 M86 54 L68 60" stroke="#2A1810" stroke-width="5" stroke-linecap="round"/>' +
    '<circle cx="44" cy="66" r="8" fill="#fff" stroke="#2A1810" stroke-width="3"/><circle cx="76" cy="66" r="8" fill="#fff" stroke="#2A1810" stroke-width="3"/>' +
    '<circle cx="46" cy="67" r="4" fill="#14213D"/><circle cx="74" cy="67" r="4" fill="#14213D"/>' +
    '<path d="M44 90 Q60 80 76 90" fill="none" stroke="#2A1810" stroke-width="5" stroke-linecap="round"/>' +
    '<path d="M4 44 q-10 -8 -2 -18 M116 76 q10 6 2 18" stroke="#FF8A1F" stroke-width="6" stroke-linecap="round" fill="none"/></svg>';
  function drawBoss(){
    var old = $('#bossBar'); if (old) old.remove();
    if (!P || !P.review) return;
    var b = el('div', 'boss'); b.id = 'bossBar';
    var hp = 1 - P.hits / P.list.length;
    b.innerHTML = '<div class="boss-face">' + BOSS_SVG + '</div><div class="boss-info"><span class="boss-name">The Meteor King</span>' +
      '<span class="boss-hp"><i style="width:' + Math.round(hp * 100) + '%"></i></span></div>';
    $('#playCard').insertBefore(b, $('#activity'));
  }
  /* a laser from the launch pad, and the boss loses a chunk of health */
  function hitBoss(){
    return new Promise(function(resolve){
      var b = $('#bossBar');
      if (!b){ resolve(); return; }
      P.hits++;
      var face = $('.boss-face', b).getBoundingClientRect();
      var laser = el('div', 'boss-laser');
      var fromY = window.innerHeight - 40, toY = face.top + face.height / 2;
      laser.style.left = (face.left + face.width / 2 - 4) + 'px'; laser.style.top = toY + 'px'; laser.style.height = (fromY - toY) + 'px';
      document.body.appendChild(laser);
      sfx.play('zap');
      try { laser.animate([{ transform: 'scaleY(0)', opacity: 1 }, { transform: 'scaleY(1)', opacity: 1, offset: 0.4 }, { transform: 'scaleY(1)', opacity: 0 }], { duration: 520 }); } catch (e){}
      later(function(){
        laser.remove();
        sfx.play('explode');
        b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit');
        $('.boss-hp i', b).style.width = Math.round((1 - P.hits / P.list.length) * 100) + '%';
        if (P.hits >= P.list.length){ b.classList.add('dead'); sfx.play('fanfare'); confetti(); }
        env.react('cheer');
        later(resolve, P.hits >= P.list.length ? 900 : 400);
      }, 300);
    });
  }

  ENTER.play = function(){
    renderSteps();
    drawBoss();
    $('#btnPlayBack').textContent = '‹ Map';
    buddies(pickBuddies(), false, true);
    runStep();
  };
  function runStep(){
    stepTok++;
    clearNudge();
    renderSteps();
    var root = $('#activity');
    root.className = 'activity';
    root.style.animation = 'none'; void root.offsetWidth; root.style.animation = 'screenIn .3s';
    var act = P.review ? 'blast' : P.acts[P.step];
    var word = P.review ? P.list[P.step] : P.word;
    var st = stepTok, doneOnce = false;
    ACT[act]({
      word: word, root: root, tok: st, stat: P.stat, review: P.review, sentence: S.sentences[word] || '',
      done: function(res){ if (doneOnce || st !== stepTok) return; doneOnce = true; afterStep(act, word, res || {}, st); }
    });
  }
  function afterStep(act, word, res, st){
    if (act === 'build' || act === 'missing' || act === 'race'){
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
          return speech.say(pick('spelled', SPELLED) + ' You spelled ' + word.toLowerCase() + '!', { rate: 0.9, keep: true });
        }).then(function(){
          if (st !== stepTok) return;
          if (P.review) return hitBoss().then(function(){ if (st === stepTok) return perform(res.slots); });
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
        /* the rocket he fuelled is the one that goes: it lifts off from the dock */
        var src = $('.activity .fuel-rocket'), from;
        if (src){ var rr = src.getBoundingClientRect(); from = { x: rr.left + rr.width / 2, y: rr.top + rr.height / 2, s: rr.width / 120 }; src.style.visibility = 'hidden'; }
        else from = { x: window.innerWidth / 2, y: window.innerHeight - 120, s: 1 };
        var r = el('div', 'launch-rocket'); r.innerHTML = rocketSvg(); document.body.appendChild(r);
        r.style.left = (from.x - 60) + 'px'; r.style.marginLeft = '0'; r.style.top = (from.y - 85) + 'px';
        var trail = setInterval(function(){
          var b = r.getBoundingClientRect(); if (!b.width) return;
          var puff = el('i', 'launch-smoke'); puff.style.left = (b.left + b.width / 2) + 'px'; puff.style.top = (b.bottom - 10) + 'px';
          document.body.appendChild(puff);
          try { puff.animate([{ transform: 'translate(-50%,0) scale(.4)', opacity: .9 }, { transform: 'translate(calc(-50% + ' + ((Math.random() - 0.5) * 60) + 'px), 40px) scale(1.6)', opacity: 0 }], { duration: 700, easing: 'ease-out' }); } catch (e){}
          setTimeout(function(){ puff.remove(); }, 720);
        }, 60);
        var s0 = from.s, rise = from.y + 260;
        try {
          r.animate([
            { transform: 'translateY(0) scale(' + s0 + ')' },
            { transform: 'translate(-3px,4px) scale(' + (s0 * 1.05) + ')', offset: 0.08 },
            { transform: 'translate(3px,2px) scale(' + (s0 * 1.1) + ')', offset: 0.16 },
            { transform: 'translate(0,-' + (rise * 0.18) + 'px) scale(' + (s0 * 1.25) + ')', offset: 0.4 },
            { transform: 'translate(0,-' + rise + 'px) scale(' + (s0 * 1.4) + ')' }
          ], { duration: 1700, easing: 'cubic-bezier(.5,0,.8,.6)', fill: 'forwards' });
        } catch (e){}
        setTimeout(function(){ clearInterval(trail); r.remove(); cd.remove(); resolve(); }, 1750);
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
    /* every baby gets a name nobody else in his base has */
    var taken = {};
    C.allMembers(S).forEach(function(m){ taken[m.name] = 1; });
    var seed, baby, tries = 0;
    do {
      seed = ((Date.now() & 0x7fffffff) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
      baby = C.makeBaby(seed);
    } while (taken[baby.name] && ++tries < 60);
    hatchState = { seed: seed, baby: baby, taps: 0, open: false };
    var egg = $('#egg');
    egg.className = 'egg'; egg.innerHTML = '<svg class="crack" viewBox="0 0 100 128" aria-hidden="true"></svg>';
    egg.style.setProperty('--egg', shade(baby.body, 0.55)); egg.style.setProperty('--spot', baby.body);
    egg.hidden = false;
    $('#babyReveal').hidden = true; $('#babyName').hidden = true; $('#btnHatchNext').hidden = true;
    $('#babyPower').hidden = true; $('#btnHatchCrew').hidden = true;
    $('#hatchHint').hidden = false; $('#hatchHint').textContent = 'Tap the egg!';
    $('#hatchTitle').textContent = 'A surprise!';
    buddies(S.roster.slice(), true, true);
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
    /* the whole crew grows a little with every planet */
    var ap = C.awardPlanet(S.crew, S.roster);
    S.crew = ap.crew;
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
      var pw = C.POWERS[h.baby.power];
      var pl = $('#babyPower'); pl.textContent = 'Super power: ' + pw.icon + ' ' + pw.name; pl.hidden = false;
      $('#btnHatchCrew').hidden = false;
      speech.say('Meet ' + h.baby.name + '! A baby ' + { rex: 'T rex', trike: 'triceratops', dash: 'raptor', swoop: 'pterosaur' }[h.baby.kind] + ' who ' + pw.says + '!', { rate: 0.95, keep: true });
      setTimeout(function(){ celebrate(ap.ups); }, 2400);
      var more = C.nextPlanet(S.week, S.words.length);
      var nb = $('#btnHatchNext');
      nb.textContent = more !== -1 ? 'Next planet ›' : 'Boss battle! ›';
      nb.hidden = false;
    }, 420);
  }
  $('#btnHatchCrew').addEventListener('click', function(){ sfx.play('tap'); go('base', { pick: hatchState && hatchState.baby.id }); });
  $('#btnHatchNext').addEventListener('click', function(){
    sfx.play('tap');
    var more = C.nextPlanet(S.week, S.words.length);
    if (more !== -1) startPlanet(more); else startFinale();
  });

  /* ============================================================
     THE METEOR KING — the spaced, from-memory review, as a boss battle
     ============================================================ */
  function startFinale(){
    var list = C.reviewQueue(S.words, S.stats, Math.min(4, S.words.length));
    P = { review: true, list: list, step: 0, stat: null, acts: [], hits: 0 };
    go('flight');
  }
  /* beating the Meteor King the first time this week earns a rocket part */
  function finishFinale(){
    var first = !S.week.finale;
    S.week.finale = true;
    var before = C.skinsUnlocked(S.parts).length;
    if (first) S.parts++;
    save();
    go('show', { part: first, newSkin: C.skinsUnlocked(S.parts).length > before });
  }

  /* ============================================================
     VICTORY SHOW — after the boss, every crew member performs one of the
     week's words in turn, fireworks between the acts, and a bow at the end.
     It is the week's big reward: long enough to enjoy, and skippable.
     ============================================================ */
  function fireworks(n){
    var box = $('#confetti'), cols = ['#FFC53D', '#FF8A1F', '#8FE3FF', '#FFFFFF', '#3FBF4F', '#E53935'];
    for (var k = 0; k < n; k++){
      (function(k){
        later(function(){
          var cx = window.innerWidth * (0.15 + Math.random() * 0.7), cy = window.innerHeight * (0.12 + Math.random() * 0.3);
          var col = cols[Math.floor(Math.random() * cols.length)];
          sfx.play('pop');
          for (var i = 0; i < 22; i++){
            var f = el('i', 'firework'); f.style.left = cx + 'px'; f.style.top = cy + 'px'; f.style.background = i % 3 ? col : '#fff';
            box.appendChild(f);
            var ang = (Math.PI * 2 * i) / 22, r = 60 + Math.random() * 60;
            try { f.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(' + (Math.cos(ang) * r) + 'px,' + (Math.sin(ang) * r + 30) + 'px) scale(.3)', opacity: 0 }],
              { duration: 1000 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }); } catch (e){}
            (function(ff){ later(function(){ ff.remove(); }, 1400); })(f);
          }
        }, k * 380);
      })(k);
    }
  }
  var showArg = null;
  ENTER.show = function(arg){
    showArg = arg || {};
    noBuddies();
    applyPlanet(planetOf(S.week.offset + 3));
    var crew = crewMembers();
    var words = C.shuffle(S.words.slice());
    var acts = crew.map(function(m, i){ return { m: m, w: words[i % words.length] }; });
    var mine = tok, used = [];
    $('#showAct').textContent = '';
    $('#showWord').innerHTML = '';
    speech.say('Victory show! Your crew is going to show off!', { rate: 0.95, keep: true });
    fireworks(4);
    sfx.play('fanfare');
    function act(i){
      if (mine !== tok) return;
      if (i >= acts.length){ bow(); return; }
      var a = acts[i];
      var line = $('#showAct'); line.textContent = a.m.name + '!'; line.style.animation = 'none'; void line.offsetWidth; line.style.animation = '';
      var box = $('#showWord'); box.innerHTML = '';
      var slots = a.w.split('').map(function(ch){ var sl = ACT.slotEl(); ACT.fillSlot(sl, ch); box.appendChild(sl); return sl; });
      speech.say(a.m.name + '! ' + a.w.toLowerCase() + '!', { rate: 0.95, keep: true }).then(function(){
        if (mine !== tok) return;
        later(function(){
          var plan = C.planScene({ letters: a.w.length, lead: a.m.id, cast: crew, history: used, showoff: true, victory: true, signature: true });
          if (plan.id) used.unshift(C.histEntry(plan));
          var aw = C.awardScene(S.crew, plan); S.crew = aw.crew; save();
          window.__showScenes = (window.__showScenes || []).concat([plan.id]);
          stage.play(plan, slots, { layer: $('#fxLayer'), groundY: groundY(), dust: currentPlanet ? currentPlanet.rim : null }).then(function(){
            if (mine !== tok) return;
            celebrate(aw.ups);
            fireworks(3);
            later(function(){ act(i + 1); }, 1400);
          });
        }, 300);
      });
    }
    function bow(){
      $('#showAct').textContent = 'Take a bow, crew!';
      $('#showWord').innerHTML = '';
      buddies(S.roster.slice(), true, true);
      speech.say('Take a bow, crew! Hooray for Grayson!', { rate: 0.95, keep: true });
      fireworks(8);
      confetti();
      [900, 2300, 3700].forEach(function(ms){ later(function(){ env.react('cheer'); sfx.play('cheer'); }, ms); });
      later(function(){ go('done', showArg); }, 5600);
    }
    later(function(){ act(0); }, 1800);
  };
  $('#btnSkipShow').addEventListener('click', function(){ sfx.play('tap'); go('done', showArg); });

  /* ============================================================
     MISSION COMPLETE
     ============================================================ */
  ENTER.done = function(arg){
    var dp = $('#donePart');
    dp.hidden = !(arg && arg.part);
    if (arg && arg.part){
      var nx = C.nextSkin(S.parts);
      dp.innerHTML = '<span class="pt">🔩</span><span>You won a rocket part!' + (arg.newSkin ? ' New rocket paint in the Hangar!' : (nx ? ' ' + (nx.parts - S.parts) + ' more for the next paint job.' : '')) + '</span>';
      later(function(){ speech.say(arg.newSkin ? 'You beat the Meteor King and won a rocket part! There is new paint in the hangar!' : 'You beat the Meteor King and won a rocket part!', { rate: 0.95 }); }, 3200);
    }
    $('#doneLine').textContent = 'You spelled all ' + S.words.length + ' word' + (S.words.length === 1 ? '' : 's') + ' and hatched ' + S.week.done.length + ' baby dino' + (S.week.done.length === 1 ? '' : 's') + '!';
    var box = $('#doneWords'); box.innerHTML = '';
    S.words.forEach(function(w){ box.appendChild(el('span', null, w.toLowerCase())); });
    applyPlanet(planetOf(0));
    confetti(); sfx.play('fanfare');
    buddies(S.roster.slice(), true, true);
    later(function(){ env.react('cheer'); }, 800);
    later(function(){ speech.say('Mission complete! Amazing work, Grayson!', { rate: 0.92 }); }, 500);
    var again = function(){ env.react('cheer'); later(again, 4200); };
    later(again, 4200);
  };
  /* ============================================================
     HANGAR
     ============================================================ */
  ENTER.hangar = function(){
    noBuddies();
    var box = $('#skins'); box.innerHTML = '';
    var have = C.skinsUnlocked(S.parts), nx = C.nextSkin(S.parts);
    $('#hangarParts').textContent = '🔩 ' + S.parts;
    $('#hangarNote').textContent = nx ? 'Beat the Meteor King at the end of each week to win rocket parts. ' + (nx.parts - S.parts) + ' more for ' + nx.name + '!' : 'You have every rocket! Amazing!';
    C.ROCKET_SKINS.forEach(function(k){
      var open = have.indexOf(k.id) !== -1;
      var b = el('button', 'skin' + (k.id === S.skin ? ' on' : '') + (open ? '' : ' locked')); b.type = 'button';
      b.innerHTML = rocketSvg(k.id) + '<span class="sn">' + k.name + '</span><span class="need">' + (open ? (k.id === S.skin ? 'Flying this one' : 'Tap to fly') : '🔩 ' + k.parts + ' parts') + '</span>';
      b.setAttribute('aria-label', k.name + (open ? '' : ', locked'));
      b.addEventListener('click', function(){
        if (!open){ sfx.play('wrong'); speech.say('You need ' + k.parts + ' rocket parts for ' + k.name + '.', { rate: 0.95 }); return; }
        S.skin = k.id; save(); sfx.play('powerup');
        speech.say(k.name + ' rocket, ready for launch!', { rate: 0.95 });
        ENTER.hangar();
      });
      box.appendChild(b);
    });
  };

  $('#btnDoneBase').addEventListener('click', function(){ sfx.play('tap'); go('base'); });
  $('#btnDoneHome').addEventListener('click', function(){ sfx.play('tap'); go('home'); });

  /* ============================================================
     DINO BASE — every baby he has ever hatched, living together
     ============================================================ */
  var baseLoop = null, picked = null;
  function stars(level){
    var h = '';
    for (var k = 1; k <= C.MAX_LEVEL; k++) h += '<span' + (k <= level ? '' : ' class="off"') + '>★</span>';
    return h;
  }
  function speciesName(kind){ return { rex: 'T. rex', trike: 'triceratops', dash: 'raptor', swoop: 'pterosaur' }[kind]; }
  function showInfo(m){
    var box = $('#crewInfo');
    if (!m){ box.innerHTML = '<span>Every planet makes your crew stronger!</span>'; return; }
    var pw = m.power ? C.POWERS[m.power] : null;
    var toNext = C.xpToNext(m.xp), span = m.level >= C.MAX_LEVEL ? 1 : (C.LEVEL_XP[m.level] - C.LEVEL_XP[m.level - 1]);
    var pct = m.level >= C.MAX_LEVEL ? 100 : Math.round((1 - toNext / span) * 100);
    box.innerHTML = '<b>' + m.name + '</b><span>' + (m.orig ? '' : (m.grow === 'grown' ? '' : m.grow + ' ')) + speciesName(m.kind) +
      (pw ? ' · ' + pw.icon + ' ' + pw.name : '') + '</span><span class="xp" title="to next level"><i style="width:' + pct + '%"></i></span><span>Lv ' + m.level + '</span>';
  }
  function drawCrew(){
    var box = $('#crewSlots'); box.innerHTML = '';
    S.roster.forEach(function(id){
      var m = C.memberInfo(S, id);
      var b = el('button', 'crew-slot'); b.type = 'button';
      b.setAttribute('data-id', id);
      b.setAttribute('aria-label', m.name + ', level ' + m.level);
      b.innerHTML = '<span class="art">' + memberArt(m) + '</span><span class="nm">' + m.name + '</span><span class="lv">' + stars(m.level) + '</span>' +
        (m.power ? '<span class="pw">' + C.POWERS[m.power].icon + '</span>' : '');
      b.addEventListener('click', function(){ tapSlot(id, b); });
      box.appendChild(b);
    });
    $all('.crew-slot').forEach(function(x){ x.classList.toggle('target', !!picked); });
    $('#crewHint').textContent = picked ? 'Now tap a crew spot to swap in ' + C.memberInfo(S, picked).name : 'Tap a dino below, then a crew spot to swap';
  }
  function tapSlot(id, btn){
    sfx.play('tap');
    if (picked){
      var incoming = C.memberInfo(S, picked), leaving = C.memberInfo(S, id);
      S.roster = C.swapRoster(S.roster, id, picked);
      picked = null;
      save(); syncCast();
      sfx.play('powerup');
      speech.say(incoming.name + ' joins the crew!', { rate: 0.95 });
      toast(incoming.name + ' is in! ' + leaving.name + ' takes a rest.');
      ENTER.base({ quiet: true });
      var nb = $('.crew-slot[data-id="' + incoming.id + '"]');
      if (nb) nb.classList.add('swapped');
      return;
    }
    var m = C.memberInfo(S, id);
    showInfo(m);
    speech.say(m.name + '! Level ' + m.level + '.' + (m.power ? ' ' + C.POWERS[m.power].name + '!' : ''), { rate: 1 });
  }
  ENTER.base = function(arg){
    noBuddies();
    applyPlanet(C.PLANETS[4]);
    if (arg && arg.pick) picked = arg.pick;
    if (picked && S.roster.indexOf(picked) !== -1) picked = null;
    var box = $('#babies'); box.innerHTML = '';
    var everyone = C.allMembers(S);
    $('#baseCount').textContent = everyone.length + ' dinos';
    drawCrew();
    showInfo(picked ? C.memberInfo(S, picked) : null);
    /* everyone not in the crew hangs out on the ground (the newest 24) */
    var bench = everyone.filter(function(m){ return S.roster.indexOf(m.id) === -1; });
    var orig = bench.filter(function(m){ return m.orig; }), kids = bench.filter(function(m){ return !m.orig; }).slice(-24);
    var list = orig.concat(kids).map(function(m){ return C.memberInfo(S, m.id); });
    $('#baseEmpty').hidden = list.length > 0;
    var W = window.innerWidth, gy = groundY();
    var size = clamp(Math.floor(W / 4.4), 72, 170);
    var perRow = Math.max(2, Math.floor((W - 12) / (size * 0.72)));
    var rows = Math.min(3, Math.ceil(list.length / perRow));
    var babies = list.map(function(m, i){
      var row = rows - 1 - (i % rows);
      var k = (1 - row * 0.14) * (0.8 + 0.2 * m.scale), s2 = size * k;
      var node = el('button', 'baby' + (m.id === picked ? ' picked' : '')); node.type = 'button';
      node.setAttribute('data-id', m.id);
      node.style.width = node.style.height = s2 + 'px';
      node.style.zIndex = String(10 - row);
      node.innerHTML = memberArt(m) + '<span class="tag">' + m.name + '</span>' + (m.power ? '<span class="ptag">' + C.POWERS[m.power].icon + '</span>' : '');
      node.setAttribute('aria-label', m.name);
      box.appendChild(node);
      var inRow = Math.ceil(list.length / rows), slot = Math.floor(i / rows);
      var lo = 6, hi = W - s2 - 6;
      var x = lo + (hi - lo) * (inRow === 1 ? 0.5 : slot / (inRow - 1)) + (Math.random() - 0.5) * s2 * 0.3;
      var o = { node: node, m: m, s: s2, lo: lo, hi: hi, x: clamp(x, lo, hi), baseY: gy - s2 * 0.93 - row * size * 0.2,
                face: Math.random() < 0.5 ? 1 : -1, tx: null, next: performance.now() + 600 + Math.random() * 2400, hop: 0, hopT: 0 };
      node.addEventListener('click', function(){
        sfx.play('giggle');
        o.hopT = performance.now(); o.hop = 1;
        picked = m.id;
        $all('#babies .baby').forEach(function(n){ n.classList.toggle('picked', n === node); });
        drawCrew(); showInfo(m);
        speech.say(m.name + '!' + (m.power ? ' ' + C.POWERS[m.power].name + '.' : '') + ' Tap a crew spot!', { rate: 1.02 });
      });
      return o;
    });
    if (baseLoop) cancelAnimationFrame(baseLoop);
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
    if (!arg || !arg.quiet){
      later(function(){
        if (picked){ var pm = C.memberInfo(S, picked); speech.say('Tap a crew spot to put ' + pm.name + ' in your crew!', { rate: 0.95 }); return; }
        speech.say(list.length ? 'Welcome to Dino Base! Pick your crew of four.' : 'Finish a planet to hatch your first baby dino!', { rate: 0.95 });
      }, 400);
    }
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
      /* an optional example sentence for the word, used by Spell Check */
      var ed = el('button', 'x pen', '✎'); ed.type = 'button'; ed.setAttribute('aria-label', 'Sentence for ' + w.toLowerCase());
      li.appendChild(ed);
      var x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Remove ' + w.toLowerCase());
      x.addEventListener('click', function(){ setWords(C.removeWord(S.words, w)); });
      li.appendChild(x);
      var sub = el('div', 'sent-row');
      if (S.sentences[w]) sub.appendChild(el('span', 'sent', '“' + S.sentences[w] + '”'));
      li.appendChild(sub);
      ed.addEventListener('click', function(){
        sub.innerHTML = '';
        var f = el('form', 'sent-edit'); f.setAttribute('autocomplete', 'off');
        var inp = el('input'); inp.type = 'text'; inp.value = S.sentences[w] || ''; inp.placeholder = 'e.g. Mum said we can go.';
        inp.setAttribute('aria-label', 'Sentence using ' + w.toLowerCase()); inp.maxLength = 140;
        var ok = el('button', 'btn btn-blue small', 'Save'); ok.type = 'submit';
        var msg = el('p', 'note');
        f.appendChild(inp); f.appendChild(ok); sub.appendChild(f); sub.appendChild(msg);
        f.addEventListener('submit', function(ev){
          ev.preventDefault();
          var t = inp.value.replace(/\s+/g, ' ').trim();
          if (t && !C.sentenceHas(t, w)){ msg.className = 'note warn'; msg.textContent = 'The sentence needs the word "' + w.toLowerCase() + '" in it.'; return; }
          if (t) S.sentences[w] = t; else delete S.sentences[w];
          save(); drawList();
        });
        inp.focus();
      });
      ul.appendChild(li);
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
  var crewArmed = false;
  $('#btnResetCrew').addEventListener('click', function(){
    if (!crewArmed){ crewArmed = true; $('#btnResetCrew').textContent = 'Tap again: all back to level 1'; setTimeout(function(){ crewArmed = false; $('#btnResetCrew').textContent = 'Crew back to level 1'; }, 4000); return; }
    crewArmed = false; S.crew = {}; save(); syncCast();
    $('#btnResetCrew').textContent = 'Crew back to level 1';
    toast('Every dino is back to level 1.');
  });
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
