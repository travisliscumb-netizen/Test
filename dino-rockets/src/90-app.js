/* ============================================================
   APP — the week's adventure on Dino Island.

   The week's words are a trail across the island: one stop per word. At
   each stop the word is practised through a short run of activities
   (chosen by how well he already knows it) while every right answer
   warms an egg; then "3, 2, 1, ROAR!", the crew clears the letters, and
   the egg hatches a baby dino that joins his Dino Base for good. When
   every stop is done, the Grumpy Volcano brings the shakiest words back
   one more time — a spaced, from-memory review — and calming it wins a
   golden egg.

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
  var stage = createStage({ core: C, sfx: sfx, art: DINO_ART, memberArt: memberArt, neckPath: brachioNeckPath });
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
  var SPELLED = ['Awesome!', 'Super!', 'Way to go!', 'Brilliant!', 'Fantastic!', 'Dino-mite!', 'Great job, Grayson!', 'Roar-some, Grayson!'];
  var CALMER = ['The volcano is calming down!', 'Less grumpy now!', 'Keep going, it is working!'];
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
  var currentLand = null;
  function applyLand(p){
    currentLand = p;
    var st = document.body.style;
    st.setProperty('--sky1', p.sky[0]); st.setProperty('--sky2', p.sky[1]);
    st.setProperty('--ground', p.ground); st.setProperty('--rim', p.rim);
    st.setProperty('--rock', p.rock); st.setProperty('--glow', p.glow);
    document.body.setAttribute('data-land', p.id);
  }
  function landOf(i){ return C.landFor(i, S.week.offset); }
  function groundY(){ return $('#world .surface').getBoundingClientRect().top + 8; }
  /* a baby as he really is: his record says which generation hatched him */
  function babyBySeed(seed, gold){
    var rec = null;
    S.babies.forEach(function(b){ if (b.seed === seed && !!b.gold === !!gold) rec = b; });
    return C.babyOf(rec || { seed: seed, gen: C.BABY_GEN, gold: !!gold });
  }
  function speciesName(kind){ return { rex: 'T. rex', trike: 'triceratops', dash: 'raptor', swoop: 'pterosaur', brachio: 'brachiosaurus', stego: 'stegosaurus' }[kind]; }
  function speciesSay(kind){ return { rex: 'T rex', trike: 'triceratops', dash: 'raptor', swoop: 'pterosaur', brachio: 'brachiosaurus', stego: 'stegosaurus' }[kind]; }

  var buddyKeys = null, buddyLineup = false;
  function buddies(keys, lineup, force){
    var same = buddyKeys && keys.join() === buddyKeys.join() && buddyLineup === !!lineup;
    if (same && !force && stage.ambient.active()) return;
    buddyKeys = keys; buddyLineup = !!lineup;
    stage.ambient.start({
      keys: keys, groundY: groundY(), left: 6, right: window.innerWidth - 6, lineup: lineup, ceil: cardBottom(),
      dust: currentLand ? currentLand.rim : null,
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

  /* the colours of the egg he is warming: the very baby that will hatch */
  function eggColors(){
    if (P && P.review) return { shell: '#FFD23F', spot: '#FFFFFF' };
    var b = P && P.baby;
    return b ? { shell: shade(b.body, 0.55), spot: b.body } : { shell: '#FFF4DC', spot: '#FF8A1F' };
  }
  /* ---------------- activities ---------------- */
  var env = {
    C: C, $: $, $all: $all, el: el, speech: speech, sfx: sfx, stage: stage,
    later: later, alive: alive, soundOf: soundOf, sayWord: sayWord, pick: pick,
    FOUND: FOUND, TRY: TRY, setNudge: setNudge, clearNudge: clearNudge,
    react: function(kind, point){ stage.ambient.react(kind, point); },
    toast: function(m){ toast(m); },
    eggColors: eggColors,
    spellSlots: function(word, slots){
      return speech.spell(word, { soundOf: soundOf, onLetter: function(i){ slots.forEach(function(s, k){ s.classList.toggle('lit', k === i); }); } })
        .then(function(ok){ slots.forEach(function(s){ s.classList.remove('lit'); }); return ok; });
    }
  };
  var ACT = createActivities(env);
  var ACT_ICON = { meet: '👀', zap: '🍃', build: '🥚', missing: '🧩', blast: '🦖', race: '🏁', check: '🔍', rhyme: '🎵' };

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
    return stage.play(plan, els, { layer: $('#fxLayer'), groundY: groundY(), dust: currentLand ? currentLand.rim : null })
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
    if (level === 5) return { line: 'Earned a super star!', say: m.name + ' earned a super star!' };
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
     HOME
     ============================================================ */
  var selfProblems = [];
  ENTER.home = function(){
    var n = S.words.length, done = S.week.done.length, next = C.nextLand(S.week, n);
    applyLand(landOf(next === -1 ? 0 : next));
    $('#missionCount').textContent = n ? done + ' of ' + n + ' stops' : 'no words yet';
    var track = $('#missionTrack'); track.innerHTML = '';
    S.words.forEach(function(w, i){
      var d = el('i', S.week.done.indexOf(i) !== -1 ? 'done' : (i === next ? 'next' : ''));
      d.style.setProperty('--pc', landOf(i).ground);
      track.appendChild(d);
    });
    $('#playLabel').textContent = !n ? 'ADD WORDS' : (next !== -1 ? (done ? 'KEEP GOING!' : "LET'S GO!") :
      (!S.week.finale ? 'VOLCANO!' : (goldWaiting() ? 'GOLDEN EGG!' : 'PLAY AGAIN')));
    $('#babyCount').textContent = S.babies.length ? String(S.babies.length) : '';
    $('#fossilCount').textContent = S.fossils ? '🦴' + S.fossils : '';
    /* Stretch and Spike are new: tell him, until he has been to meet them */
    var nf = $('#newFriends');
    nf.hidden = !!S.metNew;
    if (!S.metNew){
      nf.innerHTML = '<span class="nf-art">' + memberArt(C.memberInfo(S, 'brachio')) + memberArt(C.memberInfo(S, 'stego')) + '</span><span>New friends! Stretch and Spike</span>';
      later(function(){ speech.say('Two new friends want to join your crew! Stretch and Spike!', { rate: 0.95 }); }, 900);
    }
    try { selfProblems = C.selfCheck(S.words, crewMembers()); } catch (e){ selfProblems = ['self-check crashed: ' + e.message]; }
    if (!save()) selfProblems.push('this browser will not save progress (private browsing?)');
    var sc = $('#selfCheck');
    sc.classList.toggle('bad', selfProblems.length > 0);
    sc.textContent = selfProblems.length ? '⚠ ' + selfProblems.length + ' problem' + (selfProblems.length > 1 ? 's' : '') + ' — tap' : '✓ All set' + (speech.available() ? '' : ' (no voice)');
    buddies(S.roster.slice(), true);
  };
  function goldWaiting(){ return S.week.finale && S.week.goldSeed != null && !S.week.goldHatched; }
  $('#selfCheck').addEventListener('click', function(){
    toast(selfProblems.length ? selfProblems.slice(0, 3).join(' • ') : 'Checked: words, activities and all ' + C.SCENES.length + ' crew scenes.', 4000);
  });
  $('#btnPlay').addEventListener('click', function(){
    sfx.play('tap');
    if (!S.words.length){ go('pass'); return; }
    var next = C.nextLand(S.week, S.words.length);
    if (next !== -1) startLand(next);
    else if (!S.week.finale) startFinale();
    else if (goldWaiting()) go('hatch', { gold: true });
    else go('map');
  });
  $('#newFriends').addEventListener('click', function(){ sfx.play('tap'); go('base', { meet: true }); });
  $('#btnMap').addEventListener('click', function(){ sfx.play('tap'); go('map'); });
  $('#btnBase').addEventListener('click', function(){ sfx.play('tap'); go('base'); });
  $('#btnDress').addEventListener('click', function(){ sfx.play('tap'); go('dress'); });
  $('#btnGrownups').addEventListener('click', function(){ sfx.play('tap'); go('pass'); });

  /* ============================================================
     ISLAND MAP
     ============================================================ */
  ENTER.map = function(){
    var map = $('#map'); map.innerHTML = '';
    var n = S.words.length, next = C.nextLand(S.week, n);
    applyLand(landOf(next === -1 ? 0 : next));
    var leader = C.memberInfo(S, S.roster[0]);
    S.words.forEach(function(w, i){
      var p = landOf(i), done = S.week.done.indexOf(i) !== -1;
      var node = el('div', 'map-node' + (done ? ' done' : '') + (i === next ? ' next' : ''));
      var b = el('button', 'spot-btn'); b.type = 'button';
      b.setAttribute('aria-label', 'Stop ' + (i + 1) + ': ' + w.toLowerCase());
      ['ground', 'rim', 'rock', 'glow'].forEach(function(k){ b.style.setProperty('--' + k, p[k]); });
      b.appendChild(el('span', 'spot-ico', p.icon));
      if (done && S.week.eggs[i] != null){
        var badge = el('span', 'done-badge'); var bb = el('span', 'baby'); bb.innerHTML = babyArt(babyBySeed(S.week.eggs[i])); badge.appendChild(bb); b.appendChild(badge);
      }
      /* the crew leader waits at the next stop */
      if (i === next && leader){ var r = el('span', 'map-here'); r.innerHTML = memberArt(leader); b.appendChild(r); }
      b.addEventListener('click', function(){ sfx.play('tap'); startLand(i); });
      node.appendChild(b);
      var lab = el('div', 'map-label');
      lab.appendChild(el('span', 'map-word', w.toLowerCase()));
      lab.appendChild(el('span', 'map-land', p.name + (done ? ' ✓' : '')));
      node.appendChild(lab);
      map.appendChild(node);
    });
    if (n){
      var fin = el('div', 'map-node map-finale' + (next === -1 && !S.week.finale ? ' next' : '') + (next !== -1 ? ' locked' : ''));
      var fb = el('button', 'spot-btn'); fb.type = 'button'; fb.setAttribute('aria-label', 'The Grumpy Volcano');
      fb.innerHTML = '<span class="map-boss">' + BOSS_SVG + '</span>';
      fb.addEventListener('click', function(){
        sfx.play('tap');
        if (next !== -1){ toast('Visit every stop first!'); return; }
        if (goldWaiting()){ go('hatch', { gold: true }); return; }
        startFinale();
      });
      fin.appendChild(fb);
      var fl = el('div', 'map-label');
      fl.appendChild(el('span', 'map-word', 'Grumpy Volcano'));
      fl.appendChild(el('span', 'map-land', S.week.finale ? 'Calmed down ✓' : 'Boss battle'));
      fin.appendChild(fl);
      map.appendChild(fin);
    }
    noBuddies();
  };

  /* ============================================================
     TREK — off across the island to the next stop
     ============================================================ */
  var P = null;   /* the stop (or the review) being played */
  function startLand(i){
    var w = S.words[i];
    var stat = C.normalizeStat(S.stats[w], w);
    P = { review: false, i: i, word: w, land: landOf(i), stat: stat, acts: C.activitiesFor(stat.level, stat, w), step: 0 };
    /* the egg he will warm here is chosen now, so the nest shows its colours */
    var egg = freshEgg();
    P.eggSeed = egg.seed; P.baby = egg.baby;
    go('trek');
  }
  /* a new baby, with a name nobody else in his base has */
  function freshEgg(){
    var taken = {};
    C.allMembers(S).forEach(function(m){ taken[m.name] = 1; });
    var seed, baby, tries = 0;
    do {
      seed = ((Date.now() & 0x7fffffff) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
      baby = C.makeBaby(seed, C.BABY_GEN);
    } while (taken[baby.name] && ++tries < 60);
    return { seed: seed, baby: baby };
  }
  ENTER.trek = function(){
    var p = P.review ? { name: 'the Grumpy Volcano' } : P.land;
    var lead = C.memberInfo(S, C.pickLead(S.leadHistory, null, S.roster));
    $('#trekDino').innerHTML = lead ? memberArt(lead) : '';
    $('#trekText').textContent = 'Off to ' + p.name + '…';
    if (!P.review) applyLand(P.land);
    noBuddies();
    sfx.play('march');
    later(function(){ speech.say('Next stop: ' + p.name + '!', { rate: 0.95 }); }, 200);
    later(function(){ go('play'); }, params.has('fast') ? 300 : 2300);
  };

  /* ============================================================
     PLAY — one stop's activities in order
     ============================================================ */
  function renderSteps(){
    var box = $('#steps'); box.innerHTML = '';
    var n = P.review ? P.list.length : P.acts.length;
    for (var k = 0; k < n; k++){
      var i = el('i', k < P.step ? 'done' : (k === P.step ? 'now' : ''), k < P.step ? '✓' : (P.review ? '🌋' : ACT_ICON[P.acts[k]]));
      box.appendChild(i);
    }
    $('#landTag').textContent = P.review ? 'Grumpy Volcano' : P.land.name;
  }
  /* ---------------- the Grumpy Volcano ---------------- */
  var BOSS_SVG = '<svg viewBox="0 0 140 120" aria-hidden="true">' +
    '<path d="M70 4 q10 -10 18 0 q12 -6 14 8" fill="none" stroke="#D6DEEA" stroke-width="6" stroke-linecap="round" opacity=".8"/>' +
    '<path d="M6 116 L50 22 Q58 16 70 18 Q82 16 90 22 L134 116 Z" fill="#8C5A3A" stroke="#3A1A0A" stroke-width="5" stroke-linejoin="round"/>' +
    '<path d="M50 22 Q70 32 90 22 L86 30 Q78 44 74 36 Q70 50 64 36 Q60 44 54 30 Z" fill="#FF6A1F" stroke="#3A1A0A" stroke-width="4" stroke-linejoin="round"/>' +
    '<path d="M24 100 q12 -8 20 2 M104 98 q10 -8 16 2" stroke="#6B3E22" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    '<path class="brow-grump" d="M44 58 L62 66 M96 58 L78 66" stroke="#3A1A0A" stroke-width="6" stroke-linecap="round"/>' +
    '<circle cx="56" cy="74" r="9" fill="#fff" stroke="#3A1A0A" stroke-width="3"/><circle cx="84" cy="74" r="9" fill="#fff" stroke="#3A1A0A" stroke-width="3"/>' +
    '<circle cx="57" cy="75" r="4.5" fill="#14213D"/><circle cx="83" cy="75" r="4.5" fill="#14213D"/>' +
    '<path class="mouth-grump" d="M56 100 Q70 90 84 100" fill="none" stroke="#3A1A0A" stroke-width="5" stroke-linecap="round"/>' +
    '<path class="mouth-happy" d="M54 94 Q70 110 86 94" fill="#FF8A80" stroke="#3A1A0A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function drawBoss(){
    var old = $('#bossBar'); if (old) old.remove();
    if (!P || !P.review) return;
    var b = el('div', 'boss'); b.id = 'bossBar';
    var hp = 1 - P.hits / P.list.length;
    b.innerHTML = '<div class="boss-face">' + BOSS_SVG + '</div><div class="boss-info"><span class="boss-name">The Grumpy Volcano</span>' +
      '<span class="boss-hp" title="grumpiness"><i style="width:' + Math.round(hp * 100) + '%"></i></span></div>';
    $('#playCard').insertBefore(b, $('#activity'));
  }
  /* a roar wave from the crew rolls up to the volcano, and it gets less grumpy */
  function roarWave(to){
    var from = { x: window.innerWidth / 2, y: groundY() - 60 };
    for (var k = 0; k < 3; k++){
      (function(k){
        var r = el('div', 'roar-ring'); document.body.appendChild(r);
        r.style.left = from.x + 'px'; r.style.top = from.y + 'px'; r.style.width = r.style.height = '40px';
        try { r.animate([
          { left: from.x + 'px', top: from.y + 'px', width: '40px', height: '40px', opacity: 0.9 },
          { left: to.x + 'px', top: to.y + 'px', width: '160px', height: '160px', opacity: 0 }
        ], { duration: 700, delay: k * 120, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'both' }); } catch (e){}
        later(function(){ r.remove(); }, 900 + k * 120);
      })(k);
    }
  }
  function hitBoss(){
    return new Promise(function(resolve){
      var b = $('#bossBar');
      if (!b){ resolve(); return; }
      P.hits++;
      var face = $('.boss-face', b).getBoundingClientRect();
      sfx.play('bigroar');
      env.react('cheer');
      roarWave({ x: face.left + face.width / 2, y: face.top + face.height / 2 });
      later(function(){
        sfx.play('boom');
        b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit');
        var hp = 1 - P.hits / P.list.length;
        $('.boss-hp i', b).style.width = Math.round(hp * 100) + '%';
        b.classList.toggle('calmer', hp <= 0.5);
        if (P.hits < P.list.length) speech.say(pick('calmer', CALMER), { rate: 0.95 });
        if (P.hits >= P.list.length){
          b.classList.add('happy'); sfx.play('fanfare'); confetti();
          /* all calm, and with a happy puff it pops out a golden egg */
          var egg = el('div', 'gold-pop'); document.body.appendChild(egg);
          var fx = face.left + face.width / 2, fy = face.top;
          try { egg.animate([
            { transform: 'translate(' + (fx - 35) + 'px,' + (fy - 20) + 'px) scale(.2)', opacity: 1 },
            { transform: 'translate(' + (fx - 35) + 'px,' + (fy - 140) + 'px) scale(1.1) rotate(-12deg)', opacity: 1, offset: 0.45 },
            { transform: 'translate(' + (window.innerWidth / 2 - 35) + 'px,' + (window.innerHeight * 0.35) + 'px) scale(1.4) rotate(8deg)', opacity: 1 }
          ], { duration: 1500, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' }); } catch (e){}
          sfx.play('sparkle');
          later(function(){ speech.say('The volcano is happy now! It gave you a golden egg!', { rate: 0.95, keep: true }); }, 300);
          later(function(){ egg.remove(); }, 3400);
          later(resolve, 3400);
          return;
        }
        later(resolve, 500);
      }, 650);
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
          return countdownRoar().then(function(){ if (st === stepTok) return perform(res.slots); });
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

  /* 3, 2, 1 — ROAR! The whole crew roars, the island shakes, and the warm
     egg jumps in its nest: it is ready to hatch once the crew is done */
  function countdownRoar(){
    return new Promise(function(resolve){
      var st = stepTok;
      var card = $('#playCard');
      var cd = el('div', 'countdown'); card.appendChild(cd);
      var n = 3;
      function tick(){
        if (st !== stepTok){ cd.remove(); resolve(); return; }
        if (n > 0){ cd.innerHTML = '<span>' + n + '</span>'; sfx.play('countdown'); speech.say(String(n), { dedupeMs: 0, rate: 1 }); n--; later(tick, 750); return; }
        cd.innerHTML = '<span class="roar">ROAR!</span>';
        sfx.play('bigroar');
        speech.say('Roar!', { dedupeMs: 0, rate: 1 });
        document.body.classList.remove('quake'); void document.body.offsetWidth; document.body.classList.add('quake');
        env.react('cheer');
        var nest = $('.activity .nest-egg');
        if (nest){
          var r = nest.getBoundingClientRect();
          roarRing(r.left + r.width / 2, r.top + r.height / 2);
          try { nest.animate([{ transform: 'none' }, { transform: 'translateY(-26px) scale(1.25) rotate(-10deg)' }, { transform: 'translateY(0) scale(1.1) rotate(8deg)' }, { transform: 'none' }], { duration: 900, easing: 'ease-out' }); } catch (e){}
        }
        later(function(){ document.body.classList.remove('quake'); cd.remove(); resolve(); }, 1400);
      }
      tick();
    });
  }
  function roarRing(x, y){
    var r = el('div', 'roar-ring'); document.body.appendChild(r);
    r.style.left = x + 'px'; r.style.top = y + 'px';
    try { r.animate([{ width: '20px', height: '20px', opacity: 1 }, { width: '420px', height: '420px', opacity: 0 }], { duration: 900, easing: 'ease-out', fill: 'forwards' }); } catch (e){}
    later(function(){ r.remove(); }, 950);
  }
  $('#btnPlayBack').addEventListener('click', function(){ sfx.play('tap'); go(P && P.review ? 'home' : 'map'); });

  /* ============================================================
     EGG HATCH — the reward is a new friend
     ============================================================ */
  var hatchState = null;
  /* the egg he warmed at this stop — or, after the volcano, the golden egg */
  ENTER.hatch = function(arg){
    var gold = !!(arg && arg.gold);
    var seed, baby;
    if (gold){
      if (S.week.goldSeed == null){ S.week.goldSeed = goldSeedFor(); save(); }
      seed = S.week.goldSeed; baby = C.makeBaby(seed, C.BABY_GEN, true);
    } else {
      if (!P || !P.baby){ var fe = freshEgg(); P = P || { review: true }; P.eggSeed = fe.seed; P.baby = fe.baby; }
      seed = P.eggSeed; baby = P.baby;
    }
    hatchState = { seed: seed, baby: baby, taps: 0, open: false, gold: gold, after: arg && arg.after };
    var egg = $('#egg');
    egg.className = 'egg' + (gold ? ' gold' : ''); egg.innerHTML = '<svg class="crack" viewBox="0 0 100 128" aria-hidden="true"></svg>';
    egg.style.setProperty('--egg', gold ? '#FFD23F' : shade(baby.body, 0.55)); egg.style.setProperty('--spot', gold ? '#FFFFFF' : baby.body);
    egg.hidden = false;
    $('#babyReveal').hidden = true; $('#babyName').hidden = true; $('#btnHatchNext').hidden = true;
    $('#babyPower').hidden = true; $('#btnHatchCrew').hidden = true; $('#hatchFossil').hidden = true;
    $('#hatchHint').hidden = false; $('#hatchHint').textContent = 'Tap the egg!';
    $('#hatchTitle').textContent = gold ? 'The golden egg!' : 'A surprise!';
    if (gold) applyLand(C.LANDS[1]);
    buddies(S.roster.slice(), true, true);
    later(function(){ speech.say(gold ? 'The golden egg is hatching! Tap it!' : 'Something is hatching! Tap the egg!', { rate: 0.95 }); }, 400);
    setNudge(function(){ if (!hatchState.open){ wobble(); speech.say('Tap the egg!', { dedupeMs: 0 }); } });
  };
  /* a golden baby with a name nobody else has */
  function goldSeedFor(){
    var taken = {}, seed, tries = 0;
    C.allMembers(S).forEach(function(m){ taken[m.name] = 1; });
    do { seed = ((Date.now() & 0x7fffffff) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0; } while (taken[C.makeBaby(seed, C.BABY_GEN, true).name] && ++tries < 60);
    return seed;
  }
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
    if (h.gold) sfx.play('sparkle');
    /* remember it: in the base for good, and at this stop on the map */
    var rec = { seed: h.seed, at: Date.now(), gen: C.BABY_GEN };
    if (h.gold) rec.gold = true;
    S.babies.push(rec);
    var dug = 0;
    if (h.gold) S.week.goldHatched = true;
    else if (!P.review){
      if (S.week.done.indexOf(P.i) === -1){ S.week.done.push(P.i); dug = C.FOSSIL_LAND; S.fossils += dug; }
      S.week.eggs[P.i] = h.seed;
    }
    /* the whole crew grows a little with every stop */
    var ap = C.awardLand(S.crew, S.roster);
    S.crew = ap.crew;
    save();
    later(function(){
      egg.hidden = true;
      var rv = $('#babyReveal'); rv.innerHTML = babyArt(h.baby); rv.hidden = false;
      var nm = $('#babyName'); nm.innerHTML = 'Meet ' + h.baby.name + '!<small>a ' + (h.gold ? 'golden ' : '') + 'baby ' + speciesName(h.baby.kind) + '</small>';
      nm.hidden = false;
      $('#hatchHint').hidden = true;
      $('#hatchTitle').textContent = h.gold ? 'A golden friend!' : 'A new friend!';
      confetti(); sfx.play('fanfare');
      env.react('cheer');
      var pw = C.POWERS[h.baby.power];
      var pl = $('#babyPower'); pl.textContent = 'Super power: ' + pw.icon + ' ' + pw.name; pl.hidden = false;
      if (dug){ var hf = $('#hatchFossil'); hf.textContent = '🦴 You dug up a fossil! (' + S.fossils + ')'; hf.hidden = false; }
      $('#btnHatchCrew').hidden = false;
      speech.say('Meet ' + h.baby.name + '! A ' + (h.gold ? 'golden ' : '') + 'baby ' + speciesSay(h.baby.kind) + ' who ' + pw.says + '!' + (dug ? ' And you dug up a fossil!' : ''), { rate: 0.95, keep: true });
      setTimeout(function(){ celebrate(ap.ups); }, 2400);
      var nb = $('#btnHatchNext');
      if (h.gold) nb.textContent = 'Hooray! ›';
      else nb.textContent = C.nextLand(S.week, S.words.length) !== -1 ? 'Next stop ›' : 'Volcano! ›';
      nb.hidden = false;
    }, 420);
  }
  /* a new baby wants to be tapped: a hop, a giggle and a hello */
  $('#babyReveal').addEventListener('click', function(){
    if (!hatchState || !hatchState.open) return;
    var rv = $('#babyReveal');
    sfx.play('giggle');
    try { rv.animate([{ transform: 'none' }, { transform: 'translateY(-34px) rotate(-6deg)' }, { transform: 'none' }], { duration: 480, easing: 'ease-out' }); } catch (e){}
    speech.say(pick('hello', ['Hi Grayson!', "I'm " + hatchState.baby.name + '!', 'Hee hee!', 'Roar!']), { rate: 1.05 });
  });
  $('#btnHatchCrew').addEventListener('click', function(){ sfx.play('tap'); go('base', { pick: hatchState && hatchState.baby.id }); });
  $('#btnHatchNext').addEventListener('click', function(){
    sfx.play('tap');
    if (hatchState && hatchState.gold){ go('done', hatchState.after || { fossils: 0 }); return; }
    var more = C.nextLand(S.week, S.words.length);
    if (more !== -1) startLand(more); else startFinale();
  });

  /* ============================================================
     THE GRUMPY VOLCANO — the spaced, from-memory review, as a boss battle
     ============================================================ */
  function startFinale(){
    var list = C.reviewQueue(S.words, S.stats, Math.min(4, S.words.length));
    P = { review: true, list: list, step: 0, stat: null, acts: [], hits: 0 };
    go('trek');
  }
  /* calming the volcano the first time this week digs up three fossils and
     wins the golden egg, which hatches after the Victory Show */
  function finishFinale(){
    var first = !S.week.finale;
    S.week.finale = true;
    if (first){ S.fossils += C.FOSSIL_BOSS; S.week.goldSeed = goldSeedFor(); S.week.goldHatched = false; }
    save();
    go('show', { fossils: first ? C.FOSSIL_BOSS : 0 });
  }
  /* after the show: the golden egg if there is one waiting, else the end */
  function afterShow(arg){ if (goldWaiting()) go('hatch', { gold: true, after: arg }); else go('done', arg); }

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
    applyLand(landOf(S.week.offset + 3));
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
          stage.play(plan, slots, { layer: $('#fxLayer'), groundY: groundY(), dust: currentLand ? currentLand.rim : null }).then(function(){
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
      later(function(){ afterShow(showArg); }, 5600);
    }
    later(function(){ act(0); }, 1800);
  };
  $('#btnSkipShow').addEventListener('click', function(){ sfx.play('tap'); afterShow(showArg); });

  /* ============================================================
     MISSION COMPLETE
     ============================================================ */
  ENTER.done = function(arg){
    var df = $('#doneFossil');
    df.hidden = !(arg && arg.fossils);
    if (arg && arg.fossils){
      var nx = C.nextGear(S.fossils);
      df.innerHTML = '<span class="pt">🦴</span><span>You dug up ' + arg.fossils + ' fossils!' + (nx ? ' ' + (nx.fossils - S.fossils) + ' more for the ' + nx.name + '.' : ' You have every hat!') + '</span>';
      later(function(){ speech.say('You calmed the volcano and dug up ' + arg.fossils + ' fossils! Go to Dress Up to try on hats!', { rate: 0.95 }); }, 3200);
    }
    $('#doneLine').textContent = 'You spelled all ' + S.words.length + ' word' + (S.words.length === 1 ? '' : 's') + ' and hatched ' + (S.week.done.length + (S.week.goldHatched ? 1 : 0)) + ' baby dino' + (S.week.done.length + (S.week.goldHatched ? 1 : 0) === 1 ? '' : 's') + '!';
    var box = $('#doneWords'); box.innerHTML = '';
    S.words.forEach(function(w){ box.appendChild(el('span', null, w.toLowerCase())); });
    applyLand(landOf(0));
    confetti(); sfx.play('fanfare');
    buddies(S.roster.slice(), true, true);
    later(function(){ env.react('cheer'); }, 800);
    later(function(){ speech.say('Adventure complete! Amazing work, Grayson!', { rate: 0.92 }); }, 500);
    var again = function(){ env.react('cheer'); later(again, 4200); };
    later(again, 4200);
  };
  /* ============================================================
     DRESS UP — hats and gear for any dino, unlocked by fossils
     ============================================================ */
  var dressWho = null;
  ENTER.dress = function(){
    noBuddies();
    applyLand(C.LANDS[2]);
    var everyone = C.allMembers(S);
    if (!dressWho || !everyone.some(function(m){ return m.id === dressWho; })) dressWho = S.roster[0];
    var have = C.gearUnlocked(S.fossils), nx = C.nextGear(S.fossils);
    $('#dressFossils').textContent = '🦴 ' + S.fossils;
    $('#dressNote').textContent = nx ? 'Dig up fossils on the island to unlock more! ' + (nx.fossils - S.fossils) + ' more for the ' + nx.name + '.' : 'You have every hat! Amazing!';
    /* who is getting dressed: the crew first, then everyone else */
    var whoBox = $('#dressWho'); whoBox.innerHTML = '';
    var order = S.roster.slice().concat(everyone.map(function(m){ return m.id; }).filter(function(id){ return S.roster.indexOf(id) === -1; }));
    order.forEach(function(id){
      var m = C.memberInfo(S, id);
      var b = el('button', 'who' + (id === dressWho ? ' on' : '')); b.type = 'button'; b.setAttribute('data-id', id);
      b.innerHTML = memberArt(m) + '<span>' + m.name + '</span>';
      b.setAttribute('aria-label', m.name);
      b.addEventListener('click', function(){ sfx.play('tap'); dressWho = id; speech.say(m.name + '!', { rate: 1 }); ENTER.dress(); });
      whoBox.appendChild(b);
    });
    var me = C.memberInfo(S, dressWho);
    $('#dressModel').innerHTML = memberArt(me);
    var hats = $('#hats'); hats.innerHTML = '';
    [{ id: null, name: 'No hat', fossils: 0 }].concat(C.GEAR).forEach(function(g){
      var open = g.id == null || have.indexOf(g.id) !== -1;
      var on = (me.hat || null) === g.id;
      var b = el('button', 'hat-btn' + (on ? ' on' : '') + (open ? '' : ' locked') + (g.id ? '' : ' none')); b.type = 'button';
      b.setAttribute('data-hat', g.id || 'none');
      var look = {}; Object.keys(me).forEach(function(k){ look[k] = me[k]; }); look.hat = g.id;
      b.innerHTML = memberArt(look) + '<span class="hn">' + g.name + '</span>' + (open ? '' : '<span class="need">🦴 ' + g.fossils + '</span>');
      b.setAttribute('aria-label', g.name + (open ? '' : ', locked'));
      b.addEventListener('click', function(){
        if (!open){ sfx.play('wrong'); speech.say('You need ' + g.fossils + ' fossils for the ' + g.name + '.', { rate: 0.95 }); return; }
        if (g.id) S.gear[dressWho] = g.id; else delete S.gear[dressWho];
        save(); syncCast(); sfx.play('powerup');
        speech.say(g.id ? me.name + ' has a ' + g.name + '!' : me.name + ' took off the hat.', { rate: 0.95 });
        ENTER.dress();
        var dm = $('#dressModel'); dm.classList.remove('pop'); void dm.offsetWidth; dm.classList.add('pop');
      });
      hats.appendChild(b);
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
  function showInfo(m){
    var box = $('#crewInfo');
    if (!m){ box.innerHTML = '<span>Every stop on the island makes your crew stronger!</span>'; return; }
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
    applyLand(C.LANDS[0]);
    var meeting = !S.metNew;
    if (meeting){ S.metNew = true; save(); }
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
      var node = el('button', 'baby' + (m.id === picked ? ' picked' : '') + (meeting && (m.id === 'brachio' || m.id === 'stego') ? ' new-one' : '')); node.type = 'button';
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
        /* the name tag must not read backwards when he faces left */
        o.node.style.setProperty('--face', o.face);
      });
      baseLoop = requestAnimationFrame(frame);
    }
    if (babies.length) baseLoop = requestAnimationFrame(frame);
    if (!arg || !arg.quiet){
      later(function(){
        if (picked){ var pm = C.memberInfo(S, picked); speech.say('Tap a crew spot to put ' + pm.name + ' in your crew!', { rate: 0.95 }); return; }
        if (meeting){ speech.say('Meet Stretch the brachiosaurus and Spike the stegosaurus! Tap one, then a crew spot, to put them in your crew.', { rate: 0.95 }); return; }
        speech.say(list.length ? 'Welcome to Dino Base! Pick your crew of four.' : 'Finish a stop on the island to hatch your first baby dino!', { rate: 0.95 });
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
  $('#btnSavePlay').addEventListener('click', function(){ if (!S.words.length) return; save(); startLand(C.nextLand(S.week, S.words.length) === -1 ? 0 : C.nextLand(S.week, S.words.length)); });
  var crewArmed = false;
  $('#btnResetCrew').addEventListener('click', function(){
    if (!crewArmed){ crewArmed = true; $('#btnResetCrew').textContent = 'Tap again: all back to level 1'; setTimeout(function(){ crewArmed = false; $('#btnResetCrew').textContent = 'Crew back to level 1'; }, 4000); return; }
    crewArmed = false; S.crew = {}; save(); syncCast();
    $('#btnResetCrew').textContent = 'Crew back to level 1';
    toast('Every dino is back to level 1.');
  });
  $('#btnResetWeek').addEventListener('click', function(){ S.week.done = []; S.week.eggs = {}; S.week.finale = false; S.week.goldSeed = null; S.week.goldHatched = false; save(); toast('Adventure restarted — the island is waiting!'); });
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
    state: function(){ return { screen: screen, land: P && P.i, word: P && (P.review ? P.list[P.step] : P.word), step: P && P.step, acts: P && (P.review ? P.list.map(function(){ return 'blast'; }) : P.acts), review: P && P.review, baby: P && P.baby ? P.baby.id : null }; },
    go: go, startLand: startLand,
    /* jump the current stop to step k, optionally swapping in another activity */
    jump: function(k, act){ if (!P || screen !== 'play') return; if (act && !P.review) P.acts[k] = act; P.step = k; runStep(); }
  };

  go('home');
})();
