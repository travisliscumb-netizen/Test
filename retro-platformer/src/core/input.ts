/** Logical buttons the game understands. */
export const BUTTONS = ["left", "right", "jump", "run", "start", "mute"] as const;
export type Button = (typeof BUTTONS)[number];

/** One simulation step's view of the controls. */
export interface Controls {
  readonly left: boolean;
  readonly right: boolean;
  readonly jump: boolean;
  readonly run: boolean;
  /** True if jump went down at any point since the previous step, even if already released. */
  readonly jumpPressed: boolean;
  readonly startPressed: boolean;
  readonly mutePressed: boolean;
}

export const NO_CONTROLS: Controls = {
  left: false,
  right: false,
  jump: false,
  run: false,
  jumpPressed: false,
  startPressed: false,
  mutePressed: false,
};

/**
 * Merges several input sources (keyboard, touch) that each own a set of held
 * buttons identified by a source key. Presses are latched until the next
 * {@link sample}, so a tap shorter than one simulation step is never lost.
 */
export class InputHub {
  private readonly held = new Map<string, Set<Button>>();
  private readonly pressedSinceSample = new Set<Button>();

  /** Sets whether `button` is held by `source` (e.g. "key:KeyZ", "touch:3"). */
  setHeld(source: string, button: Button, down: boolean): void {
    let set = this.held.get(source);
    if (down) {
      if (!set) {
        set = new Set();
        this.held.set(source, set);
      }
      if (!set.has(button) && !this.isHeld(button)) this.pressedSinceSample.add(button);
      set.add(button);
    } else if (set) {
      set.delete(button);
      if (set.size === 0) this.held.delete(source);
    }
  }

  /** Releases everything a source holds (touch ended, key source lost focus). */
  releaseSource(source: string): void {
    this.held.delete(source);
  }

  releaseAll(): void {
    this.held.clear();
  }

  isHeld(button: Button): boolean {
    for (const set of this.held.values()) if (set.has(button)) return true;
    return false;
  }

  sample(): Controls {
    const c: Controls = {
      left: this.isHeld("left"),
      right: this.isHeld("right"),
      jump: this.isHeld("jump"),
      run: this.isHeld("run"),
      jumpPressed: this.pressedSinceSample.has("jump"),
      startPressed: this.pressedSinceSample.has("start"),
      mutePressed: this.pressedSinceSample.has("mute"),
    };
    this.pressedSinceSample.clear();
    return c;
  }
}

const KEY_MAP: Readonly<Record<string, Button>> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  KeyZ: "jump",
  Space: "jump",
  ArrowUp: "jump",
  KeyW: "jump",
  KeyK: "jump",
  KeyX: "run",
  ShiftLeft: "run",
  ShiftRight: "run",
  KeyJ: "run",
  Enter: "start",
  Escape: "start",
  KeyP: "start",
  KeyM: "mute",
};

/** Maps a KeyboardEvent.code to a button. */
export function buttonForKey(code: string): Button | undefined {
  return KEY_MAP[code];
}

/** Wires keyboard events into the hub. Returns an unsubscribe function. */
export function attachKeyboard(hub: InputHub, target: Window = window): () => void {
  const onKey = (e: KeyboardEvent): void => {
    const button = buttonForKey(e.code);
    if (!button) return;
    e.preventDefault();
    if (e.type === "keydown" && e.repeat) return;
    hub.setHeld(`key:${e.code}`, button, e.type === "keydown");
  };
  const onBlur = (): void => hub.releaseAll();
  target.addEventListener("keydown", onKey);
  target.addEventListener("keyup", onKey);
  target.addEventListener("blur", onBlur);
  return () => {
    target.removeEventListener("keydown", onKey);
    target.removeEventListener("keyup", onKey);
    target.removeEventListener("blur", onBlur);
  };
}
