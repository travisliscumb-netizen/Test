import { describe, expect, it } from "vitest";
import { buttonsAt, type TouchLayout } from "../src/core/touchZones";

const layout: TouchLayout = {
  pad: { left: 20, top: 300, right: 220, bottom: 380 },
  run: { cx: 580, cy: 350, r: 40 },
  jump: { cx: 660, cy: 320, r: 40 },
  pause: { left: 700, top: 10, right: 740, bottom: 50 },
  mute: { left: 640, top: 10, right: 680, bottom: 50 },
};

describe("touch zones", () => {
  it("maps the pad halves to left and right with a dead zone in the middle", () => {
    expect(buttonsAt(80, 340, layout)).toEqual(["left"]);
    expect(buttonsAt(160, 340, layout)).toEqual(["right"]);
    expect(buttonsAt(121, 340, layout)).toEqual([]);
  });

  it("holds run when the pad is pushed to its outer edge", () => {
    expect(buttonsAt(215, 340, layout)).toEqual(["right", "run"]);
    expect(buttonsAt(25, 340, layout)).toEqual(["left", "run"]);
  });

  it("is forgiving above and below the pad", () => {
    expect(buttonsAt(160, 280, layout)).toEqual(["right"]);
    expect(buttonsAt(160, 150, layout)).toEqual([]);
  });

  it("maps the A and B buttons, both at once between them", () => {
    expect(buttonsAt(660, 320, layout)).toEqual(["jump"]);
    expect(buttonsAt(570, 355, layout)).toEqual(["run"]);
    expect(buttonsAt(620, 335, layout)).toEqual(["jump", "run"]);
    expect(buttonsAt(400, 100, layout)).toEqual([]);
  });

  it("maps the pause and mute buttons", () => {
    expect(buttonsAt(720, 30, layout)).toEqual(["start"]);
    expect(buttonsAt(660, 30, layout)).toEqual(["mute"]);
  });
});
