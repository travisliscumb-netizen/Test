/* ============================================================
   SPEECH — one owner, one voice, one utterance at a time.

   This module is the ONLY thing in the app permitted to touch
   speechSynthesis. That is the whole design: the repeated-letter bug in v5
   ("E E E") was not one bad call site, it was three independent paths able
   to drive the synth at once —

     1. render kickoffs on a bare setTimeout that nothing ever cancelled,
        so leaving and re-entering a screen stacked them;
     2. per-letter watchdogs that kept firing after the screen was torn
        down and went on advancing a dead chain;
     3. utterances with no identity, so a stale `onend` from an utterance
        that had already been cancelled still advanced the sequence.

   Patching the call site that said "E" would have left all three. So:

     * every utterance carries an epoch; bumping the epoch invalidates
       everything older, including callbacks already in flight;
     * every delayed speech is scheduled through `later()`, which is
       epoch-scoped, so a screen change cancels it by construction;
     * the queue holds at most ONE pending request, and a newer request
       replaces it rather than stacking behind it;
     * identical text inside a short window is dropped, which kills the
       double-fire from any duplicated event path;
     * a watchdog force-settles every utterance, so a synth that never
       fires `onend` (iOS does this) can never wedge the queue.

   Dependencies are injected so the whole thing runs under node against a
   fake synth — the rapid-tap and screen-change races are unit tests, not
   things anyone has to reproduce by hand on a phone.
   ============================================================ */
function createSpeech(deps){
  deps = deps || {};
  var synth = deps.synth || null;
  var now = deps.now || function(){ return Date.now(); };
  var setT = deps.setTimeout || function(f, ms){ return setTimeout(f, ms); };
  var clearT = deps.clearTimeout || function(id){ clearTimeout(id); };
  var mkUtt = deps.makeUtterance;
  var getVoices = deps.getVoices || function(){ return (synth && synth.getVoices && synth.getVoices()) || []; };

  var epoch = 0;          /* bumped by reset(); invalidates everything older */
  var seq = 0;            /* unique id per utterance */
  var active = null;      /* the one utterance currently owned by the synth */
  var pending = null;     /* at most one queued request */
  var starting = false;   /* guards the cancel->speak gap */
  var timers = [];        /* every epoch-scoped timer, cleared on reset */
  var lastSaid = {};      /* key -> ms, for the duplicate-path guard */
  var voice = null;
  var resumeTimer = null;
  var log = [];           /* what was actually spoken, for the tests */

  var DEDUPE_MS = 400;

  /* ---------- voice selection ---------- */
  function pickVoice(){
    var vs = getVoices();
    if (!vs || !vs.length) return;
    var prefer = ['Samantha', 'Karen', 'Moira', 'Daniel', 'Google US English', 'Alex'];
    for (var p = 0; p < prefer.length; p++){
      for (var i = 0; i < vs.length; i++){
        if (vs[i].name === prefer[p]){ voice = vs[i]; return; }
      }
    }
    for (var j = 0; j < vs.length; j++){
      if (/^en[-_]/i.test(vs[j].lang || '')){ voice = vs[j]; return; }
    }
    voice = vs[0];
  }

  /* ---------- epoch-scoped time ---------- */
  function later(fn, ms){
    var e = epoch;
    var id = setT(function(){
      if (e !== epoch) return;      /* the screen moved on: drop it */
      fn();
    }, ms);
    timers.push(id);
    return id;
  }

  function clearTimers(){
    for (var i = 0; i < timers.length; i++) clearT(timers[i]);
    timers = [];
  }

  /*
    How long an utterance could possibly take. Deliberately generous: this
    is a stall guard, not a schedule. If it fires early the worst case is
    the next letter starts while this one is still finishing; if it never
    fired at all the queue would hang forever, which is far worse.
  */
  function estimate(text, rate){
    var r = rate || 1;
    var ms = (420 + String(text).length * 82) / r;
    return Math.max(900, Math.min(7000, Math.round(ms * 2.2)));
  }

  /* ---------- the queue ---------- */
  function settleActive(ok){
    if (!active) return;
    var a = active;
    active = null;
    if (a.watchdog) clearT(a.watchdog);
    a.settle(ok);
  }

  function reallySpeak(req){
    starting = false;
    if (req.epoch !== epoch){ req.settle(false); return; }

    var mySeq = ++seq, myEpoch = epoch;
    var done = false;

    function finish(ok){
      if (done) return;
      done = true;
      if (rec.watchdog) clearT(rec.watchdog);
      if (active && active.seq === mySeq) active = null;
      req.settle(ok);
      /* only chain onward if this epoch is still the live one */
      if (myEpoch === epoch) startNext();
    }

    var rec = { seq: mySeq, epoch: myEpoch, text: req.text, settle: finish, watchdog: null };
    active = rec;

    if (!synth || !mkUtt){
      /* no speech on this browser: keep the timing shape so callers still flow */
      rec.watchdog = setT(function(){ finish(false); }, 240);
      return;
    }

    var u;
    try { u = mkUtt(req.text, { rate: req.rate, voice: voice }); }
    catch (e){ finish(false); return; }

    u.onend = function(){ if (myEpoch !== epoch || rec.seq !== mySeq) return; finish(true); };
    u.onerror = function(){ if (myEpoch !== epoch || rec.seq !== mySeq) return; finish(false); };
    rec.watchdog = setT(function(){ finish(false); }, estimate(req.text, req.rate));

    log.push(req.text);
    try { synth.speak(u); } catch (e){ finish(false); }
    kickResume();
  }

  function startNext(){
    if (active || starting || !pending) return;
    var req = pending;
    pending = null;
    if (req.epoch !== epoch){ req.settle(false); return; }

    /*
      iOS treats cancel() as asynchronous. speak() called in the same tick
      either loses the new utterance or lets both through — which is the
      overlapping-audio half of the original bug. One tick of daylight
      between them fixes it, and only costs anything when something was
      genuinely still speaking.
    */
    var busy = false;
    try { busy = !!(synth && (synth.speaking || synth.pending)); } catch (e){}
    if (busy){ try { synth.cancel(); } catch (e){} }
    starting = true;
    later(function(){ reallySpeak(req); }, busy ? 60 : 0);
  }

  /*
    iOS silently pauses the synth after roughly fifteen seconds of a page
    being idle, and never resumes on its own. A cheap heartbeat while we
    believe we are speaking keeps it alive.
  */
  function kickResume(){
    if (!synth || resumeTimer) return;
    resumeTimer = setT(function tick(){
      resumeTimer = null;
      var speaking = false;
      try { speaking = !!synth.speaking; } catch (e){}
      if (!speaking) return;
      try { if (synth.paused) synth.resume(); } catch (e){}
      resumeTimer = setT(tick, 4000);
    }, 4000);
  }

  /* ---------- public surface ---------- */

  /*
    Say something. Returns a promise that settles when the utterance is
    done, whatever "done" turns out to mean on this device.

    opts.key      dedupe identity; defaults to the text
    opts.dedupeMs 0 disables the guard (a chain needs this: SEE really does
                  have two E's in a row and both must be heard)
  */
  function say(text, opts){
    opts = opts || {};
    var body = String(text == null ? '' : text).trim();
    if (!body) return Promise.resolve(false);

    var key = opts.key == null ? body : String(opts.key);
    var window_ = opts.dedupeMs == null ? DEDUPE_MS : opts.dedupeMs;
    var t = now();
    if (window_ > 0 && lastSaid[key] != null && (t - lastSaid[key]) < window_){
      return Promise.resolve(false);     /* a second path fired for one action */
    }
    lastSaid[key] = t;

    return new Promise(function(resolve){
      var req = {
        text: body, rate: opts.rate == null ? 0.85 : opts.rate,
        epoch: epoch, settle: function(ok){ resolve(ok); }
      };
      /*
        Depth one, newest wins. Stacking requests is what made the old build
        read a whole backlog out after the child had moved on.
      */
      if (pending) pending.settle(false);
      pending = req;
      startNext();
    });
  }

  /* Cancel everything and invalidate every callback still in flight. */
  function reset(){
    epoch++;
    clearTimers();
    starting = false;
    if (resumeTimer){ clearT(resumeTimer); resumeTimer = null; }
    if (pending){ pending.settle(false); pending = null; }
    settleActive(false);
    lastSaid = {};
    if (synth){ try { synth.cancel(); } catch (e){} }
  }

  /*
    Spell a word out, one letter at a time, waiting for each.

    The chain is bound to the epoch it started in: a screen change aborts it
    between letters instead of letting it talk over whatever came next. The
    dedupe guard is switched off inside the chain because a repeated letter
    is legitimate here.
  */
  function spell(word, opts){
    opts = opts || {};
    var letters = String(word || '').toUpperCase().replace(/[^A-Z]/g, '').split('');
    var myEpoch = epoch;
    var soundOf = opts.soundOf || function(c){ return c; };
    var i = 0;

    return new Promise(function(resolve){
      function step(){
        if (myEpoch !== epoch || i >= letters.length){ resolve(myEpoch === epoch); return; }
        var pos = i++;
        if (opts.onLetter){
          try { opts.onLetter(pos, letters[pos]); } catch (e){}
        }
        say(soundOf(letters[pos]), {
          rate: opts.rate == null ? 0.78 : opts.rate,
          dedupeMs: 0,
          key: 'chain:' + myEpoch + ':' + pos
        }).then(function(){
          if (myEpoch !== epoch){ resolve(false); return; }
          later(step, opts.gap == null ? 260 : opts.gap);
        });
      }
      step();
    });
  }

  /*
    Say a letter and only then a phrase. This exists because of a real bug:
    finishing a word used to speak the praise line in place of the final
    letter, and the praise call began with cancel() — so the last letter was
    never heard at all.
  */
  function letterThen(letter, phrase, opts){
    opts = opts || {};
    var soundOf = opts.soundOf || function(c){ return c; };
    var myEpoch = epoch;
    return say(soundOf(letter), { rate: 0.8, dedupeMs: 0, key: 'final:' + letter })
      .then(function(){
        if (myEpoch !== epoch) return false;
        return new Promise(function(resolve){
          later(function(){ resolve(say(phrase, { rate: opts.rate == null ? 0.85 : opts.rate })); }, 240);
        });
      });
  }

  /* A delayed line that a screen change cancels by construction. */
  function sayAfter(ms, text, opts){
    later(function(){ say(text, opts); }, ms);
  }

  /*
    iOS only lets a page speak after its first utterance has been started
    inside a real tap. The queue defers every utterance by a tick, which is
    outside the tap, so the very first tap speaks one silent utterance
    directly. Once only: after that the synth is unlocked for the session.
  */
  var primed = false;
  function prime(){
    if (primed || !synth || !mkUtt) return false;
    primed = true;
    try {
      var u = mkUtt(' ', { rate: 1, voice: voice, volume: 0 });
      synth.speak(u);
    } catch (e){ return false; }
    return true;
  }

  function unlock(){
    if (!synth) return false;
    try { if (synth.paused) synth.resume(); } catch (e){}
    return true;
  }

  pickVoice();

  return {
    say: say, spell: spell, letterThen: letterThen, sayAfter: sayAfter,
    reset: reset, unlock: unlock, prime: prime, pickVoice: pickVoice,
    available: function(){ return !!synth; },
    /* read-only, for the suites */
    epoch: function(){ return epoch; },
    spoken: function(){ return log.slice(); },
    clearLog: function(){ log = []; },
    busy: function(){ return !!(active || pending || starting); }
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createSpeech: createSpeech };
