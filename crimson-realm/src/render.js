/* Frame composition: sky -> parallax layers -> lights -> floor -> blood
   splats -> reflections -> shadows -> fighters -> projectiles ->
   particles -> weather -> grade/vignette -> HUD.

   The canvas backing store is sized to the screen's real pixels (capped so
   fill rate stays sane on phones); everything is drawn in a 720-tall
   logical space scaled by R.                                            */

import { GROUND_Y, STAGE_W, STAGES, FIGHTERS, MAX_HP, clamp, VIEW_H } from './config.js';
import { STAGE_ART, drawFloor, drawLights, drawWeather, HORIZON, paintPostLayer, paintRays } from './stages.js';
import { drawFighter, drawShadow } from './fighter-art.js';
import { POSES, solve, scaledBody, groundOffset } from './skeleton.js';
import { rgba, mix, shade, tint, glowSprite, puffSprite } from './color.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
/* Backing-store heights the adaptive quality steps through (see main.js). */
export const QUALITY = [1080, 864, 720];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d', { alpha: false });
    this.parts = [];
    this.splats = [];
    this.pieces = [];
    this.fx = [];              // finisher set pieces: pyre, stone pillar, boulder, void, abyss
    this.trauma = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.dark = 0;
    this.darkTarget = 0;
    this.announce = [];
    this.blood = true;
    this.stageId = null;
    this.layers = [];
    this.hp = [{ trail: MAX_HP, shown: MAX_HP, wait: 0 }, { trail: MAX_HP, shown: MAX_HP, wait: 0 }];
    this.combo = [{ n: 0, t: 0 }, { n: 0, t: 0 }];
    this.time = 0;
    this.weatherFlash = { v: 0 };
    this.viewW = 1280;
    this.R = 1;
  }

  resize(cssW, cssH, dpr, maxH = QUALITY[0]) {
    const backingH = Math.max(360, Math.min(maxH, Math.round(cssH * dpr)));
    // the lowest quality step also drops the costliest fighter effects
    this.lite = maxH <= QUALITY[QUALITY.length - 1];
    this.R = backingH / VIEW_H;
    this.viewW = Math.round((cssW / cssH) * VIEW_H);
    this.canvas.width = Math.round(this.viewW * this.R);
    this.canvas.height = backingH;
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    if (this.stageId) this.setStage(this.stageId, true);
  }

  setStage(id, force = false) {
    if (id === this.stageId && !force) return;
    for (const l of this.layers) { l.canvas.width = 0; l.canvas.height = 0; }
    this.stageId = id;
    this.art = STAGE_ART[id];
    const st = STAGES[id];
    this.light = { key: st.key, rim: st.rim, ambient: st.ambient };
    this.reflect = st.reflect;
    const vw = this.viewW;
    this.sky = makeLayer(vw, 1, this.R * 0.75, (g) => this.art.sky(g, vw));
    this.layers = this.art.layers.map((L, i) => {
      const w = Math.ceil(vw + (STAGE_W - vw) * L.f);
      const layer = { f: L.f, w, ...makeLayer(w, 1, this.R * L.q, (g) => L.draw(g, w)) };
      // farther layers get more atmospheric blur
      paintPostLayer(layer.canvas, [2.2, 1.0, 0][i] * this.R * L.q);
      return layer;
    });
    paintPostLayer(this.sky.canvas, 0.8 * this.R);
    if (this.rays) { this.rays.width = 0; this.rays = null; }
    const rc = document.createElement('canvas');
    rc.width = Math.ceil(vw * this.R * 0.5); rc.height = Math.ceil(VIEW_H * this.R * 0.5);
    if (paintRays(rc, this.art, vw)) this.rays = rc;
    this.splats.length = 0;
  }

  reset() {
    this.parts.length = 0;
    this.pieces.length = 0;
    this.splats.length = 0;
    this.announce.length = 0;
    this.dark = this.darkTarget = 0;
    this.flash = 0;
    this.trauma = 0;
    for (const h of this.hp) { h.trail = h.shown = MAX_HP; h.wait = 0; }
  }

  /* ------------------------------------------------------------ events */
  handle(events, match) {
    for (const e of events) {
      switch (e.type) {
        case 'hit': this.onHit(e); break;
        case 'block':
          this.burst(e.x, e.y, 10, { color: '#bfe6ff', speed: 9, life: 14, kind: 'spark' });
          this.ring(e.x, e.y, '#bfe6ff', 46);
          this.shake(0.18);
          break;
        case 'land': this.dust(e.f.x, 7, 0.6); break;
        case 'jump': this.dust(e.f.x, 5, 0.4); break;
        case 'thud': this.dust(e.x, 18, 1.2); this.shake(0.22 + e.power * 0.25); break;
        case 'proj': this.burst(e.p.x, e.p.y, 12, { color: projColor(e.p.kind), speed: 6, life: 18, kind: 'glow' }); break;
        case 'proj-hit': this.explode(e.p.x, e.p.y, projColor(e.p.kind)); break;
        case 'clash': this.explode(e.x, e.y, '#ffffff'); this.shake(0.3); break;
        case 'teleport':
          this.smoke(e.from, 140, e.f.def.element.glow);
          this.smoke(e.to, 140, e.f.def.element.glow);
          break;
        case 'quake': this.shake(0.45); this.dust(e.x, 22, 1.4); break;
        case 'special': {
          if (e.kind === 'dash') this.flashScreen(0.18, e.f.def.element.glow);
          const f = e.f;
          this.add({ kind: 'label', text: e.name.toUpperCase(), x: f.x, y: f.y + 330 * f.body.scale, vy: 1.1, life: 52, max: 52, color: f.def.element.glow });
          break;
        }
        case 'dash': this.dust(e.f.x - e.f.facing * (e.back ? -20 : 20), 6, 0.6); break;
        case 'guardbreak':
          this.burst(e.x, e.y, 26, { color: '#ffe08a', speed: 13, life: 18, kind: 'spark' });
          this.ring(e.x, e.y, '#ffe08a', 140);
          this.flashScreen(0.3, '#ffd27a');
          this.shake(0.5);
          this.add({ kind: 'label', text: 'GUARD BREAK', x: e.f.x, y: e.f.y + 320 * e.f.body.scale, vy: 1.2, life: 50, max: 50, color: '#ffd25a' });
          break;
        case 'proj-land':
          if (e.p.kind === 'rock') {
            this.dust(e.p.x, 14, 1.1);
            for (let i = 0; i < 12; i++) this.add({ kind: 'shard', x: e.p.x, y: 12, vx: (Math.random() - 0.5) * 12, vy: 4 + Math.random() * 9, life: 60, max: 60, size: 5 + Math.random() * 8, color: '#6a5a48', ang: 0, g: 0.6 });
            this.shake(0.25);
          } else this.explode(e.p.x, Math.max(20, e.p.y), projColor(e.p.kind));
          break;
        case 'fin-slash': {
          this.add({ kind: 'slash', x: e.x, y: e.y, ang: e.ang, size: 300, life: 14, max: 14, color: '#bfe0ff' });
          this.burst(e.x, e.y, 10, { color: '#ffffff', speed: 12, life: 10, kind: 'spark' });
          if (this.blood) this.bleed(e.x, e.y, 10, Math.random() < 0.5 ? 1 : -1, 0.9);
          this.flashScreen(0.18, '#dfefff');
          this.shake(0.22);
          break;
        }
        case 'fin-pyre': this.fx.push({ kind: 'pyre', x: e.x, t: 0, life: 100 }); this.flashScreen(0.3, '#ff8a2a'); this.shake(0.5); break;
        case 'fin-fire':
          for (let i = 0; i < 4; i++) {
            // flames lick up the sides of the body rather than covering it
            const side = Math.random() < 0.5 ? -1 : 1;
            this.add({ kind: 'flame', x: e.x + side * (30 + Math.random() * 45), y: Math.random() * 50, vx: -side * 0.4, vy: 3 + Math.random() * 5, life: 30 + Math.random() * 18, max: 48, size: 0.9 + Math.random() * 0.9 });
          }
          if (Math.random() < 0.35) this.add({ kind: 'glow', x: e.x + (Math.random() - 0.5) * 60, y: 60 + Math.random() * 200, vx: (Math.random() - 0.5) * 6, vy: 3 + Math.random() * 4, life: 30, max: 30, color: '#ffd27a', size: 0.5 });
          break;
        case 'fin-bolt':
          this.add({ kind: 'skybolt', x: e.x, y: e.y, life: e.big ? 18 : 11, max: e.big ? 18 : 11, color: '#7ff4ff', seed: Math.random() * 1e6, size: e.big ? 1.6 : 1 });
          this.burst(e.x, e.y, e.big ? 30 : 14, { color: '#bffaff', speed: 12, life: 14, kind: 'spark' });
          this.flashScreen(e.big ? 0.45 : 0.22, '#e8fdff');
          this.shake(e.big ? 0.8 : 0.35);
          break;
        case 'fin-pillar':
          this.fx.push({ kind: 'rockpillar', x: e.x, t: 0, life: 150 });
          for (let i = 0; i < 26; i++) this.add({ kind: 'shard', x: e.x + (Math.random() - 0.5) * 90, y: 10, vx: (Math.random() - 0.5) * 10, vy: 10 + Math.random() * 14, life: 80, max: 80, size: 6 + Math.random() * 12, color: '#5e564c', ang: Math.random() * 6, g: 0.6 });
          this.dust(e.x, 26, 1.6);
          break;
        case 'fin-boulder': this.fx.push({ kind: 'boulder', x: e.x, y: 1100, follow: e.f, t: 0, life: 9999, rot: 0 }); break;
        case 'fin-tendrils': this.fx.push({ kind: 'abyss', x: e.x, t: 0, life: 160 }); this.darkTarget = 0.78; break;
        case 'fin-tendril':
          this.add({ kind: 'tendril', x: e.x, y: 0, life: 44, max: 44, size: 170 + Math.random() * 140, seed: Math.random() * 6.28, ang: (Math.random() - 0.5) * 0.6 });
          break;
        case 'fin-void': this.fx.push({ kind: 'voidsphere', x: e.x, y: e.y, t: 0, life: 70 }); this.flashScreen(0.3, '#c04dff'); break;
        case 'ko':
          this.shake(0.9);
          this.flashScreen(0.7, '#ffffff');
          if (this.blood) this.bleed(e.f.x, e.f.y + 170 * e.f.body.scale, 40, Math.sign(e.f.x - e.att.x) || 1, 1.4);
          break;
        case 'finisher': this.darkTarget = 0.62; break;
        case 'shatter': this.shatter(e.f, e.att, e.style); break;
        case 'announce':
          // a banner that could not be shown in time (a stall, a backgrounded tab) is stale: drop it
          this.announce = this.announce.filter((a) => this.time - a.at < 2.5);
          this.announce.push({ text: e.text, sub: e.sub, kind: e.kind, t: -(e.delay || 0), at: this.time });
          break;
        case 'round': this.darkTarget = 0; this.dark = 0; this.pieces.length = 0; this.fx.length = 0; break;
      }
    }
  }

  onHit(e) {
    const power = clamp(e.dmg / 110, 0.3, 1.3);
    const dir = e.dir;
    this.burst(e.x, e.y, Math.round(8 + power * 10), { color: '#fff4c8', speed: 10 + power * 6, life: 12, kind: 'spark', dir });
    this.ring(e.x, e.y, '#ffffff', 40 + power * 40);
    if (e.special) {
      const el = e.att.def.element;
      this.burst(e.x, e.y, 22, { color: el.glow, speed: 9, life: 26, kind: 'glow' });
      if (el.name === 'lightning') this.bolts(e.x, e.y, el.glow);
    }
    if (this.blood) this.bleed(e.x, e.y, Math.round(6 + power * 16), dir, power);
    else this.burst(e.x, e.y, 10, { color: '#ffd27a', speed: 7, life: 20, kind: 'glow' });
    this.shake(0.16 + power * (e.heavy ? 0.32 : 0.16));
    const c = this.combo[e.att.side];
    if (e.combo >= 2) { c.n = e.combo; c.t = 90; }
  }

  shake(t) { this.trauma = Math.min(1, this.trauma + t); }
  flashScreen(a, color) { this.flash = Math.max(this.flash, a); this.flashColor = color; }

  add(p) {
    if (this.parts.length > 600) this.parts.splice(0, 60);
    this.parts.push(p);
  }

  burst(x, y, n, o) {
    for (let i = 0; i < n; i++) {
      let a = Math.random() * Math.PI * 2;
      if (o.dir) a = (o.dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 2.2;
      const v = o.speed * (0.35 + Math.random() * 0.8);
      this.add({ kind: o.kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: o.life * (0.6 + Math.random() * 0.6), max: o.life, color: o.color, size: o.size || 1, g: o.gravity || 0 });
    }
  }

  ring(x, y, color, r) { this.add({ kind: 'ring', x, y, life: 12, max: 12, color, size: r }); }

  bleed(x, y, n, dir, power) {
    for (let i = 0; i < n; i++) {
      const a = (dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.8 + (dir > 0 ? 0.5 : -0.5);
      const v = (4 + Math.random() * 9) * (0.6 + power * 0.5);
      this.add({ kind: 'blood', x, y, vx: Math.cos(a) * v, vy: Math.abs(Math.sin(a)) * v + 2, life: 90, max: 90, size: 2 + Math.random() * 4.5 * power, g: 0.55 });
    }
  }

  dust(x, n, s) {
    for (let i = 0; i < n; i++) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.add({ kind: 'dust', x: x + (Math.random() - 0.5) * 40, y: 4, vx: dir * (1 + Math.random() * 4) * s, vy: Math.random() * 2 * s, life: 40, max: 40, size: (16 + Math.random() * 18) * s, color: this.art ? this.art.floor.back : '#888' });
    }
  }

  smoke(x, h, color) {
    for (let i = 0; i < 26; i++) {
      this.add({ kind: 'smoke', x: x + (Math.random() - 0.5) * 70, y: Math.random() * h * 1.6, vx: (Math.random() - 0.5) * 2, vy: 0.6 + Math.random() * 1.8, life: 50, max: 50, size: 28 + Math.random() * 30, color });
    }
  }

  explode(x, y, color) {
    this.burst(x, y, 30, { color, speed: 11, life: 24, kind: 'glow' });
    this.burst(x, y, 14, { color: '#ffffff', speed: 14, life: 12, kind: 'spark' });
    this.ring(x, y, color, 120);
    this.flashScreen(0.25, color);
  }

  bolts(x, y, color) {
    for (let i = 0; i < 4; i++) this.add({ kind: 'bolt', x, y, life: 10, max: 10, color, size: 90 + Math.random() * 80, seed: Math.random() * 1e6 });
  }

  /* Dismantles the loser's last pose. Each execution style breaks the body
     differently; with blood off, the body dissolves instead.            */
  shatter(f, att, style = 'slice') {
    const W = (k) => [f.x + f.skel[k][0] * f.facing, f.y + f.skel[k][1]];
    const segs = [
      ['hip', 'neck', 26, 'torso'], ['neck', 'head', f.body.head, 'head'],
      ['shF', 'elF', 12, 'arm'], ['elF', 'hf', 10, 'fore'], ['shB', 'elB', 12, 'arm'], ['elB', 'hb', 10, 'fore'],
      ['hipF', 'knF', 17, 'leg'], ['knF', 'anF', 12, 'leg'], ['hipB', 'knB', 17, 'leg'], ['knB', 'anB', 12, 'leg']
    ];
    const el = att.def.element;
    const L = f.def.look;
    const dir = Math.sign(f.x - att.x) || 1;
    const cy = f.y + 150 * f.body.scale;
    this.flashScreen(style === 'sink' ? 0.3 : 0.9, el.glow);
    this.shake(style === 'sink' ? 0.4 : 1);
    const gore = this.blood && style !== 'sink';
    if (gore) {
      for (const [a, b, r, part] of segs) {
        const A = W(a), B = W(b);
        let color = part === 'head' ? (L.hair.style === 'mask' ? L.mask : L.skin) : part === 'torso' ? (L.top === 'robe' || L.top === 'gi' || L.top === 'stone' ? L.skin : L.topColor) : part === 'leg' ? (L.stone ? L.skin : L.pants) : part === 'fore' ? (L.wraps || L.gloves || L.skin) : (L.sleeve === 'long' ? L.topColor : L.skin);
        if (style === 'ash') color = mix(color, '#140c08', 0.85);
        if (style === 'implode') color = mix(color, '#3a0a52', 0.35);
        let vx = dir * (1.5 + Math.random() * 5) + (Math.random() - 0.5) * 5, vy = 6 + Math.random() * 13;
        if (style === 'burst' || style === 'implode') {
          const ang = Math.random() * Math.PI * 2, sp = 10 + Math.random() * 12;
          vx = Math.cos(ang) * sp; vy = Math.abs(Math.sin(ang)) * sp + 4;
        }
        if (style === 'crush') { vx = (Math.random() - 0.5) * 9; vy = 1 + Math.random() * 3; }
        if (style === 'ash') { vx *= 0.3; vy = 2 + Math.random() * 3; }
        this.pieces.push({
          x: (A[0] + B[0]) / 2, y: style === 'implode' ? cy : (A[1] + B[1]) / 2, len: Math.hypot(B[0] - A[0], B[1] - A[1]), r: r * f.body.scale,
          ang: Math.atan2(B[1] - A[1], B[0] - A[0]), va: (Math.random() - 0.5) * (style === 'burst' ? 0.9 : 0.5),
          vx, vy, color, head: part === 'head', rest: 0, ash: style === 'ash', flat: style === 'crush' ? 0.55 : 1,
          hold: style === 'implode' ? 8 : 0, age: 0
        });
      }
      if (style !== 'ash') {
        const n = style === 'crush' ? 140 : style === 'burst' ? 120 : 90;
        this.bleed(f.x, cy, n, dir, style === 'crush' ? 1.2 : 1.6);
        this.bleed(f.x, cy, Math.round(n * 0.6), -dir, 1.2);
      }
      if (style === 'crush') for (let i = 0; i < 18; i++) this.splats.push({ x: f.x + (Math.random() - 0.5) * 220, r: 10 + Math.random() * 30, a: 0.75, dark: Math.random() < 0.5 });
    }
    // the element itself
    const glowN = this.blood ? 70 : 140;
    for (let i = 0; i < glowN; i++) {
      const y = f.y + Math.random() * 280 * f.body.scale;
      this.add({ kind: 'glow', x: f.x + (Math.random() - 0.5) * 120, y: Math.max(0, y), vx: (Math.random() - 0.5) * 8, vy: 2 + Math.random() * 8, life: 50 + Math.random() * 40, max: 90, color: el.glow, size: 1.6 });
    }
    if (style === 'ash') {
      for (let i = 0; i < 40; i++) this.add({ kind: 'smoke', x: f.x + (Math.random() - 0.5) * 80, y: Math.random() * 260, vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2, life: 80, max: 80, size: 30 + Math.random() * 30, color: '#3a3430' });
      this.burst(f.x, cy, 40, { color: '#ffb03a', speed: 9, life: 40, kind: 'glow', size: 0.5 });
    }
    if (style === 'burst' || style === 'implode' || el.name === 'lightning' || el.name === 'void') this.bolts(f.x, cy, el.glow);
    if (style === 'implode') this.ring(f.x, cy, '#c04dff', 360);
    if (style === 'crush') for (let i = 0; i < 26; i++) this.add({ kind: 'shard', x: f.x + (Math.random() - 0.5) * 80, y: 10, vx: (Math.random() - 0.5) * 12, vy: 8 + Math.random() * 14, life: 80, max: 80, size: 8 + Math.random() * 12, color: '#5a554e', ang: Math.random() * 6, g: 0.6 });
    if (style === 'sink') {
      this.smoke(f.x, 120, '#14261a');
      if (this.blood) for (let i = 0; i < 10; i++) this.splats.push({ x: f.x + (Math.random() - 0.5) * 160, r: 14 + Math.random() * 26, a: 0.8, dark: true });
    }
    this.ring(f.x, cy, el.glow, 260);
  }

  /* ------------------------------------------------------------- frame */
  frame(match, dt, hud) {
    const g = this.g;
    const R = this.R, vw = this.viewW;
    this.time += dt;
    const t = this.time;
    const cam = match.cam;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma * 16;
    const shx = (Math.sin(t * 91) + Math.sin(t * 57.3)) * 0.5 * sh;
    const shy = (Math.sin(t * 77) + Math.sin(t * 43.1)) * 0.5 * sh;
    const camY = cam.y;

    g.setTransform(R, 0, 0, R, 0, 0);
    g.imageSmoothingEnabled = true;
    // sky + parallax
    g.drawImage(this.sky.canvas, 0, 0, vw, VIEW_H);
    const left = cam.x - vw / 2;
    for (const L of this.layers) {
      const ox = -left * L.f + shx * L.f;
      g.drawImage(L.canvas, ox, camY * L.f + shy * L.f, L.w, VIEW_H);
    }
    // lightning lights the whole world
    if (this.weatherFlash.v > 0) {
      g.fillStyle = `rgba(200,240,255,${Math.min(0.5, this.weatherFlash.v * 0.6)})`;
      g.fillRect(0, 0, vw, VIEW_H);
    }
    drawLights(g, this.art, vw, cam.x - shx, camY, STAGE_W, t);
    if (this.rays) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.85 + 0.15 * Math.sin(t * 0.7);
      g.drawImage(this.rays, 0, 0, vw, VIEW_H);
      g.restore();
    }

    g.save();
    g.translate(shx, shy);
    drawFloor(g, this.art, vw, cam.x, camY, t, this.stageId);
    g.restore();

    // world space
    g.save();
    g.translate(vw / 2 - cam.x + shx, GROUND_Y + camY + shy);
    this.drawSplats(g);

    const fs = match.fighters;
    const order = [...fs].sort((a, b) => (a.isActive() ? 1 : 0) - (b.isActive() ? 1 : 0) || (a.state === 'gone' ? -1 : 0));
    if (this.reflect > 0) {
      g.save();
      g.scale(1, -0.86);
      for (const f of order) if (!f.hidden) drawFighter(g, f, this.light, { time: t, alpha: this.reflect, reuse: true });
      g.restore();
      g.fillStyle = 'rgba(0,0,0,0.15)';
    }
    for (const f of fs) if (f.state !== 'gone') drawShadow(g, f, this.light);
    this.drawFx(g, t, dt, 'back');
    for (const f of order) {
      if (f.hidden) continue;
      if (f.y < 0) {                       // being dragged under: nothing below the floor shows
        g.save();
        g.beginPath();
        g.rect(cam.x - 3000, -3000, 6000, 3000);
        g.clip();
        drawFighter(g, f, this.light, { time: t, lite: this.lite });
        g.restore();
        continue;
      }
      for (let i = f.trail.length - 1; i >= 1; i--) {
        const tr = f.trail[i];
        drawFighter(g, { ...f, skel: tr.skel, x: tr.x, y: tr.y, facing: tr.facing, alpha: 1 }, this.light, { silhouette: rgba(f.def.element.glow, 0.5), alpha: 0.35 * (1 - i / f.trail.length), chains: false });
      }
      drawFighter(g, f, this.light, { time: t, lite: this.lite });
    }
    this.drawFx(g, t, dt, 'front');
    this.drawPieces(g, dt);
    this.drawProjectiles(g, match, t);
    this.drawParticles(g, dt);
    g.restore();

    drawWeather(g, this.art, this.stageId, vw, cam.x, t, dt, this.weatherFlash);
    this.weatherFlash.v = Math.max(0, this.weatherFlash.v - dt * 2);

    // grade
    this.dark += (this.darkTarget - this.dark) * Math.min(1, dt * 4);
    if (this.dark > 0.01) {
      const cx = vw / 2, cy = GROUND_Y - 150;
      const gr = g.createRadialGradient(cx, cy, 80, cx, cy, vw * 0.6);
      gr.addColorStop(0, `rgba(0,0,0,${this.dark * 0.15})`);
      gr.addColorStop(1, `rgba(0,0,0,${this.dark})`);
      g.fillStyle = gr;
      g.fillRect(0, 0, vw, VIEW_H);
    }
    if (this.flash > 0.01) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = rgba(this.flashColor, Math.min(0.85, this.flash));
      g.fillRect(0, 0, vw, VIEW_H);
      g.restore();
      this.flash = Math.max(0, this.flash - dt * 3.2);
    }
    if (hud) this.drawHud(g, match, hud, dt);
  }

  drawFx(g, t, dt, layer) {
    const k = dt * 60;
    for (const e of this.fx) {
      const back = e.kind === 'abyss' || e.kind === 'rockpillar' || e.kind === 'pyre';
      if ((layer === 'back') !== back) continue;
      e.t += k;
      const u = e.t;
      g.save();
      switch (e.kind) {
        case 'pyre': {                      // a roaring column of fire
          const a = Math.min(1, u / 8) * Math.min(1, (e.life - u) / 20);
          if (a <= 0) break;
          g.globalCompositeOperation = 'lighter';
          const h = 420 * Math.min(1, u / 10);
          const gr = g.createLinearGradient(0, 0, 0, -h);
          gr.addColorStop(0, `rgba(255,170,70,${0.42 * a})`);
          gr.addColorStop(0.4, `rgba(230,80,20,${0.3 * a})`);
          gr.addColorStop(1, 'rgba(255,60,10,0)');
          g.fillStyle = gr;
          for (let i = 0; i < 3; i++) {
            const w = 90 - i * 22, wv = Math.sin(t * 9 + i) * 10;
            g.beginPath();
            g.moveTo(e.x - w, 0);
            g.quadraticCurveTo(e.x - w * 0.6 + wv, -h * 0.5, e.x + wv * 0.5, -h);
            g.quadraticCurveTo(e.x + w * 0.6 + wv, -h * 0.5, e.x + w, 0);
            g.fill();
          }
          g.globalAlpha = 0.55 * a;
          g.drawImage(glowSprite('#ff6a1a', 128), e.x - 200, -300, 400, 400);
          break;
        }
        case 'rockpillar': {               // erupts from the floor, holds, sinks back
          const rise = Math.min(1, u / 8), sink = Math.max(0, (u - 110) / 30);
          const h = 300 * rise * (1 - sink);
          if (h <= 1) break;
          const w = 70;
          const gr = g.createLinearGradient(e.x - w, 0, e.x + w, 0);
          gr.addColorStop(0, '#2a241e'); gr.addColorStop(0.35, '#7a6e60'); gr.addColorStop(0.6, '#5a5046'); gr.addColorStop(1, '#1e1a16');
          g.fillStyle = gr;
          g.beginPath();
          g.moveTo(e.x - w, 2);
          g.lineTo(e.x - w * 0.8, -h * 0.6); g.lineTo(e.x - w * 0.55, -h); g.lineTo(e.x - w * 0.1, -h - 18); g.lineTo(e.x + w * 0.4, -h + 6);
          g.lineTo(e.x + w * 0.85, -h * 0.55); g.lineTo(e.x + w, 2);
          g.closePath();
          g.fill();
          g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
          for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(e.x - w * 0.7, -h * i / 5); g.lineTo(e.x + w * 0.5, -h * i / 5 - 10); g.stroke(); }
          g.globalCompositeOperation = 'lighter';
          g.strokeStyle = 'rgba(255,138,60,0.6)'; g.lineWidth = 3;
          g.beginPath(); g.moveTo(e.x - 10, 0); g.lineTo(e.x + 4, -h * 0.4); g.lineTo(e.x - 6, -h * 0.8); g.stroke();
          break;
        }
        case 'boulder': {                  // falls with the victim, then rests
          const f = e.follow;
          const target = f && !f.hidden ? f.y + 260 * f.body.scale : 70;
          e.y = Math.max(target, e.y - 24 * k);
          if (f && f.hidden) e.y = Math.max(70, e.y - 30 * k);
          e.rot += 0.05 * k;
          const r = 80;
          g.translate(e.x, -e.y);
          g.rotate(e.rot);
          const gr = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
          gr.addColorStop(0, '#8a7e70'); gr.addColorStop(0.6, '#4e463e'); gr.addColorStop(1, '#1c1814');
          g.fillStyle = gr;
          g.beginPath();
          for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2, rr = r * (0.82 + 0.18 * Math.sin(i * 2.3));
            g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          g.closePath();
          g.fill();
          g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 3;
          g.beginPath(); g.moveTo(-r * 0.4, -r * 0.2); g.lineTo(r * 0.1, r * 0.1); g.lineTo(r * 0.3, r * 0.5); g.stroke();
          break;
        }
        case 'abyss': {                    // a pool of living shadow
          const a = Math.min(1, u / 15) * Math.min(1, (e.life - u) / 20);
          if (a <= 0) break;
          g.translate(e.x, -2);
          g.scale(1, 0.2);
          const gr = g.createRadialGradient(0, 0, 0, 0, 0, 200);
          gr.addColorStop(0, `rgba(0,0,0,${0.95 * a})`);
          gr.addColorStop(0.7, `rgba(10,30,16,${0.7 * a})`);
          gr.addColorStop(1, 'rgba(10,30,16,0)');
          g.fillStyle = gr;
          g.beginPath(); g.arc(0, 0, 200, 0, Math.PI * 2); g.fill();
          g.globalCompositeOperation = 'lighter';
          g.strokeStyle = `rgba(80,255,140,${0.25 * a})`; g.lineWidth = 6;
          g.beginPath(); g.arc(0, 0, 150 + Math.sin(t * 4) * 10, 0, Math.PI * 2); g.stroke();
          break;
        }
        case 'voidsphere': {               // swells around the victim, then collapses
          const grow = Math.min(1, u / 30), fall = Math.max(0, (u - 58) / 12);
          const r = 170 * grow * (1 - fall) + 10;
          if (u > e.life) break;
          g.translate(e.x, -e.y);
          const gr = g.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
          gr.addColorStop(0, 'rgba(10,0,20,0.85)');
          gr.addColorStop(0.75, 'rgba(70,10,110,0.55)');
          gr.addColorStop(1, 'rgba(192,77,255,0)');
          g.fillStyle = gr;
          g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
          g.globalCompositeOperation = 'lighter';
          g.strokeStyle = 'rgba(210,120,255,0.7)'; g.lineWidth = 3;
          for (let i = 0; i < 3; i++) {
            g.beginPath();
            g.ellipse(0, 0, r * (0.9 - i * 0.12), r * (0.3 + i * 0.1), t * (1.5 + i) + i, 0, Math.PI * 2);
            g.stroke();
          }
          break;
        }
      }
      g.restore();
    }
    if (layer === 'front') this.fx = this.fx.filter((e) => e.t < e.life);
  }

  drawSplats(g) {
    for (const s of this.splats) {
      g.fillStyle = `rgba(${s.dark ? '70,0,8' : '120,4,14'},${s.a})`;
      g.beginPath();
      g.ellipse(s.x, -1, s.r, s.r * 0.22, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  drawParticles(g, dt) {
    const k = dt * 60;
    const ps = this.parts;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= k;
      if (p.life <= 0) continue;
      p.x += (p.vx || 0) * k;
      p.y += (p.vy || 0) * k;
      if (p.g) p.vy -= p.g * k;
      const a = clamp(p.life / p.max, 0, 1);
      switch (p.kind) {
        case 'spark': {
          p.vx *= 0.86; p.vy *= 0.86;
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.strokeStyle = rgba(p.color, a);
          g.lineWidth = 2.6 * a + 0.6;
          g.beginPath();
          g.moveTo(p.x, -p.y);
          g.lineTo(p.x - p.vx * 2.4, -(p.y - p.vy * 2.4));
          g.stroke();
          g.restore();
          break;
        }
        case 'glow': {
          p.vx *= 0.93; p.vy *= 0.93;
          const R = 26 * p.size * (0.4 + a);
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = a;
          g.drawImage(glowSprite(p.color, 64), p.x - R, -p.y - R, R * 2, R * 2);
          g.restore();
          break;
        }
        case 'ring': {
          const r = p.size * (1 - a * 0.7);
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.strokeStyle = rgba(p.color, a * 0.8);
          g.lineWidth = 5 * a;
          g.beginPath();
          g.arc(p.x, -p.y, r, 0, Math.PI * 2);
          g.stroke();
          g.restore();
          break;
        }
        case 'blood': {
          if (p.y <= 2) {
            if (this.splats.length > 160) this.splats.shift();
            this.splats.push({ x: p.x, r: p.size * (2 + Math.random() * 2), a: 0.5 + Math.random() * 0.35, dark: Math.random() < 0.4 });
            p.life = 0;
            continue;
          }
          g.fillStyle = `rgba(${150 + Math.round(a * 40)},6,20,${0.9})`;
          g.beginPath();
          const sp = Math.hypot(p.vx, p.vy);
          g.ellipse(p.x, -p.y, p.size + sp * 0.25, p.size, Math.atan2(-p.vy, p.vx), 0, Math.PI * 2);
          g.fill();
          break;
        }
        case 'dust': case 'smoke': {
          p.vx *= 0.94; p.vy *= 0.96;
          const R = p.size * (1.6 - a * 0.6);
          g.globalAlpha = a * (p.kind === 'smoke' ? 0.55 : 0.35);
          const c = p.kind === 'smoke' ? mix(p.color, '#101010', 0.7) : tint(p.color, 0.25);
          g.drawImage(puffSprite(c), p.x - R, -p.y - R, R * 2, R * 2);
          g.globalAlpha = 1;
          break;
        }
        case 'shard': {
          if (p.y < 4) { p.y = 4; p.vy = -p.vy * 0.3; p.vx *= 0.7; }
          p.ang += p.vx * 0.05;
          g.save();
          g.translate(p.x, -p.y);
          g.rotate(p.ang);
          g.fillStyle = p.color;
          g.beginPath();
          g.moveTo(-p.size, -p.size * 0.4); g.lineTo(p.size * 0.6, -p.size * 0.7); g.lineTo(p.size, p.size * 0.5); g.lineTo(-p.size * 0.4, p.size * 0.6);
          g.fill();
          g.restore();
          break;
        }
        case 'slash': {
          const L = p.size * (0.6 + 0.4 * a);
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.translate(p.x, -p.y);
          g.rotate(p.ang);
          g.strokeStyle = rgba(p.color, a * 0.6);
          g.lineWidth = 14 * a;
          g.beginPath(); g.moveTo(-L / 2, 0); g.lineTo(L / 2, 0); g.stroke();
          g.strokeStyle = `rgba(255,255,255,${a})`;
          g.lineWidth = 3 * a + 1;
          g.beginPath(); g.moveTo(-L / 2, 0); g.lineTo(L / 2, 0); g.stroke();
          g.restore();
          break;
        }
        case 'flame': {
          p.vx *= 0.97;
          const R = 30 * p.size * (0.3 + a);
          const col = a > 0.6 ? '#ffb04a' : a > 0.3 ? '#ff6a14' : '#a0200a';
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = Math.min(0.8, a);
          g.drawImage(glowSprite(col, 64), p.x - R, -p.y - R * 1.3, R * 2, R * 2.6);
          g.restore();
          break;
        }
        case 'skybolt': {
          let r = p.seed;
          const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
          g.save();
          g.globalCompositeOperation = 'lighter';
          for (const [w, c] of [[16 * p.size, rgba(p.color, 0.35 * a)], [5 * p.size, `rgba(255,255,255,${a})`]]) {
            g.strokeStyle = c;
            g.lineWidth = w;
            g.beginPath();
            let x = p.x + (rnd() - 0.5) * 200, y = -1100;
            g.moveTo(x, y);
            const steps = 14;
            for (let s = 1; s <= steps; s++) {
              const t2 = s / steps;
              x = x + (p.x - x) * (t2 * 0.5) + (rnd() - 0.5) * 70 * (1 - t2);
              y = -1100 + (1100 - p.y) * t2;
              g.lineTo(x, y);
            }
            g.stroke();
          }
          g.drawImage(glowSprite(p.color, 128), p.x - 160, -p.y - 160, 320, 320);
          g.restore();
          break;
        }
        case 'tendril': {
          const prog = 1 - a;
          const h = p.size * Math.sin(Math.PI * Math.min(1, prog * 1.2));
          if (h <= 2) break;
          g.save();
          g.translate(p.x, 0);
          g.rotate(p.ang);
          const seg = 10;
          for (let pass = 0; pass < 2; pass++) {
            g.strokeStyle = pass ? 'rgba(10,22,14,0.95)' : 'rgba(80,255,140,0.22)';
            g.lineCap = 'round';
            for (let s2 = 0; s2 < seg; s2++) {
              const t0 = s2 / seg, t1 = (s2 + 1) / seg;
              const x0 = Math.sin(p.seed + t0 * 6 + this.time * 5) * 16 * t0, x1 = Math.sin(p.seed + t1 * 6 + this.time * 5) * 16 * t1;
              g.lineWidth = (pass ? 14 : 22) * (1 - t0 * 0.85);
              g.beginPath(); g.moveTo(x0, -h * t0); g.lineTo(x1, -h * t1); g.stroke();
            }
          }
          g.restore();
          break;
        }
        case 'label': {
          g.save();
          g.globalAlpha = Math.min(1, a * 2);
          g.font = `italic 900 26px ${FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.lineJoin = 'round';
          g.lineWidth = 6;
          g.strokeStyle = 'rgba(8,2,4,0.9)';
          g.strokeText(p.text, p.x, -p.y);
          g.fillStyle = tint(p.color, 0.45);
          g.fillText(p.text, p.x, -p.y);
          g.restore();
          break;
        }
        case 'bolt': {
          let r = p.seed;
          const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.strokeStyle = rgba(p.color, a);
          g.lineWidth = 3 * a + 1;
          g.beginPath();
          let x = p.x, y = -p.y;
          const ang = rnd() * Math.PI * 2;
          g.moveTo(x, y);
          for (let s = 0; s < 6; s++) {
            x += Math.cos(ang) * p.size / 6 + (rnd() - 0.5) * 30;
            y += Math.sin(ang) * p.size / 6 + (rnd() - 0.5) * 30;
            g.lineTo(x, y);
          }
          g.stroke();
          g.restore();
          break;
        }
      }
      ps[w++] = p;
    }
    ps.length = w;
  }

  drawPieces(g, dt) {
    const k = dt * 60;
    for (const p of this.pieces) {
      p.age = (p.age || 0) + k;
      if (p.hold && p.age < p.hold) {
        // implosion: everything collapses to the centre for a moment first
        continue;
      }
      if (p.ash && p.rest >= 1) {
        p.fade = (p.fade || 1) - 0.012 * k;
        if (Math.random() < 0.3) this.add({ kind: 'smoke', x: p.x, y: p.y, vx: (Math.random() - 0.5), vy: 1 + Math.random(), life: 40, max: 40, size: 14, color: '#3a3430' });
        if (p.fade <= 0) continue;
      }
      if (p.rest < 1) {
        p.vy -= 0.62 * k;
        p.x += p.vx * k;
        p.y += p.vy * k;
        p.ang += p.va * k;
        if (p.y < p.r * 0.6) {
          p.y = p.r * 0.6;
          if (Math.abs(p.vy) > 3 && this.blood) this.bleed(p.x, 6, 3, Math.sign(p.vx) || 1, 0.4);
          p.vy = -p.vy * 0.28;
          p.vx *= 0.6;
          p.va *= 0.5;
          if (Math.abs(p.vy) < 1.2) { p.vy = 0; p.rest += 0.05 * k; }
        }
        if (this.blood && !p.ash && Math.random() < 0.3) this.add({ kind: 'blood', x: p.x, y: p.y, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 2, life: 60, max: 60, size: 1.6 + Math.random() * 2, g: 0.5 });
      }
      g.save();
      g.translate(p.x, -p.y);
      if (p.fade != null) g.globalAlpha = Math.max(0, p.fade);
      g.rotate(-p.ang);
      if (p.flat && p.flat < 1) g.scale(1, p.flat);
      if (p.head) {
        g.beginPath(); g.arc(0, 0, p.r, 0, Math.PI * 2);
        g.fillStyle = p.color; g.fill();
      } else {
        const hl = p.len / 2;
        g.beginPath();
        g.moveTo(-hl, -p.r); g.lineTo(hl, -p.r * 0.85);
        g.arc(hl, 0, p.r * 0.85, -Math.PI / 2, Math.PI / 2);
        g.lineTo(-hl, p.r);
        g.arc(-hl, 0, p.r, Math.PI / 2, -Math.PI / 2);
        const gr = g.createLinearGradient(0, -p.r, 0, p.r);
        gr.addColorStop(0, tint(p.color, 0.2));
        gr.addColorStop(0.6, p.color);
        gr.addColorStop(1, shade(p.color, 0.5));
        g.fillStyle = gr;
        g.fill();
        // the wound
        g.fillStyle = p.ash ? '#ff6a1a' : '#7a0410';
        g.beginPath(); g.ellipse(hl + p.r * 0.5, 0, p.r * 0.3, p.r * 0.8, 0, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }
  }

  drawProjectiles(g, match, t) {
    for (const p of match.projectiles) {
      const col = projColor(p.kind);
      const dir = Math.sign(p.vx) || 1;
      if (p.kind === 'pillar') {
        g.save();
        g.globalCompositeOperation = 'lighter';
        if (p.age < p.delay) {             // the warning: a glyph burning on the floor
          const pulse = 0.5 + 0.5 * Math.sin(p.age * 0.6);
          g.translate(p.x, -2);
          g.scale(1, 0.22);
          g.drawImage(glowSprite(col, 128), -110, -110, 220, 220);
          g.strokeStyle = rgba(col, 0.4 + pulse * 0.5);
          g.lineWidth = 8;
          g.beginPath(); g.arc(0, 0, 70 + pulse * 10, 0, Math.PI * 2); g.stroke();
        } else {
          const live = (p.age - p.delay) / (p.life + p.age - p.delay || 1);
          const h = 340 * Math.min(1, (p.age - p.delay) / 4);
          const gr = g.createLinearGradient(p.x - 60, 0, p.x + 60, 0);
          gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.5, rgba('#f0d0ff', 0.9 - live * 0.4)); gr.addColorStop(1, rgba(col, 0));
          g.fillStyle = gr;
          g.fillRect(p.x - 60, -h, 120, h);
          g.drawImage(glowSprite(col, 128), p.x - 150, -h * 0.6 - 150, 300, 300);
          if (Math.random() < 0.8) this.add({ kind: 'glow', x: p.x + (Math.random() - 0.5) * 70, y: Math.random() * h, vx: 0, vy: 5, life: 20, max: 20, color: col, size: 0.8 });
        }
        g.restore();
        continue;
      }
      if (p.kind === 'blade') {             // a spinning crescent of wind-steel
        g.save();
        g.translate(p.x, -p.y);
        g.scale(dir, 1);
        for (let i = 3; i >= 0; i--) {
          g.save();
          g.translate(-i * 22, 0);
          g.globalAlpha = i ? 0.25 / i : 1;
          g.globalCompositeOperation = 'lighter';
          g.beginPath();
          g.arc(0, 0, 38, -1.2, 1.2);
          g.arc(-14, 0, 32, 1.05, -1.05, true);
          g.closePath();
          const gr = g.createLinearGradient(-20, 0, 38, 0);
          gr.addColorStop(0, rgba(col, 0.2)); gr.addColorStop(1, '#ffffff');
          g.fillStyle = gr;
          g.fill();
          g.restore();
        }
        g.globalCompositeOperation = 'lighter';
        g.drawImage(glowSprite(col, 64), -60, -60, 120, 120);
        g.restore();
        continue;
      }
      if (p.kind === 'kunai') {
        g.save();
        g.translate(p.x, -p.y);
        g.scale(dir, 1);
        g.globalCompositeOperation = 'lighter';
        const tr = g.createLinearGradient(-110, 0, 0, 0);
        tr.addColorStop(0, rgba(col, 0)); tr.addColorStop(1, rgba(col, 0.6));
        g.fillStyle = tr;
        g.fillRect(-110, -3, 110, 6);
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = '#2a3036';
        g.beginPath(); g.moveTo(26, 0); g.lineTo(4, -7); g.lineTo(-14, -2); g.lineTo(-14, 2); g.lineTo(4, 7); g.closePath(); g.fill();
        g.strokeStyle = '#9aa6b0'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(24, 0); g.lineTo(-10, 0); g.stroke();
        g.fillStyle = '#3f8f5a'; g.fillRect(-26, -2.5, 12, 5);
        g.restore();
        continue;
      }
      if (p.kind === 'rock') {
        g.save();
        g.translate(p.x, -p.y);
        g.rotate(p.age * 0.22 * dir);
        const r = 30;
        const gr = g.createRadialGradient(-r * 0.3, -r * 0.35, 2, 0, 0, r * 1.1);
        gr.addColorStop(0, '#9a8e7e'); gr.addColorStop(0.6, '#5a5046'); gr.addColorStop(1, '#221e1a');
        g.fillStyle = gr;
        g.beginPath();
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, rr = r * (0.8 + 0.2 * Math.sin(i * 2.7)); g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        g.closePath();
        g.fill();
        g.restore();
        if (Math.random() < 0.4) this.add({ kind: 'dust', x: p.x, y: p.y, vx: 0, vy: 0, life: 20, max: 20, size: 12, color: '#7a6a5a' });
        continue;
      }
      if (p.kind === 'bolt') {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.drawImage(glowSprite(col, 128), p.x - 70, -p.y - 70, 140, 140);
        g.drawImage(glowSprite('#ffffff', 64), p.x - 18, -p.y - 18, 36, 36);
        g.strokeStyle = rgba('#e8fdff', 0.9);
        g.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          let x = p.x, y = -p.y;
          const a0 = Math.random() * Math.PI * 2;
          g.beginPath(); g.moveTo(x, y);
          for (let s2 = 0; s2 < 4; s2++) { x += Math.cos(a0) * 10 + (Math.random() - 0.5) * 12; y += Math.sin(a0) * 10 + (Math.random() - 0.5) * 12; g.lineTo(x, y); }
          g.stroke();
        }
        g.restore();
        continue;
      }
      if (p.kind === 'quake') {
        if (Math.random() < 0.7) this.add({ kind: 'shard', x: p.x + (Math.random() - 0.5) * 30, y: 6, vx: (Math.random() - 0.5) * 4, vy: 5 + Math.random() * 7, life: 40, max: 40, size: 5 + Math.random() * 8, color: '#5a4a3c', ang: 0, g: 0.6 });
        if (Math.random() < 0.5) this.dust(p.x, 1, 0.8);
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.drawImage(glowSprite('#ff8a3c', 64), p.x - 60, -40, 120, 50);
        g.restore();
        g.fillStyle = '#3a2a20';
        for (let i = 0; i < 4; i++) {
          const x = p.x - p.vx * i * 2;
          const h = (40 - i * 8) * (0.8 + 0.2 * Math.sin(t * 40 + i));
          g.beginPath(); g.moveTo(x - 12, 0); g.lineTo(x - 2, -h); g.lineTo(x + 12, 0); g.fill();
        }
        continue;
      }
      for (let i = 0; i < 2; i++) this.add({ kind: 'glow', x: p.x - dir * 10, y: p.y + (Math.random() - 0.5) * 20, vx: -dir * (1 + Math.random() * 2), vy: (Math.random() - 0.5) * 1.5, life: 22, max: 22, color: col, size: 0.9 });
      g.save();
      g.globalCompositeOperation = 'lighter';
      const pulse = 1 + 0.12 * Math.sin(t * 40);
      g.drawImage(glowSprite(col, 128), p.x - 90 * pulse, -p.y - 90 * pulse, 180 * pulse, 180 * pulse);
      g.drawImage(glowSprite('#ffffff', 64), p.x - 22, -p.y - 22, 44, 44);
      // tongues of flame / void tendrils trailing behind
      g.fillStyle = rgba(col, 0.55);
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        const wv = Math.sin(t * 25 + i * 2) * 8;
        g.moveTo(p.x + dir * 18, -p.y);
        g.quadraticCurveTo(p.x - dir * 30, -p.y - 22 + wv + i * 10, p.x - dir * (70 + i * 12), -p.y + wv * 0.6 - 10 + i * 10);
        g.quadraticCurveTo(p.x - dir * 30, -p.y + 10 + wv, p.x + dir * 18, -p.y);
        g.fill();
      }
      g.restore();
    }
  }

  /* --------------------------------------------------------------- HUD */
  drawHud(g, match, hud, dt) {
    const vw = this.viewW;
    const [a, b] = match.fighters;
    const pad = Math.max(24, hud.inset || 0);
    const barW = Math.min(520, vw * 0.36);
    const barH = 26;
    const top = 30;
    for (const f of [a, b]) {
      const H = this.hp[f.side];
      const hp = f.hp / f.maxHp * MAX_HP;
      if (hp < H.shown) { H.shown = hp; H.wait = 0.5; }
      if (hp > H.shown) H.shown = H.trail = hp;
      H.wait -= dt;
      if (H.wait <= 0) H.trail = Math.max(H.shown, H.trail - dt * 900);
      const x = f.side === 0 ? pad : vw - pad - barW;
      this.healthBar(g, x, top, barW, barH, H.shown / MAX_HP, H.trail / MAX_HP, f.side === 1);
      g.font = `italic 900 22px ${FONT}`;
      g.textBaseline = 'top';
      g.textAlign = f.side === 0 ? 'left' : 'right';
      textOutlined(g, f.def.name, f.side === 0 ? x + 4 : x + barW - 4, top + barH + 8, '#ffffff', 4);
      // round medals
      for (let i = 0; i < 2; i++) {
        const mx = f.side === 0 ? x + barW - 14 - i * 30 : x + 14 + i * 30;
        medal(g, mx, top + barH + 22, i < f.wins);
      }
      const c = this.combo[f.side];
      if (c.t > 0) {
        c.t -= dt * 60;
        const al = Math.min(1, c.t / 20);
        g.save();
        g.globalAlpha = al;
        g.font = `italic 900 ${34}px ${FONT}`;
        g.textAlign = f.side === 0 ? 'left' : 'right';
        textOutlined(g, `${c.n} HIT COMBO`, f.side === 0 ? pad : vw - pad, 150, '#ffd25a', 6);
        g.restore();
      }
    }
    // timer
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 54px ${FONT}`;
    const tcol = match.timer <= 10 && match.phase === 'fight' ? '#ff4a4a' : '#ffe9b0';
    textOutlined(g, String(match.timer).padStart(2, '0'), vw / 2, top + 22, tcol, 6, true);
    if (hud.label) {
      g.font = `800 15px ${FONT}`;
      textOutlined(g, hud.label, vw / 2, top + 66, '#e8d6c0', 4);
    }

    // announcer
    const an = this.announce[0];
    if (an) {
      an.t += dt * 60;
      if (an.t >= 0) {
        const dur = { round: 60, fight: 50, finish: 120, exec: 150, wins: 130, perfect: 90, time: 90 }[an.kind] || 80;
        const k = an.t;
        const sIn = Math.min(1, k / 9);
        const scale = 1.8 - 0.8 * (1 - Math.pow(1 - sIn, 3));
        const alpha = Math.min(1, k / 5) * Math.min(1, (dur - k) / 12);
        const size = { fight: 120, exec: 104, finish: 96, perfect: 86 }[an.kind] || 84;
        const colA = an.kind === 'exec' || an.kind === 'finish' ? '#ff5a5a' : '#fff1b8';
        const colB = an.kind === 'exec' || an.kind === 'finish' ? '#8a0010' : '#d4741a';
        g.save();
        g.globalAlpha = clamp(alpha, 0, 1);
        g.translate(vw / 2, an.kind === 'perfect' ? 360 : 282);
        g.scale(scale, scale);
        g.font = `italic 900 ${size}px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineJoin = 'round';
        g.lineWidth = 14;
        g.strokeStyle = 'rgba(10,2,4,0.9)';
        g.strokeText(an.text, 0, 0);
        const gr = g.createLinearGradient(0, -size / 2, 0, size / 2);
        gr.addColorStop(0, '#ffffff');
        gr.addColorStop(0.35, colA);
        gr.addColorStop(1, colB);
        g.fillStyle = gr;
        g.shadowColor = colA;
        g.shadowBlur = 24;
        g.fillText(an.text, 0, 0);
        if (an.sub) {
          g.font = `italic 900 ${Math.round(size * 0.42)}px ${FONT}`;
          g.shadowBlur = 0;
          g.lineWidth = 8;
          g.strokeText(an.sub, 0, size * 0.78);
          g.fillStyle = '#ffd25a';
          g.fillText(an.sub, 0, size * 0.78);
        }
        g.restore();
        if (k >= dur) this.announce.shift();
      }
    }
    if (hud.prompt) {
      const al = 0.6 + 0.4 * Math.sin(this.time * 8);
      g.save();
      g.globalAlpha = al;
      g.font = `900 26px ${FONT}`;
      g.textAlign = 'center';
      textOutlined(g, hud.prompt, vw / 2, 400, '#ffd25a', 6);
      g.restore();
    }
  }

  healthBar(g, x, y, w, h, v, trail, mirror) {
    g.save();
    // frame
    const fr = g.createLinearGradient(0, y - 6, 0, y + h + 6);
    fr.addColorStop(0, '#f5d58a');
    fr.addColorStop(0.5, '#8a5a1a');
    fr.addColorStop(1, '#3a2208');
    g.fillStyle = fr;
    roundRect(g, x - 5, y - 5, w + 10, h + 10, 7);
    g.fill();
    g.fillStyle = '#1a070b';
    roundRect(g, x, y, w, h, 4);
    g.fill();
    g.save();
    roundRect(g, x, y, w, h, 4);
    g.clip();
    const fillW = (k) => w * clamp(k, 0, 1);
    // damage trail
    g.fillStyle = '#c4122f';
    if (mirror) g.fillRect(x + w - fillW(trail), y, fillW(trail), h);
    else g.fillRect(x, y, fillW(trail), h);
    // health
    const hg = g.createLinearGradient(0, y, 0, y + h);
    const low = v < 0.25;
    hg.addColorStop(0, low ? '#ffd0a0' : '#fff0a8');
    hg.addColorStop(0.45, low ? '#ff7a2a' : '#f2b631');
    hg.addColorStop(1, low ? '#b0300a' : '#a8620a');
    g.fillStyle = hg;
    if (mirror) g.fillRect(x + w - fillW(v), y, fillW(v), h);
    else g.fillRect(x, y, fillW(v), h);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(x, y + 2, w, h * 0.28);
    g.restore();
    g.restore();
  }
}

function projColor(kind) {
  return { fire: '#ff9a2e', void: '#c04dff', blade: '#cfe6ff', bolt: '#5ff0ff', kunai: '#7dff8a', rock: '#a08a70', pillar: '#c04dff' }[kind] || '#ff8a3c';
}

function makeLayer(w, _unused, scale, draw, transparent = false) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * scale));
  canvas.height = Math.max(1, Math.ceil(VIEW_H * scale));
  const g = canvas.getContext('2d');
  g.scale(scale, scale);
  draw(g);
  return { canvas };
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function textOutlined(g, text, x, y, fill, lw, metal = false) {
  g.lineJoin = 'round';
  g.lineWidth = lw;
  g.strokeStyle = 'rgba(8,2,4,0.92)';
  g.strokeText(text, x, y);
  if (metal) {
    const gr = g.createLinearGradient(0, y - 24, 0, y + 24);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.5, fill);
    gr.addColorStop(1, shade(fill, 0.45));
    g.fillStyle = gr;
  } else g.fillStyle = fill;
  g.fillText(text, x, y);
}

function medal(g, x, y, on) {
  g.beginPath();
  g.arc(x, y, 10, 0, Math.PI * 2);
  const gr = g.createRadialGradient(x - 3, y - 3, 1, x, y, 10);
  gr.addColorStop(0, on ? '#fff3c0' : '#4a3a3a');
  gr.addColorStop(1, on ? '#c4122f' : '#1a1012');
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = on ? '#ffd25a' : '#6a5040';
  g.stroke();
}

/* ------------------------------------------------- portraits & previews */
const cards = new WeakMap();
export function drawCard(canvas, id, opts = {}) {
  const def = FIGHTERS[id];
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  let f = cards.get(canvas);
  if (!f || f.def !== def) {
    const body = scaledBody(def);
    f = { def, body, skel: {}, x: 0, y: 0, facing: opts.facing || 1, flash: 0, alpha: 1, side: 0, state: 'idle', vx: 0, trail: [] };
    cards.set(canvas, f);
  }
  f.facing = opts.facing || 1;
  const t = opts.t || 0;
  const k = (Math.sin(t * 5) + 1) / 2;
  const p = {};
  for (const key in POSES.stance) p[key] = POSES.stance[key] + (POSES.stance2[key] - POSES.stance[key]) * k;
  if (opts.pose) Object.assign(p, POSES[opts.pose]);
  p.oy = groundOffset(p, f.body);
  solve(p, f.body, f.skel);
  const st = STAGES[def.home];
  const light = { key: st.key, rim: st.rim, ambient: st.ambient };

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  if (opts.bg !== false) {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, shade(st.ambient, 0.2));
    bg.addColorStop(1, mix(st.rim, '#000000', 0.7));
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    g.drawImage(glowSprite(def.element.glow, 128), W * 0.1, H * 0.05, W * 0.8, W * 0.8);
    g.globalCompositeOperation = 'source-over';
  }
  const full = opts.full;
  const sc = full ? (H * 0.82) / (320 * def.scale) * Math.min(1.12, def.scale) : (H / 150);
  g.translate(W / 2, full ? H * 0.93 : H * 1.9 + (def.scale - 1) * H * 1.4);
  g.scale(sc, sc);
  if (full) drawShadow(g, f, light);
  drawFighter(g, f, light, { time: t });
}
