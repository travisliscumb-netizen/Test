import { describe, expect, it } from "vitest";
import { Camera } from "../src/world/camera";
import { CAMERA } from "../src/tuning";

describe("Camera", () => {
  it("waits until the target passes the lead line, then follows", () => {
    const cam = new Camera(500, 5000);
    cam.follow(100);
    expect(cam.x).toBe(0);
    cam.follow(500 * CAMERA.followFraction + 30);
    expect(cam.x).toBe(30);
  });

  it("never scrolls backwards", () => {
    const cam = new Camera(500, 5000);
    cam.follow(1000);
    const x = cam.x;
    cam.follow(300);
    expect(cam.x).toBe(x);
  });

  it("stops at the end of the level", () => {
    const cam = new Camera(500, 2000);
    cam.follow(99999);
    expect(cam.x).toBe(1500);
  });

  it("re-clamps when the view widens", () => {
    const cam = new Camera(500, 2000);
    cam.follow(99999);
    cam.setViewWidth(800);
    expect(cam.x).toBe(1200);
  });

  it("interpolates between steps", () => {
    const cam = new Camera(500, 5000);
    cam.snapTo(0);
    cam.beginStep();
    cam.follow(400);
    expect(cam.interpolated(0.5)).toBe(cam.x / 2);
  });

  it("handles levels narrower than the view", () => {
    const cam = new Camera(960, 600);
    cam.follow(500);
    expect(cam.x).toBe(0);
  });
});
