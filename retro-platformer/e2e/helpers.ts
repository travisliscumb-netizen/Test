import { expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** The production build, loaded straight from disk like it would be from Dropbox. */
export function buildUrl(): string {
  const file = resolve(import.meta.dirname, "../dist/index.html");
  if (!existsSync(file)) throw new Error("dist/index.html is missing: run `npm run build` first");
  return pathToFileURL(file).href;
}

export interface Snapshot {
  mode: string;
  viewWidth: number;
  phase: string | null;
  level: number;
  score: number;
  coins: number;
  lives: number;
  player: { x: number; y: number; form: string } | null;
}

export function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => window.__sproutQuest!.snapshot());
}

/** Collects console errors and uncaught exceptions. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

export async function waitForMode(page: Page, mode: string): Promise<void> {
  await expect.poll(async () => (await snapshot(page)).mode, { timeout: 10_000 }).toBe(mode);
}

declare global {
  interface Window {
    __sproutQuest?: { snapshot(): Snapshot };
  }
}
