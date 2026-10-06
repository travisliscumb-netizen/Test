/* Frame composition: sky -> parallax layers -> lights -> floor -> blood
   splats -> reflections -> shadows -> fighters -> projectiles ->
   particles -> weather -> grade/vignette -> HUD.

   The canvas backing store is sized to the screen's real pixels (capped so
   fill rate stays sane on phones); everything is drawn in a 720-tall
   logical space scaled by R.                                            */

import { GROUND_Y, STAGE_W, STAGES, FIGHTERS, MAX_HP, clamp, VIEW_H } from './config.js';
import { STAGE_ART, drawFloor, drawLights, drawWeather, HORIZON } from './stages.js';
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
    this.layers = this.art.layers.map((L) => {
      const w = Math.ceil(vw + (STAGE_W - vw) * L.f);
      return { f: L.f, w, ...makeLayer(w, 1, this.R * L.q, (g) => L.draw(g, w)) };
    });
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
        case 'special': if (e.kind === 'dash') this.flashScreen(0.18, e.f.def.element.glow); break;
        case 'ko':
          this.shake(0.9);
          this.flashScreen(0.7, '#ffffff');
          if (this.blood) this.bleed(e.f.x, e.f.y + 170 * e.f.body.scale, 40, Math.sign(e.f.x - e.att.x) || 1, 1.4);
          break;
        case 'finisher': this.darkTarget = 0.62; break;
        case 'shatter': this.shatter(e.f, e.att); break;
        case 'announce':
          // a banner that could not be shown in time (a stall, a backgrounded tab) is stale: drop it
          this.announce = this.announce.filter((a) => this.time - a.at < 2.5);
          this.announce.push({ text: e.text, kind: e.kind, t: -(e.delay || 0), at: this.time });
          break;
        case 'round': this.darkTarget = 0; this.dark = 0; this.pieces.length = 0; break;
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

  /* Dismantles the loser's last pose into flying body pieces. */
  shatter(f, att) {
    const W = (k) => [f.x + f.skel[k][0] * f.facing, f.y + f.skel[k][1]];
    const segs = [
      ['hip', 'neck', 26, 'torso'], ['neck', 'head', f.body.head, 'head'],
      ['shF', 'elF', 12, 'arm'], ['elF', 'hf', 10, 'fore'], ['shB', 'elB', 12, 'arm'], ['elB', 'hb', 10, 'fore'],
      ['hipF', 'knF', 17, 'leg'], ['knF', 'anF', 12, 'leg'], ['hipB', 'knB', 17, 'leg'], ['knB', 'anB', 12, 'leg']
    ];
    const el = att.def.element;
    const L = f.def.look;
    const dir = Math.sign(f.x - att.x) || 1;
    this.flashScreen(0.9, el.glow);
    this.shake(1);
    if (this.blood) {
      for (const [a, b, r, part] of segs) {
        const A = W(a), B = W(b);
        const cx = (A[0] + B[0]) / 2, cy = (A[1] + B[1]) / 2;
        const color = part === 'head' ? (L.hair.style === 'mask' ? L.mask : L.skin) : part === 'torso' ? (L.top === 'robe' || L.top === 'gi' || L.top === 'stone' ? L.skin : L.topColor) : part === 'leg' ? (L.stone ? L.skin : L.pants) : part === 'fore' ? (L.wraps || L.gloves || L.skin) : (L.sleeve === 'long' ? L.topColor : L.skin);
        this.pieces.push({
          x: cx, y: cy, len: Math.hypot(B[0] - A[0], B[1] - A[1]), r: r * f.body.scale,
          ang: Math.atan2(B[1] - A[1], B[0] - A[0]), va: (Math.random() - 0.5) * 0.5,
          vx: dir * (1.5 + Math.random() * 5) + (Math.random() - 0.5) * 5, vy: 6 + Math.random() * 13,
          color, head: part === 'head', rest: 0
        });
      }
      this.bleed(f.x, f.y + 150, 90, dir, 1.6);
      this.bleed(f.x, f.y + 150, 60, -dir, 1.2);
    }
    // the element itself
    for (let i = 0; i < 70; i++) {
      const y = f.y + Math.random() * 280 * f.body.scale;
      this.add({ kind: 'glow', x: f.x + (Math.random() - 0.5) * 120, y, vx: (Math.random() - 0.5) * 8, vy: 2 + Math.random() * 8, life: 50 + Math.random() * 40, max: 90, color: el.glow, size: 1.6 });
    }
    if (el.name === 'lightning' || el.name === 'void') this.bolts(f.x, f.y + 150, el.glow);
    if (el.name === 'stone') for (let i = 0; i < 26; i++) this.add({ kind: 'shard', x: f.x + (Math.random() - 0.5) * 80, y: 10, vx: (Math.random() - 0.5) * 12, vy: 8 + Math.random() * 14, life: 80, max: 80, size: 8 + Math.random() * 12, color: '#5a554e', ang: Math.random() * 6, g: 0.6 });
    if (el.name === 'shadow') this.smoke(f.x, 260, '#1c2a20');
    this.ring(f.x, f.y + 150, el.glow, 260);
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

    g.save();
    g.translate(shx, shy);
    drawFloor(g, this.art, vw, cam.x, camY, t);
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
      for (const f of order) if (!f.hidden) drawFighter(g, f, this.light, { time: t, alpha: this.reflect, chains: false });
      g.restore();
      g.fillStyle = 'rgba(0,0,0,0.15)';
    }
    for (const f of fs) if (f.state !== 'gone') drawShadow(g, f, this.light);
    for (const f of order) {
      if (f.hidden) continue;
      for (let i = f.trail.length - 1; i >= 1; i--) {
        const tr = f.trail[i];
        drawFighter(g, { ...f, skel: tr.skel, x: tr.x, y: tr.y, facing: tr.facing, alpha: 1 }, this.light, { silhouette: rgba(f.def.element.glow, 0.5), alpha: 0.35 * (1 - i / f.trail.length), chains: false });
      }
      drawFighter(g, f, this.light, { time: t });
    }
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
        if (this.blood && Math.random() < 0.3) this.add({ kind: 'blood', x: p.x, y: p.y, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 2, life: 60, max: 60, size: 1.6 + Math.random() * 2, g: 0.5 });
      }
      g.save();
      g.translate(p.x, -p.y);
      g.rotate(-p.ang);
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
        g.fillStyle = '#7a0410';
        g.beginPath(); g.ellipse(hl + p.r * 0.5, 0, p.r * 0.3, p.r * 0.8, 0, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }
  }

  drawProjectiles(g, match, t) {
    for (const p of match.projectiles) {
      const col = projColor(p.kind);
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
      const dir = Math.sign(p.vx);
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
  return kind === 'fire' ? '#ff9a2e' : kind === 'void' ? '#c04dff' : '#ff8a3c';
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
