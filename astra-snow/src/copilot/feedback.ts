// Voice, sound and haptics — the channels that work without looking.
//
// iOS facts this module is written around (not yet confirmed on the target
// phone; see docs/FIELD-TEST.md):
//  - speechSynthesis and Web Audio stay silent until unlocked inside a tap.
//  - navigator.vibrate does not exist on iOS Safari. iOS 18 gives a haptic tick
//    when an <input type="checkbox" switch> is toggled by a user gesture;
//    we toggle a hidden one from inside the tap handler.
//  - navigator.audioSession (Safari 16.4+) can opt out of the silent switch.

const ABBREV: [RegExp, string][] = [
  // "St" before a capitalised name is Saint ("St Vincent St" -> Saint Vincent Street).
  [/\bSt\.?(?= [A-Z][a-z])/g, 'Saint'],
  [/\bSt\b\.?/g, 'Street'],
  [/\bCres\b/g, 'Crescent'],
  [/\bCrt\b|\bCt\b/g, 'Court'],
  [/\bSq\b/g, 'Square'],
  [/\bRd\b/g, 'Road'],
  [/\bAve\b|\bAv\b/g, 'Avenue'],
  [/\bE\b$/g, 'East'],
  [/\bdrvwy\b|\bdrwy\b/gi, 'driveway'],
  [/\bbtwn\b/gi, 'between'],
  [/\bposs\b/gi, 'possible'],
  [/\bblvd\b/gi, 'boulevard'],
  [/\bgrbg\b/gi, 'garbage'],
  [/\bret\.\s?/gi, 'retaining '],
  [/\bCARFUL\b/gi, 'careful'],
  [/\bx2\b/gi, 'two'],
  [/@/g, ' at '],
  [/(\d+)"/g, '$1 inch'],
  [/\bAC\b/g, 'A C'],
];

const KEEP_CAPS = new Set(['A', 'C']);

export function speakable(text: string): string {
  let t = text.replace(/\([^)]*\)/g, ' '); // parenthetical asides stay on screen, not in the air
  for (const [re, rep] of ABBREV) t = t.replace(re, rep);
  t = t.replace(/[-–—]+/g, ', ').replace(/…/g, '.').replace(/\s+/g, ' ').trim();
  // Shouted words read badly (and short ones get spelled out as letters):
  // lowercase every all-caps word except deliberate acronyms, then
  // sentence-case the start so it reads as an instruction.
  t = t.replace(/\b[A-Z]{2,}\b/g, (w) => (KEEP_CAPS.has(w) ? w : w.toLowerCase()));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export class Feedback {
  voiceOn = true;
  soundOn = true;
  private ctx: AudioContext | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  private unlocked = false;
  private hapticEl: HTMLLabelElement | null = null;
  private speakingPriority = 0;

  /** Call from inside the first user tap. Idempotent. */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'playback';
    } catch {
      /* not supported */
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
    if ('speechSynthesis' in window) {
      const pick = () => {
        const vs = speechSynthesis.getVoices();
        this.voice =
          vs.find((v) => v.lang === 'en-CA') ??
          vs.find((v) => /Samantha|Alex|Ava|Evan|Zoe/i.test(v.name) && v.lang.startsWith('en')) ??
          vs.find((v) => v.lang.startsWith('en')) ??
          null;
      };
      pick();
      speechSynthesis.addEventListener?.('voiceschanged', pick);
      // A silent utterance inside the gesture unlocks speech on iOS.
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    }
    // Hidden iOS switch for haptics.
    const label = document.createElement('label');
    label.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.body.appendChild(label);
    this.hapticEl = label;
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  /** Haptic tick. Only effective inside a user gesture on iOS. */
  haptic(pattern: 'tap' | 'success' | 'warn' = 'tap'): void {
    try {
      if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern === 'success' ? [12, 40, 18] : pattern === 'warn' ? [30, 60, 30] : 10);
        return;
      }
      this.hapticEl?.click();
      if (pattern !== 'tap') setTimeout(() => this.hapticEl?.click(), 70);
    } catch {
      /* ignore */
    }
  }

  /** Short synthesized cue. */
  tone(kind: 'done' | 'approach' | 'alert' | 'undo' | 'start' | 'complete'): void {
    if (!this.soundOn || !this.ctx) return;
    const c = this.ctx;
    if (c.state === 'suspended') void c.resume();
    const seq: Record<typeof kind, [number, number, number][]> = {
      // [frequency Hz, start s, duration s]
      done: [[660, 0, 0.09], [990, 0.08, 0.16]],
      approach: [[880, 0, 0.12]],
      alert: [[740, 0, 0.12], [520, 0.14, 0.2]],
      undo: [[520, 0, 0.08], [390, 0.08, 0.12]],
      start: [[392, 0, 0.12], [523, 0.12, 0.12], [784, 0.24, 0.3]],
      complete: [[523, 0, 0.14], [659, 0.14, 0.14], [784, 0.28, 0.14], [1047, 0.42, 0.5]],
    };
    const t0 = c.currentTime + 0.01;
    for (const [f, s, d] of seq[kind]) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + s);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + s + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + s + d);
      o.connect(g).connect(c.destination);
      o.start(t0 + s);
      o.stop(t0 + s + d + 0.02);
    }
  }

  /** Speak; a higher priority interrupts a lower one. */
  say(text: string, priority = 1): void {
    if (!this.voiceOn || !('speechSynthesis' in window) || !text) return;
    const s = window.speechSynthesis;
    if (s.speaking && priority > this.speakingPriority) s.cancel();
    else if (s.speaking && priority < this.speakingPriority) return;
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.lang = this.voice?.lang ?? 'en-CA';
    u.rate = 1.04;
    u.pitch = 1;
    this.speakingPriority = priority;
    u.onend = () => (this.speakingPriority = 0);
    s.speak(u);
  }
}
