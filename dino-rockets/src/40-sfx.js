/* ============================================================
   SOUND — every effect synthesised with WebAudio (one offline file, so
   nowhere for an mp3 to live), plus a soft space-groove music loop.

   Rules: never throw when WebAudio is missing; never talk over the spoken
   letters (the effects bus sits under the voice, and the music ducks
   right down whenever speech is playing); a grown-up can switch each off.
   ============================================================ */
function createSfx(){
  var ctx = null, master = null, musicBus = null, noiseBuf = null;
  var ok = true, muted = false, musicOn = false, musicWanted = false, ducked = false, lastAt = {};
  var seqTimer = null, seqStep = 0, nextNoteAt = 0;

  try { ok = !!(window.AudioContext || window.webkitAudioContext); } catch (e){ ok = false; }

  function boot(){
    if (!ok || ctx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.3; master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.8), ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e){ ok = false; ctx = null; }
  }
  function unlock(){
    boot();
    if (ctx && ctx.state === 'suspended'){ try { ctx.resume(); } catch (e){} }
    if (musicWanted && !musicOn) startMusic();
  }

  function noise(t, dur, f0, f1, q, gain, type, bus){
    var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    var f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(Math.max(40, f0), t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(bus || master); src.start(t); src.stop(t + dur + 0.03);
  }
  function tone(t, dur, f0, f1, gain, wave, bus){
    var o = ctx.createOscillator(); o.type = wave || 'sine';
    o.frequency.setValueAtTime(Math.max(30, f0), t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || master); o.start(t); o.stop(t + dur + 0.03);
  }
  function chord(t, notes, dur, gain, wave){ notes.forEach(function(n, i){ tone(t + i * 0.07, dur, n, n, gain, wave || 'triangle'); }); }

  var V = {
    /* the crew */
    jet:      function(t){ noise(t, .55, 250, 1100, .7, .28, 'lowpass'); tone(t, .45, 90, 170, .08, 'sawtooth'); },
    flap:     function(t){ for (var i = 0; i < 3; i++) noise(t + i * .12, .1, 700, 300, 1.2, .16); },
    zoom:     function(t){ noise(t, .4, 600, 3000, .9, .24); tone(t, .35, 300, 900, .08, 'sawtooth'); },
    roar:     function(t){ noise(t, .9, 900, 180, .9, .32, 'lowpass'); tone(t, .8, 110, 70, .22, 'sawtooth'); tone(t + .05, .7, 165, 100, .12, 'square'); },
    roarsmall:function(t){ noise(t, .5, 800, 250, 1, .2, 'lowpass'); tone(t, .45, 140, 90, .12, 'sawtooth'); },
    chomp:    function(t){ tone(t, .07, 300, 120, .2, 'square'); noise(t, .06, 1800, 900, 2, .12); },
    whack:    function(t){ noise(t, .12, 2600, 700, 1.5, .26); tone(t, .18, 700, 180, .18, 'triangle'); },
    strain:   function(t){ tone(t, .5, 130, 100, .12, 'sawtooth'); },
    beep:     function(t){ for (var i = 0; i < 3; i++) tone(t + i * .22, .12, 980, 980, .09, 'square'); },
    dig:      function(t){ for (var i = 0; i < 4; i++) noise(t + i * .09, .08, 500, 200, 1.4, .2, 'lowpass'); },
    twang:    function(t){ tone(t, .5, 180, 150, .16, 'triangle'); tone(t, .35, 360, 300, .06, 'sawtooth'); },
    bubble:   function(t){ tone(t, .18, 400, 900, .12, 'sine'); tone(t + .08, .14, 600, 1200, .08, 'sine'); },
    hum:      function(t){ tone(t, .6, 120, 124, .1, 'sawtooth'); tone(t, .6, 240, 244, .05, 'square'); },
    snort:    function(t){ noise(t, .22, 500, 180, 1.5, .24); noise(t + .28, .18, 500, 200, 1.5, .2); },
    stomp:    function(t){ tone(t, .2, 90, 40, .3, 'sine'); noise(t, .2, 400, 120, 1, .2, 'lowpass'); },
    boom:     function(t){ tone(t, .5, 80, 30, .45, 'sine'); noise(t, .5, 600, 80, .7, .32, 'lowpass'); },
    charge:   function(t){ for (var i = 0; i < 6; i++) tone(t + i * .11, .1, 90, 55, .2, 'sine'); noise(t, .7, 400, 1200, .8, .12); },
    scoop:    function(t){ tone(t, .14, 400, 900, .14, 'triangle'); },
    catch:    function(t){ tone(t, .12, 700, 1150, .16, 'square'); },
    pickup:   function(t){ tone(t, .1, 520, 820, .14, 'triangle'); },
    skid:     function(t){ noise(t, .4, 3000, 1200, 4, .2); },
    whoosh:   function(t){ noise(t, .35, 500, 2600, .9, .2); },
    huh:      function(t){ tone(t, .18, 300, 520, .14, 'triangle'); },
    spin:     function(t){ for (var i = 0; i < 5; i++) noise(t + i * .16, .2, 700 + i * 200, 1800 + i * 200, 1.2, .16); },
    dive:     function(t){ tone(t, .5, 1400, 300, .14, 'sine'); noise(t, .5, 800, 2500, .9, .14); },
    loop:     function(t){ tone(t, .8, 400, 900, .1, 'sine'); tone(t + .3, .5, 900, 500, .08, 'sine'); },
    glide:    function(t){ noise(t, 1, 400, 900, .5, .12); },
    boing:    function(t){ tone(t, .24, 180, 560, .15, 'sine'); },
    toss:     function(t){ tone(t, .2, 300, 700, .12, 'triangle'); },
    pop:      function(t){ tone(t, .09, 900, 240, .22, 'square'); noise(t, .14, 2200, 600, 1.6, .14); },
    thud:     function(t){ tone(t, .25, 120, 50, .3, 'sine'); noise(t, .2, 900, 200, 1, .16); },
    dust:     function(t){ noise(t, .26, 1600, 900, 1.2, .1); },
    bonk:     function(t){ tone(t, .1, 380, 150, .16, 'triangle'); },
    cheer:    function(t){ tone(t, .12, 520, 700, .13, 'triangle'); tone(t + .1, .16, 700, 1040, .13, 'triangle'); },
    giggle:   function(t){ for (var i = 0; i < 4; i++) tone(t + i * .075, .06, 880 - i * 60, 1100 - i * 70, .1, 'triangle'); },
    whistle:  function(t){ tone(t, .14, 1500, 1900, .1); tone(t + .18, .22, 1500, 2100, .1); },
    march:    function(t){ for (var i = 0; i < 4; i++) tone(t + i * .2, .06, 200, 180, .12, 'square'); },
    ship:     function(t){ tone(t, 1, 200, 420, .1, 'sine'); tone(t, 1, 300, 630, .06, 'triangle'); },
    beam:     function(t){ tone(t, .5, 600, 1400, .08, 'sine'); tone(t, .5, 900, 2100, .05, 'sine'); },
    blastoff: function(t){ noise(t, 1.4, 200, 2000, .6, .3, 'lowpass'); tone(t, 1.2, 80, 300, .15, 'sawtooth'); },

    /* the game */
    tap:      function(t){ tone(t, .05, 660, 720, .09, 'triangle'); },
    place:    function(t){ tone(t, .08, 520, 900, .14, 'triangle'); noise(t, .05, 3000, 2000, 2, .05); },
    correct:  function(t){ chord(t, [660, 880, 1320], .2, .13); },
    wrong:    function(t){ tone(t, .16, 260, 200, .13, 'triangle'); tone(t + .14, .2, 220, 170, .11, 'triangle'); },
    zap:      function(t){ tone(t, .18, 1600, 200, .16, 'square'); noise(t, .2, 3000, 800, 1.2, .12); },
    explode:  function(t){ noise(t, .5, 1200, 100, .6, .3, 'lowpass'); tone(t, .3, 200, 50, .2, 'sine'); },
    countdown:function(t){ tone(t, .14, 880, 880, .14, 'square'); },
    go:       function(t){ tone(t, .4, 1320, 1320, .16, 'square'); },
    crack:    function(t){ noise(t, .08, 3000, 1500, 3, .22); tone(t, .05, 1200, 800, .1, 'triangle'); },
    hatch:    function(t){ chord(t, [523, 659, 784, 1047], .3, .13); noise(t, .2, 3000, 1500, 2, .1); },
    powerup:  function(t){ for (var i = 0; i < 6; i++) tone(t + i * .06, .08, 400 + i * 120, 500 + i * 140, .1, 'square'); },
    warp:     function(t){ tone(t, 1.1, 120, 1400, .12, 'sawtooth'); noise(t, 1.1, 300, 4000, .8, .14); },
    fanfare:  function(t){ var n = [523, 659, 784, 1047, 784, 1047]; n.forEach(function(f, i){ tone(t + i * .13, i === n.length - 1 ? .5 : .14, f, f, .14, 'triangle'); }); }
  };

  function play(name){
    if (muted || !ok) return;
    boot();
    if (!ctx) return;
    var v = V[name];
    if (!v) return;
    var now = Date.now();
    if (lastAt[name] && now - lastAt[name] < 70) return;
    lastAt[name] = now;
    try { v(ctx.currentTime + 0.005); } catch (e){}
  }

  /* ---------- music: a gentle loop in C major pentatonic ---------- */
  var BASS = [130.8, 130.8, 174.6, 196.0];
  var MEL = [523, 587, 659, 784, 880, 784, 659, 587, 523, 659, 784, 1047, 880, 784, 659, 587];
  function schedule(){
    if (!ctx || !musicOn) return;
    var step = 60 / 104 / 2;                     /* eighth notes at 104 bpm */
    while (nextNoteAt < ctx.currentTime + 0.25){
      var i = seqStep % 32;
      if (i % 8 === 0) tone(nextNoteAt, step * 7, BASS[(seqStep / 8 | 0) % 4], BASS[(seqStep / 8 | 0) % 4], 0.10, 'triangle', musicBus);
      if (i % 2 === 0 && Math.random() < 0.8){
        var f = MEL[(i / 2 + (seqStep / 32 | 0) * 3) % MEL.length];
        tone(nextNoteAt, step * 1.6, f, f, 0.045, 'sine', musicBus);
      }
      if (i % 4 === 2) noise(nextNoteAt, 0.05, 7000, 5000, 1, 0.012, 'highpass', musicBus);
      nextNoteAt += step; seqStep++;
    }
  }
  function startMusic(){
    musicWanted = true;
    if (!ok || muted) return;
    boot();
    if (!ctx || musicOn || ctx.state !== 'running') return;
    musicOn = true;
    nextNoteAt = ctx.currentTime + 0.1;
    musicBus.gain.setTargetAtTime(ducked ? 0.05 : 0.5, ctx.currentTime, 0.4);
    seqTimer = setInterval(schedule, 100);
  }
  function stopMusic(){
    musicWanted = false;
    if (!musicOn) return;
    musicOn = false;
    clearInterval(seqTimer); seqTimer = null;
    try { musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.2); } catch (e){}
  }
  /* the voice always wins: the music drops right down while anything is said */
  function duck(on){
    ducked = !!on;
    if (musicBus && ctx) try { musicBus.gain.setTargetAtTime(musicOn ? (ducked ? 0.05 : 0.5) : 0, ctx.currentTime, 0.12); } catch (e){}
  }

  return {
    play: play, unlock: unlock, startMusic: startMusic, stopMusic: stopMusic, duck: duck,
    setMuted: function(m){ muted = !!m; if (muted){ var w = musicWanted; stopMusic(); musicWanted = w; } },
    isMuted: function(){ return muted; }, available: function(){ return ok; },
    has: function(name){ return !!V[name]; }, musicPlaying: function(){ return musicOn; }
  };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { createSfx: createSfx };
