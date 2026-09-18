/* ============================================================
   SFX — synthesised, because the whole game is one HTML file with no
   network after first load, so there is nowhere for an .mp3 to live.

   Three rules this must never break: it must not throw if WebAudio is
   missing, it must never talk over the spoken letters (the letters are the
   point, so the bus sits well under them), and a grown-up must be able to
   switch it off.
   ============================================================ */
function createSfx(){
  var ctx = null, master = null, noiseBuf = null;
  var ok = true, muted = false, lastAt = {};

  try { ok = !!(window.AudioContext || window.webkitAudioContext); } catch (e){ ok = false; }

  function boot(){
    if (!ok || ctx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.26;          /* sits under the voice, never over it */
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.8), ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e){ ok = false; ctx = null; }
  }

  /* iOS will not make a sound until a real gesture has happened. */
  function unlock(){
    boot();
    if (ctx && ctx.state === 'suspended'){ try { ctx.resume(); } catch (e){} }
  }

  function noise(t, dur, f0, f1, q, gain, type){
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    var bp = ctx.createBiquadFilter();
    bp.type = type || 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueAtTime(Math.max(40, f0), t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.16);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.03);
  }

  function tone(t, dur, f0, f1, gain, wave){
    var o = ctx.createOscillator();
    o.type = wave || 'sine';
    o.frequency.setValueAtTime(Math.max(30, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.03);
  }

  /* One voice per physical event, so sound and movement stay welded. */
  var VOICES = {
    thrust:   function(t){ noise(t, .55, 220, 900, .7, .30, 'lowpass'); tone(t, .5, 90, 160, .10, 'sawtooth'); },
    brake:    function(t){ noise(t, .38, 1800, 300, 1.6, .24); tone(t, .3, 300, 90, .12, 'sawtooth'); },
    roll:     function(t){ noise(t, .70, 900, 520, 1.1, .16); },
    grind:    function(t){ noise(t, .85, 2600, 1400, 6.0, .20); tone(t, .8, 300, 240, .05, 'sawtooth'); },
    ollie:    function(t){ tone(t, .10, 240, 520, .18, 'triangle'); noise(t + .18, .12, 1200, 400, 1.4, .18); },
    steps:    function(t){ tone(t, .09, 150, 90, .16); tone(t + .15, .09, 140, 85, .14); tone(t + .3, .09, 155, 92, .12); },
    whoosh:   function(t){ noise(t, .42, 500, 2400, .9, .22); },
    cord:     function(t){ noise(t, .16, 1800, 700, 2.4, .14); },
    cordsnap: function(t){ tone(t, .12, 900, 200, .26, 'triangle'); noise(t, .18, 2600, 600, 2.0, .20); },
    yank:     function(t){ tone(t, .20, 420, 130, .20, 'triangle'); noise(t, .26, 1500, 380, 1.4, .16); },
    strain:   function(t){ tone(t, .42, 120, 96, .14, 'sawtooth'); noise(t, .4, 300, 200, 2.0, .07); },
    scoop:    function(t){ noise(t, .28, 700, 1900, 1.2, .17); tone(t, .2, 260, 480, .10, 'triangle'); },
    pickup:   function(t){ tone(t, .10, 520, 780, .15, 'triangle'); },
    catch_:   function(t){ tone(t, .12, 700, 1100, .17, 'square'); },
    stack:    function(t){ tone(t, .1, 300, 200, .16); tone(t + .12, .1, 340, 230, .15); tone(t + .24, .1, 380, 260, .14); },
    topple:   function(t){ noise(t, .5, 900, 220, 1.0, .22); tone(t + .1, .3, 200, 80, .18); },
    bonk:     function(t){ tone(t, .09, 380, 150, .16, 'triangle'); },
    pop:      function(t){ tone(t, .09, 900, 240, .22, 'square'); noise(t, .14, 2200, 600, 1.6, .13); },
    snag:     function(t){ noise(t, .14, 2200, 900, 3.0, .16); },
    fall:     function(t){ noise(t, .34, 1400, 260, 1.0, .22); tone(t + .14, .22, 180, 70, .24); },
    dust:     function(t){ noise(t, .26, 1600, 900, 1.2, .10); },
    blink:    function(t){ tone(t, .08, 620, 880, .10, 'triangle'); },
    rescue:   function(t){ noise(t, .34, 600, 2600, .9, .20); tone(t, .26, 380, 780, .12, 'triangle'); },
    'super':  function(t){ noise(t, .9, 400, 3200, .8, .26); tone(t, .8, 200, 620, .12, 'sawtooth'); }
  };

  function play(name){
    if (muted || !ok) return;
    boot();
    if (!ctx) return;
    var key = name === 'catch' ? 'catch_' : name;
    var v = VOICES[key];
    if (!v) return;
    /* don't stack the same sound on itself when beats overlap */
    var now = Date.now();
    if (lastAt[key] && now - lastAt[key] < 70) return;
    lastAt[key] = now;
    try { v(ctx.currentTime + 0.005); } catch (e){}
  }

  return {
    play: play, unlock: unlock,
    setMuted: function(m){ muted = !!m; },
    isMuted: function(){ return muted; },
    available: function(){ return ok; }
  };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { createSfx: createSfx };
