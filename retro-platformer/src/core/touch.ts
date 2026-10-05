import type { Button, InputHub } from "./input";
import { buttonsAt, type Circle, type Rect, type TouchLayout } from "./touchZones";

type ZoneName = "pad" | "jump" | "run" | "pause" | "mute";

/**
 * On-screen controls. Every finger is tracked separately and re-hit-tested as
 * it moves, so a thumb can slide from left to right on the pad, or roll from
 * B onto A, without lifting.
 */
export function attachTouch(hub: InputHub, root: HTMLElement, onTouch: () => void): void {
  const zones = new Map<ZoneName, HTMLElement>();
  for (const el of root.querySelectorAll<HTMLElement>("[data-zone]")) zones.set(el.dataset.zone as ZoneName, el);
  const fingers = new Map<number, Button[]>();
  let layout: TouchLayout | null = null;

  const touchCapable = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (touchCapable) {
    root.classList.add("active");
    onTouch();
  }

  const measure = (): TouchLayout => {
    const rect = (name: ZoneName): Rect => {
      const r = zones.get(name)!.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const circle = (name: ZoneName): Circle => {
      const r = rect(name);
      return { cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, r: (r.right - r.left) / 2 };
    };
    return { pad: rect("pad"), jump: circle("jump"), run: circle("run"), pause: rect("pause"), mute: rect("mute") };
  };
  window.addEventListener("resize", () => (layout = null));

  const refreshHighlights = (): void => {
    const held = new Set<Button>();
    for (const buttons of fingers.values()) for (const b of buttons) held.add(b);
    zones.get("pad")!.classList.toggle("down", held.has("left") || held.has("right"));
    zones.get("jump")!.classList.toggle("down", held.has("jump"));
    zones.get("run")!.classList.toggle("down", held.has("run"));
    zones.get("pause")!.classList.toggle("down", held.has("start"));
    zones.get("mute")!.classList.toggle("down", held.has("mute"));
  };

  const update = (t: Touch): void => {
    layout ??= measure();
    const source = `touch:${t.identifier}`;
    const next = buttonsAt(t.clientX, t.clientY, layout);
    const prev = fingers.get(t.identifier) ?? [];
    for (const b of prev) if (!next.includes(b)) hub.setHeld(source, b, false);
    for (const b of next) if (!prev.includes(b)) hub.setHeld(source, b, true);
    fingers.set(t.identifier, next);
  };

  const onStart = (e: TouchEvent): void => {
    e.preventDefault();
    if (!root.classList.contains("active")) {
      root.classList.add("active");
      layout = null;
      onTouch();
    }
    for (const t of e.changedTouches) update(t);
    refreshHighlights();
  };
  const onMove = (e: TouchEvent): void => {
    e.preventDefault();
    for (const t of e.changedTouches) update(t);
    refreshHighlights();
  };
  const onEnd = (e: TouchEvent): void => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      hub.releaseSource(`touch:${t.identifier}`);
      fingers.delete(t.identifier);
    }
    refreshHighlights();
  };

  // Listen on the window so touches that start on the canvas still register.
  const opts: AddEventListenerOptions = { passive: false };
  window.addEventListener("touchstart", onStart, opts);
  window.addEventListener("touchmove", onMove, opts);
  window.addEventListener("touchend", onEnd, opts);
  window.addEventListener("touchcancel", onEnd, opts);
  // iOS pinch-zoom gestures.
  document.addEventListener("gesturestart", (e) => e.preventDefault());
}
