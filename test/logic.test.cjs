'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/logic.js');

/* ------------------------------------------------------------------ *
 * Levels & worlds
 * ------------------------------------------------------------------ */

test('there are 100 levels in 10 worlds of 10', () => {
  assert.equal(L.TOTAL_LEVELS, 100);
  assert.equal(L.WORLDS.length, 10);
  for (let lvl = 1; lvl <= 100; lvl++) {
    assert.equal(L.worldOf(lvl), Math.ceil(lvl / 10), 'world of ' + lvl);
    assert.ok(L.levelInWorld(lvl) >= 1 && L.levelInWorld(lvl) <= 10);
  }
  assert.equal(L.worldOf(1), 1);
  assert.equal(L.worldOf(10), 1);
  assert.equal(L.worldOf(11), 2);
  assert.equal(L.worldOf(100), 10);
});

test('BUG 3: a boss level appears on every 10th level and nowhere else', () => {
  const bosses = [];
  for (let lvl = 1; lvl <= 100; lvl++) if (L.isBossLevel(lvl)) bosses.push(lvl);
  assert.deepEqual(bosses, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  for (let lvl = 1; lvl <= 100; lvl++) {
    assert.equal(L.levelConfig(lvl).isBoss, lvl % 10 === 0, 'cfg.isBoss for ' + lvl);
  }
});

test('BUG 4: boss target heights are exactly 10,20,30...100', () => {
  for (let lvl = 10; lvl <= 100; lvl += 10) {
    assert.equal(L.bossTarget(lvl), lvl);
    assert.equal(L.levelConfig(lvl).bossTarget, lvl);
    assert.equal(L.levelGoal(lvl), lvl);
  }
  for (let lvl = 1; lvl <= 100; lvl++) {
    if (lvl % 10 !== 0) assert.equal(L.bossTarget(lvl), 0, 'non-boss ' + lvl);
  }
});

test('normal levels have fixed stack goals that never shrink', () => {
  let prev = 0;
  for (let lvl = 1; lvl <= 100; lvl++) {
    const c = L.levelConfig(lvl);
    if (c.isBoss) continue;
    assert.ok(c.goal >= 5, 'level ' + lvl + ' goal >= 5');
    assert.ok(c.goal >= prev, 'goal must not decrease at ' + lvl);
    assert.equal(c.goal, Math.round(c.goal));
    prev = c.goal;
  }
  assert.equal(L.levelConfig(1).goal, 5);
  assert.ok(L.levelConfig(99).goal >= 15);
});

test('difficulty rises smoothly and never spikes', () => {
  let prevSpeed = 0, prevWindow = Infinity, prevSize = Infinity, prevSway = -1;
  for (let lvl = 1; lvl <= 100; lvl++) {
    const c = L.levelConfig(lvl);
    // compare like-for-like: boss levels have their own (gentler) curve
    if (!c.isBoss) {
      assert.ok(c.speed >= prevSpeed - 1e-9, 'speed monotonic at ' + lvl);
      // difficulty of a perfect drop is the TIME window, not the distance:
      // the distance grows with speed, the window the player has does not
      assert.ok(c.perfectWindow <= prevWindow + 1e-9, 'perfect window tightens at ' + lvl);
      assert.ok(c.baseSize <= prevSize + 1e-9, 'start size shrinks at ' + lvl);
      assert.ok(c.sway >= prevSway - 1e-9, 'movement variation grows at ' + lvl);
      // no single level may be more than 12% faster than the one before it
      if (prevSpeed > 0) assert.ok(c.speed / prevSpeed < 1.12, 'no speed spike at ' + lvl);
      prevSpeed = c.speed; prevWindow = c.perfectWindow; prevSize = c.baseSize; prevSway = c.sway;
    }
    assert.ok(c.speed > 0 && c.perfectTol > 0 && c.baseSize > 1.5);
    assert.ok(c.perfectWindow >= 0.017 && c.perfectWindow <= 0.13,
      'perfect window stays inside human reaction limits at ' + lvl + ' (' + c.perfectWindow + 's)');
    // movement variation can never stop or reverse the slide
    assert.ok(c.sway < 0.9, 'sway keeps velocity positive at ' + lvl);
  }
  assert.ok(L.levelConfig(100).speed > L.levelConfig(10).speed, 'late bosses are faster');
  assert.ok(L.levelConfig(99).speed > L.levelConfig(1).speed * 2.5, 'endgame much faster');
});

test('boss slide speed ramps with height but stays capped', () => {
  const c = L.levelConfig(50);
  assert.ok(L.speedAt(c, 0) === c.speed);
  assert.ok(L.speedAt(c, 25) > L.speedAt(c, 0));
  assert.ok(L.speedAt(c, 1e6) <= c.speed * (1 + c.speedRampMax) + 1e-9);
  const n = L.levelConfig(45);
  assert.equal(L.speedAt(n, 99), n.speed, 'normal levels do not ramp mid-level');
});

/* ------------------------------------------------------------------ *
 * Drop resolution
 * ------------------------------------------------------------------ */

const drop = (movingPos, movingSize, anchorPos, anchorSize, tol) =>
  L.resolveDrop({ movingPos, movingSize, anchorPos, anchorSize, perfectTol: tol == null ? 0.2 : tol });

test('overhang is sliced off and the remainder inherits the smaller size', () => {
  const r = drop(1, 4, 0, 4);
  assert.equal(r.missed, false);
  assert.equal(r.perfect, false);
  assert.equal(r.size, 3);              // 4 wide, 1 off centre -> 3 left
  assert.equal(r.pos, 0.5);             // centre of the overlap
  assert.equal(r.slices.length, 1);
  assert.equal(r.slices[0].size, 1);
  assert.equal(r.slices[0].pos, 2.5);   // the cut-off piece sits outside
});

test('slicing is symmetric on both sides', () => {
  const a = drop(-1.5, 4, 0, 4);
  assert.equal(a.size, 2.5);
  assert.equal(a.pos, -0.75);
  assert.equal(a.slices[0].size, 1.5);
  assert.ok(a.slices[0].pos < a.pos);
});

test('a perfect drop keeps the full size and snaps to the anchor', () => {
  const r = drop(0.1, 4, 0, 4, 0.2);
  assert.equal(r.perfect, true);
  assert.equal(r.size, 4);
  assert.equal(r.pos, 0);
  assert.equal(r.slices.length, 0);
});

test('tolerance is inclusive at the edge and excludes just beyond', () => {
  assert.equal(drop(0.2, 4, 0, 4, 0.2).perfect, true);
  assert.equal(drop(0.2001, 4, 0, 4, 0.2).perfect, false);
});

test('no overlap is a miss', () => {
  const r = drop(4, 4, 0, 4);
  assert.equal(r.missed, true);
  assert.equal(r.reason, 'miss');
  assert.equal(r.size, 0);
  const r2 = drop(-9, 2, 0, 2);
  assert.equal(r2.missed, true);
});

test('a remainder thinner than the minimum topples the tower', () => {
  const r = L.resolveDrop({ movingPos: 3.8, movingSize: 4, anchorPos: 0, anchorSize: 4,
                            perfectTol: 0.1, minSize: 0.34 });
  assert.equal(r.missed, true);
  assert.equal(r.reason, 'sliver');
});

test('a block wider than its anchor is sliced on both sides', () => {
  const r = drop(0.5, 5, 0, 3, 0.1);
  assert.equal(r.missed, false);
  assert.equal(r.perfect, false);
  assert.equal(r.size, 3);            // clipped to the anchor on both sides
  assert.equal(r.pos, 0);
  assert.equal(r.slices.length, 2);
  assert.equal(r.slices[0].size, 0.5);
  assert.equal(r.slices[1].size, 1.5);

  // aligned and oversized is a perfect drop: the recovered width is kept
  const keep = drop(0, 5, 0, 3, 0.1);
  assert.equal(keep.perfect, true);
  assert.equal(keep.size, 5);
});

test('slices always account for exactly the lost material', () => {
  for (let i = 0; i < 500; i++) {
    const anchorSize = 0.6 + Math.random() * 3.6;
    const movingSize = 0.6 + Math.random() * 4.2;
    const anchorPos = (Math.random() - 0.5) * 4;
    const movingPos = anchorPos + (Math.random() - 0.5) * (anchorSize + movingSize);
    const r = L.resolveDrop({ movingPos, movingSize, anchorPos, anchorSize,
                              perfectTol: 0, minSize: 0 });
    if (r.missed) continue;
    const cut = r.slices.reduce((s, x) => s + x.size, 0);
    assert.ok(Math.abs((r.size + cut) - movingSize) < 1e-9, 'material conserved');
    assert.ok(r.size <= movingSize + 1e-9 && r.size <= anchorSize + 1e-9, 'never grows from a slice');
    assert.ok(r.pos + r.size / 2 <= anchorPos + anchorSize / 2 + 1e-9, 'stays on the anchor');
    assert.ok(r.pos - r.size / 2 >= anchorPos - anchorSize / 2 - 1e-9, 'stays on the anchor');
  }
});

/* ------------------------------------------------------------------ *
 * Recovery
 * ------------------------------------------------------------------ */

test('BUG 10: recovery needs a 3-perfect streak and is capped at the level base size', () => {
  assert.equal(L.RECOVERY_STREAK, 3);
  const base = 4;
  // nothing lost -> nothing to refund
  assert.equal(L.recoveryGain(base, base), 0);
  assert.equal(L.applyRecovery(base, base, base).gained, false);

  // partial loss -> a useful but partial refund
  const r = L.applyRecovery(2, 2, base);
  assert.ok(r.x > 2 && r.x < base, 'refund is partial, not a full reset');
  assert.equal(r.x, r.z);
  assert.ok(r.gainX > 0.3, 'refund is worth having');
  assert.ok(r.gained);

  // repeated refunds converge on the cap and never exceed it
  let sx = 0.5, sz = 0.5;
  for (let i = 0; i < 400; i++) {
    const step = L.applyRecovery(sx, sz, base);
    sx = step.x; sz = step.z;
    assert.ok(sx <= base + 1e-9, 'cap holds on x');
    assert.ok(sz <= base + 1e-9, 'cap holds on z');
  }
  assert.ok(Math.abs(sx - base) < 1e-6, 'converges to the cap');
  // and a size that is somehow already over the cap is never pushed higher
  const over = L.applyRecovery(base + 2, base + 2, base);
  assert.ok(over.x <= base + 2 + 1e-9);
  assert.equal(over.gained, false);
});

test('recovery is capped per level, using that level base size', () => {
  for (const lvl of [1, 33, 60, 100]) {
    const c = L.levelConfig(lvl);
    const r = L.applyRecovery(c.baseSize * 0.35, c.baseSize * 0.35, c.baseSize);
    assert.ok(r.x <= c.baseSize + 1e-9, 'level ' + lvl + ' cap');
    assert.ok(r.x > c.baseSize * 0.35, 'level ' + lvl + ' actually recovers');
  }
});

test('recovery cannot out-earn the loss it repairs', () => {
  for (let i = 0; i < 200; i++) {
    const base = 2 + Math.random() * 2;
    const size = Math.random() * base;
    const gain = L.recoveryGain(size, base);
    assert.ok(size + gain <= base + 1e-9);
    assert.ok(gain >= 0);
  }
});

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

test('BUG 9: best height per boss level is stored, kept and never regressed', () => {
  const store = L.memoryStorage();
  let p = L.createProgress(store);
  assert.equal(p.bossBest(10), 0);

  assert.equal(p.recordBossHeight(10, 14), true);
  assert.equal(p.bossBest(10), 14);
  assert.equal(p.recordBossHeight(10, 9), false, 'a worse run must not overwrite');
  assert.equal(p.bossBest(10), 14);
  assert.equal(p.recordBossHeight(10, 15), true);
  assert.equal(p.bossBest(10), 15);

  // every boss level keeps its own record
  for (let lvl = 20; lvl <= 100; lvl += 10) p.recordBossHeight(lvl, lvl + 3);
  for (let lvl = 20; lvl <= 100; lvl += 10) assert.equal(p.bossBest(lvl), lvl + 3);
  assert.equal(p.bossBest(10), 15);

  // non-boss levels are not boss records
  assert.equal(p.recordBossHeight(11, 50), false);
  assert.equal(p.bossBest(11), 0);

  // survives a reload from the same storage
  p = L.createProgress(store);
  assert.equal(p.bossBest(10), 15);
  assert.equal(p.bossBest(100), 103);
});

test('unlocks only move forward and stay in range', () => {
  const p = L.createProgress(L.memoryStorage());
  assert.equal(p.highestUnlocked(), 1);
  assert.equal(p.unlock(5), true);
  assert.equal(p.unlock(3), false);
  assert.equal(p.highestUnlocked(), 5);
  p.unlock(1000);
  assert.equal(p.highestUnlocked(), 100);
  assert.equal(p.isUnlocked(100), true);
  assert.equal(p.isUnlocked(101), false);
});

test('scores keep the best per level plus an overall best', () => {
  const p = L.createProgress(L.memoryStorage());
  assert.equal(p.recordScore(4, 800), true);
  assert.equal(p.recordScore(4, 500), false);
  assert.equal(p.levelBestScore(4), 800);
  p.recordScore(9, 2000);
  assert.equal(p.data.bestScore, 2000);
});

test('corrupt or hostile saved data degrades to a clean save', () => {
  const bad = L.memoryStorage();
  bad.setItem(L.SAVE_KEY, '{not json');
  let p = L.createProgress(bad);
  assert.equal(p.highestUnlocked(), 1);

  bad.setItem(L.SAVE_KEY, JSON.stringify({
    highestUnlocked: 9999, bossBest: { 10: 'x', 13: 40, 20: -5, 30: 12 },
    bestScore: 'abc', muted: 'yes'
  }));
  p = L.createProgress(bad);
  assert.equal(p.highestUnlocked(), 100);
  assert.equal(p.bossBest(10), 0, 'non-numeric dropped');
  assert.equal(p.bossBest(13), 0, 'non-boss key dropped');
  assert.equal(p.bossBest(20), 0, 'negative dropped');
  assert.equal(p.bossBest(30), 12, 'valid entry kept');
  assert.equal(p.data.bestScore, 0);
  assert.equal(p.muted(), true);
});

test('a storage that throws does not break the game', () => {
  const hostile = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); }
  };
  const p = L.createProgress(hostile);
  assert.equal(p.highestUnlocked(), 1);
  assert.equal(p.unlock(4), true);
  assert.equal(p.highestUnlocked(), 4, 'still works in memory');
  assert.equal(p.save(), false, 'reports the failure instead of throwing');
});

/* ------------------------------------------------------------------ *
 * Themes  (BUG 11)
 * ------------------------------------------------------------------ */

test('BUG 11: every level has a theme and every world band is distinct', () => {
  const names = new Set();
  for (let lvl = 1; lvl <= 100; lvl++) {
    const t = L.themeForLevel(lvl);
    assert.equal(t.level, lvl);
    assert.equal(t.world, Math.ceil(lvl / 10));
    assert.equal(t.isBoss, lvl % 10 === 0);
    assert.ok(t.palette.length >= 5);
    assert.match(t.skyTop, /^#[0-9a-f]{6}$/i);
    assert.match(t.skyBottom, /^#[0-9a-f]{6}$/i);
    names.add(t.worldName);
  }
  assert.equal(names.size, 10, 'ten distinct world identities');
});

test('BUG 11: no pastel, no neon, no cyberpunk in any block palette', () => {
  for (let lvl = 1; lvl <= 100; lvl++) {
    const t = L.themeForLevel(lvl);
    for (const hex of t.palette) {
      const { h, s, l } = L.hexToHsl(hex);
      // pastel = washed out and pale
      assert.ok(!(s < 0.34 && l > 0.66), `pastel block ${hex} on level ${lvl} (s=${s.toFixed(2)} l=${l.toFixed(2)})`);
      // neon = fully saturated and glowing bright
      assert.ok(!(s > 0.92 && l > 0.56), `neon block ${hex} on level ${lvl}`);
      // cyberpunk = electric magenta / cyan
      const electric = (h > 280 && h < 330) || (h > 168 && h < 200);
      assert.ok(!(electric && s > 0.85 && l > 0.5), `cyberpunk block ${hex} on level ${lvl}`);
      // and everything stays rich rather than muddy or bleached
      assert.ok(s >= 0.18, `washed block ${hex} on level ${lvl}`);
      assert.ok(l > 0.14 && l < 0.94, `out-of-range lightness ${hex} on level ${lvl}`);
    }
  }
});

test('BUG 11: consecutive levels always look different', () => {
  const sig = (lvl) => {
    const t = L.themeForLevel(lvl);
    return [t.skyTop, t.skyBottom, t.accent].concat(t.palette).join(',');
  };
  for (let lvl = 1; lvl < 100; lvl++) {
    assert.notEqual(sig(lvl), sig(lvl + 1), `level ${lvl} and ${lvl + 1} look identical`);
  }
  const all = new Set();
  for (let lvl = 1; lvl <= 100; lvl++) all.add(sig(lvl));
  assert.equal(all.size, 100, 'all 100 levels are visually unique');
});

test('the climb gets visually higher: skies darken from world 1 to world 10', () => {
  const lum = (w) => {
    const t = L.themeForLevel(w * 10 - 5);
    return (L.luminance(t.skyTop) + L.luminance(t.skyBottom)) / 2;
  };
  assert.ok(lum(1) > lum(10) * 3, 'world 10 is a night sky, world 1 is daylight');
  assert.ok(lum(1) > lum(5), 'mid climb is already deeper than the start');
  assert.ok(lum(5) > lum(9), 'the sky keeps deepening as you rise');
});

test('HUD text colour always contrasts with the sky behind it', () => {
  for (let lvl = 1; lvl <= 100; lvl++) {
    const t = L.themeForLevel(lvl);
    const skyL = L.luminance(L.mixHex(t.skyTop, t.skyBottom, 0.5));
    const textL = L.luminance(t.textColor);
    const ratio = (Math.max(skyL, textL) + 0.05) / (Math.min(skyL, textL) + 0.05);
    assert.ok(ratio > 3.9, `weak contrast on level ${lvl} (${ratio.toFixed(2)}:1)`);
  }
});

/* ------------------------------------------------------------------ *
 * Colour helpers
 * ------------------------------------------------------------------ */

test('hex/hsl round trips are stable', () => {
  for (const hex of ['#E0463C', '#4FAE45', '#2C7CC4', '#000000', '#ffffff', '#EFC429']) {
    const { h, s, l } = L.hexToHsl(hex);
    const back = L.hslToHex(h, s, l);
    const a = L.hexToRgb(hex), b = L.hexToRgb(back);
    assert.ok(Math.abs(a.r - b.r) <= 1 && Math.abs(a.g - b.g) <= 1 && Math.abs(a.b - b.b) <= 1, hex + ' -> ' + back);
  }
  assert.equal(L.mixHex('#000000', '#ffffff', 0.5), '#808080');
});

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

test('perfect drops score more, and streaks score more still', () => {
  const plain = L.dropScore({ level: 1, perfect: false, streak: 0 });
  const perfect = L.dropScore({ level: 1, perfect: true, streak: 0 });
  const streaked = L.dropScore({ level: 1, perfect: true, streak: 5 });
  assert.ok(perfect > plain);
  assert.ok(streaked > perfect);
  assert.ok(L.dropScore({ level: 90, perfect: false, streak: 0 }) > plain, 'late levels are worth more');
  assert.equal(L.dropScore({ level: 1, perfect: true, streak: 999 }),
               L.dropScore({ level: 1, perfect: true, streak: 10 }), 'streak bonus is capped');
});
