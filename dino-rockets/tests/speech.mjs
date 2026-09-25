/* The speech controller under the conditions that broke the old build:
   duplicated event paths, rapid taps, a screen change mid-chain, and a
   synth that never fires onend. Driven by a virtual clock against a fake
   synth, so the races are deterministic instead of "hold it and see". */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { createSpeech } = require(path.join(HERE, '..', 'src', '30-speech.js'));
const CORE = require(path.join(HERE, '..', 'src', '20-core.js'));

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; return; }
  fail++; failures.push(`${name}${detail ? ' -- ' + detail : ''}`);
}

const flush = () => new Promise(r => setImmediate(r));

function makeClock() {
  let t = 0, id = 0;
  const tasks = new Map();
  return {
    now: () => t,
    setTimeout(fn, ms) { const k = ++id; tasks.set(k, { at: t + (ms || 0), fn }); return k; },
    clearTimeout(k) { tasks.delete(k); },
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        let best = null, bestKey = null;
        for (const [k, v] of tasks) {
          if (v.at <= end && (best === null || v.at < best.at)) { best = v; bestKey = k; }
        }
        if (!best) break;
        t = best.at;
        tasks.delete(bestKey);
        best.fn();
        await flush(); await flush();
      }
      t = end;
      await flush(); await flush();
    }
  };
}

/* A synth that behaves like a real one, including the ways they misbehave. */
function makeFakeSynth(clock, opts = {}) {
  const st = {
    speaking: false, pending: false, paused: false,
    spoken: [], overlaps: 0, current: null,
    getVoices: () => [{ name: 'Samantha', lang: 'en-US' }],
    speak(u) {
      if (st.current) st.overlaps++;          /* two at once is the bug */
      st.current = u;
      st.speaking = true;
      st.spoken.push(u.text);
      if (opts.neverEnds) return;             /* iOS: onend never arrives */
      clock.setTimeout(() => {
        if (st.current !== u) return;         /* cancelled while speaking */
        st.current = null;
        st.speaking = false;
        if (u.onend) u.onend();
      }, opts.speakMs || 300);
    },
    cancel() {
      const victim = st.current;
      if (opts.asyncCancel) {
        clock.setTimeout(() => { if (st.current === victim) { st.current = null; st.speaking = false; } }, 30);
      } else {
        st.current = null;
        st.speaking = false;
      }
    }
  };
  return st;
}

function makeSpeech(opts = {}) {
  const clock = makeClock();
  const synth = makeFakeSynth(clock, opts);
  const speech = createSpeech({
    synth,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    getVoices: synth.getVoices,
    makeUtterance: (text, o) => ({ text, rate: o.rate, onend: null, onerror: null })
  });
  return { clock, synth, speech };
}

const soundOf = (c) => CORE.letterSound(c, {});

/* ---- 1. one action, one utterance ---- */
{
  const { clock, synth, speech } = makeSpeech();
  speech.say('E');
  await clock.advance(2000);
  check('one call speaks once', synth.spoken.filter(t => t === 'E').length === 1,
    JSON.stringify(synth.spoken));
}

/* ---- 2. a duplicated event path cannot double-speak ---- */
{
  const { clock, synth, speech } = makeSpeech();
  /* exactly what a click + touchend pair, or a re-bound listener, produces */
  speech.say('E'); speech.say('E'); speech.say('E');
  await clock.advance(3000);
  check('duplicate paths collapse to one', synth.spoken.filter(t => t === 'E').length === 1,
    JSON.stringify(synth.spoken));
}

/* ---- 3. rapid taps never overlap and never stack ---- */
{
  const { clock, synth, speech } = makeSpeech();
  for (const ch of ['T', 'H', 'E', 'M', 'S']) { speech.say(ch); await clock.advance(20); }
  await clock.advance(6000);
  check('rapid taps never overlap', synth.overlaps === 0, `${synth.overlaps} overlaps`);
  check('rapid taps do not stack a backlog', synth.spoken.length <= 3,
    `spoke ${synth.spoken.length}: ${JSON.stringify(synth.spoken)}`);
}

/* ---- 4. spelling a word with a repeated letter says both ---- */
{
  const { clock, synth, speech } = makeSpeech();
  speech.spell('SEE', { soundOf });
  await clock.advance(9000);
  check('SEE spells S-E-E in order',
    JSON.stringify(synth.spoken) === JSON.stringify(['ess', 'eee', 'eee']),
    JSON.stringify(synth.spoken));
  check('spelling never overlaps', synth.overlaps === 0);
}

/* ---- 5. THE REGRESSION: a screen change must kill the chain dead ---- */
{
  const { clock, synth, speech } = makeSpeech();
  speech.spell('THE', { soundOf });
  await clock.advance(700);                 /* part-way through */
  const spokenBefore = synth.spoken.length;
  speech.reset();                           /* this is show() changing screen */
  await clock.advance(10000);
  check('an aborted chain speaks nothing further',
    synth.spoken.length === spokenBefore,
    `grew from ${spokenBefore} to ${synth.spoken.length}: ${JSON.stringify(synth.spoken)}`);
}

/* ---- 5b. two chains started back to back must not interleave ---- */
{
  const { clock, synth, speech } = makeSpeech();
  speech.spell('THE', { soundOf });
  await clock.advance(700);
  speech.reset();
  speech.spell('THE', { soundOf });
  await clock.advance(12000);
  check('restarting a chain never overlaps', synth.overlaps === 0, `${synth.overlaps} overlaps`);
  const tail = synth.spoken.slice(-3);
  check('the restarted chain completes cleanly',
    JSON.stringify(tail) === JSON.stringify(['tee', 'aitch', 'eee']), JSON.stringify(synth.spoken));
  /* the letter that was mid-flight must not be spoken three times overall */
  for (const s of ['tee', 'aitch', 'eee']) {
    check(`"${s}" is never spoken three times`, synth.spoken.filter(x => x === s).length <= 2,
      JSON.stringify(synth.spoken));
  }
}

/* ---- 6. a synth that never reports completion must not wedge ---- */
{
  const { clock, synth, speech } = makeSpeech({ neverEnds: true });
  let settled = 0;
  speech.say('A').then(() => settled++);
  await clock.advance(12000);
  check('a stalled utterance still settles', settled === 1);
  let second = 0;
  speech.say('B').then(() => second++);
  await clock.advance(12000);
  check('the queue keeps working after a stall', second === 1 && synth.spoken.includes('B'),
    JSON.stringify(synth.spoken));
}

/* ---- 7. an async cancel (iOS) must not let two through ---- */
{
  const { clock, synth, speech } = makeSpeech({ asyncCancel: true, speakMs: 500 });
  speech.say('first');
  await clock.advance(100);
  speech.say('second');
  await clock.advance(4000);
  check('async cancel does not double-speak', synth.overlaps === 0, `${synth.overlaps} overlaps`);
}

/* ---- 8. a delayed line is cancelled by a screen change ---- */
{
  const { clock, synth, speech } = makeSpeech();
  speech.sayAfter(380, 'Build the word THE');
  await clock.advance(100);
  speech.reset();                            /* child tapped Back */
  await clock.advance(5000);
  check('a pending delayed line is dropped on screen change',
    synth.spoken.length === 0, JSON.stringify(synth.spoken));
}

/* ---- 9. the final letter is heard before the praise ---- */
{
  const { clock, synth, speech } = makeSpeech();
  speech.letterThen('E', 'You spelled THE!', { soundOf });
  await clock.advance(6000);
  check('last letter precedes the praise line',
    JSON.stringify(synth.spoken) === JSON.stringify(['eee', 'You spelled THE!']),
    JSON.stringify(synth.spoken));
}

/* ---- 9b. the iOS unlock: one silent utterance, spoken inside the tap ---- */
{
  const clock = makeClock();
  const synth = makeFakeSynth(clock);
  const made = [];
  const speech = createSpeech({
    synth, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    getVoices: synth.getVoices,
    makeUtterance: (text, o) => { const u = { text, rate: o.rate, volume: o.volume, onend: null, onerror: null }; made.push(u); return u; }
  });
  const first = speech.prime();
  check('prime speaks synchronously, inside the gesture', synth.spoken.length === 1, JSON.stringify(synth.spoken));
  check('the primer is silent', made[0] && made[0].volume === 0);
  check('prime happens once per session', speech.prime() === false && synth.spoken.length === 1 && first === true);
  speech.say('frog');
  await clock.advance(2000);
  check('speech works normally after priming', synth.spoken.includes('frog') && synth.overlaps === 0,
    JSON.stringify(synth.spoken) + ' overlaps=' + synth.overlaps);
}

/* ---- 10. no speech support at all must not break the flow ---- */
{
  const clock = makeClock();
  const speech = createSpeech({
    synth: null, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout
  });
  let done = 0;
  speech.say('anything').then(() => done++);
  await clock.advance(2000);
  check('a browser with no speech still resolves', done === 1);
  check('available() reports honestly', speech.available() === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFailures:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
