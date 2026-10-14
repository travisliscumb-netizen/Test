/* Survivability: the 3x health pool (300 at Constitution 0, +60 a level), a handgun needs 10-12 body
   hits, the vest is a separate layer that soaks 75% of each hit until it is spent, regeneration, and a
   real gunfight against three AI gangsters lasting about three times as long as the original fire
   model allowed. Measured on the original build in this exact setup: 17-18 s (14-16 hits of 5-9 on
   100 health, each shooter firing every ~1.4 s at ~44%); this build: ~53 s mean over repeated runs.
   Single fights vary a lot (cover, line of sight), so the floor checked here is 2x on a 4-fight mean. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch();
const t = await open(b, {});
const page = t.page;
const ev = (f, a) => page.evaluate(f, a);
await startNew(page);
const quiet = () => ev(() => { const g = window.game; g.quality.setMode(0); g.events.cool = 1e9; g.police.enabled = false; g.traffic.enabled = false; g.police.clear(); });
await quiet();

// ---------------------------------------------------------------- 1. the pool
const pool = await ev(() => {
  const g = window.game, p = g.player, s = g.save, P = window.__pv;
  const lv = s.skills ? s.skills.health : undefined;
  return { max: p.maxHealth, base: P.HP_BASE, vestMax: P.VEST_MAX, lv };
});
check('health pool: 300 at the start (3x the old 100)', pool.max === 300 && pool.base === 300, JSON.stringify(pool));

// ---------------------------------------------------------------- 2. hits to kill (the real damage function)
const hits = await ev(() => {
  const g = window.game, p = g.player, P = window.__pv, out = { bare: [], vest: [], exact: true };
  const real = p.game.onPlayerDeath; p.game.onPlayerDeath = () => { p.__dead = true; };
  const trial = (vest, d) => { p.health = p.maxHealth; p.vest = vest; p.__dead = false; p.invuln = 0; let n = 0; while (!p.__dead && n < 100) { const h0 = p.health, v0 = p.vest, dm = P.npcGunDamage('pistol', d); p.damage(dm, 'gang'); n++; if (!vest && Math.abs(h0 - Math.max(0, p.health) - Math.min(dm, h0)) > 1e-6) out.exact = false; if (vest && v0 > 0 && p.vest > 0 && Math.abs((v0 - p.vest) - dm * 0.75) > 1e-6) out.exact = false; } return n; };
  for (let i = 0; i < 300; i++) out.bare.push(trial(0, 4 + (i % 4) * 4));
  for (let i = 0; i < 100; i++) out.vest.push(trial(P.VEST_MAX, 10));
  p.game.onPlayerDeath = real; p.health = p.maxHealth; p.vest = 0;
  const sum = a => a.reduce((x, y) => x + y, 0);
  return { bareMin: Math.min(...out.bare), bareMax: Math.max(...out.bare), bareAvg: sum(out.bare) / out.bare.length, vestMin: Math.min(...out.vest), vestMax: Math.max(...out.vest), vestAvg: sum(out.vest) / out.vest.length, exact: out.exact };
});
check('a handgun needs 10-12 body hits at combat range (4-16 m)', hits.bareMin >= 10 && hits.bareMax <= 12, JSON.stringify(hits));
check('damage goes straight to health without a vest; a vest takes 75% of each hit while it lasts', hits.exact);
check('a full vest adds about six hits (16-19 to kill)', hits.vestMin >= 15 && hits.vestMax <= 19 && hits.vestAvg - hits.bareAvg > 4.5, JSON.stringify([hits.vestAvg, hits.bareAvg]));

// ---------------------------------------------------------------- 3. regeneration after a fight
const regen = await ev(async () => {
  const g = window.game, p = g.player; p.health = 120; p.regenDelay = 0.5; const h0 = p.health, t0 = g.time;
  await new Promise(r => { const iv = setInterval(() => { if (g.time - t0 > 6) { clearInterval(iv); r(); } }, 50); });
  return { h0, h1: p.health, cap: p.maxHealth * 0.65 };
});
check('health regenerates out of combat (to 65%)', regen.h1 > regen.h0 + 30 && regen.h1 <= regen.cap + 1e-6, JSON.stringify(regen));

// ---------------------------------------------------------------- 4. a real gunfight: three AI gangsters at 12 m
const fight = async (k) => {
  const r = await ev(async (k) => {
    const g = window.game, p = g.player, uw = g.uw;
    p.health = p.maxHealth; p.vest = 0; p.vel.set(0, 0, 0);
    for (const gr of [...uw.gangs.groups.values()]) uw.gangs.removeGroup(gr, true);
    const fid = Object.keys(uw.S.factions)[0], x = p.pos.x, z = p.pos.z;
    const gr = uw.gangs.spawnGroup('fight' + k, 'hang', fid, { x: x + 12, z: z + 2, h: -Math.PI / 2 }, 3);
    for (const m of gr.members) { m.gun = true; m.bat = false; m.pose.hold = null; m.skill = 0.45; }
    gr.hostile = true; gr.warned = 99;
    let hitsTaken = 0; const dmg = p.damage.bind(p); p.damage = (a, s) => { hitsTaken++; return dmg(a, s); };
    const t0 = g.time;
    await new Promise(res => { const iv = setInterval(() => { if (p.health <= 0 || g.state !== 'playing' || g.time - t0 > 200) { clearInterval(iv); res(); } }, 50); });
    p.damage = dmg;
    const out = { ttk: g.time - t0, hits: hitsTaken, died: p.health <= 0 || g.state !== 'playing' };
    for (const gr2 of [...uw.gangs.groups.values()]) uw.gangs.removeGroup(gr2, true);
    return out;
  }, k);
  await page.waitForFunction(() => window.game.state === 'playing' && !window.game.fading && window.game.player.health > 0, null, { timeout: 180000, polling: 200 });
  await quiet(); await frames(page, 10);
  return r;
};
const fights = [];
for (let k = 0; k < 4; k++) fights.push(await fight(k));
const meanTTK = fights.reduce((a, f) => a + f.ttk, 0) / fights.length;
check('three gangsters at 12 m: you last far longer than the original 17-18 s (mean of 4 fights >= 35 s)', meanTTK >= 35 && fights.every(f => f.died), JSON.stringify(fights.map(f => ({ ttk: +f.ttk.toFixed(1), hits: f.hits }))));
check('...and it is still a fight: they do kill a player who stands still (mean under 90 s)', meanTTK < 90, meanTTK.toFixed(1));

// ---------------------------------------------------------------- 5. after a death: full health, vest gone
const after = await ev(() => { const p = window.game.player; return { h: p.health, max: p.maxHealth, vest: p.vest }; });
check('respawn: full health, no vest', after.h === after.max && after.vest === 0, JSON.stringify(after));

check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
await finish(b, 'survival');
