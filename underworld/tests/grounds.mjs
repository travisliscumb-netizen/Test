/* Villa Valen's grounds (357, owner 2026-11-17): the staff in place of idle bystanders (a butler, a valet, four armed
   guards), none walked through; the butler puts your cash away; the valet brings a car of yours round; the Valen Vault's
   front locks shut (a collider, saved) and opens; the walk-in safe opens. */
import { launch, open, check, frames, startNew, finish } from './lib.mjs';
const b = await launch(); const { page, errors } = await open(b, { viewport: { width: 960, height: 540 } }); await startNew(page);
const ev = (f, a) => page.evaluate(f, a);
const shot = async () => {};
await ev(() => { const g = window.game; g.quality.setMode(1); g.events.cool = 1e9; g.police.enabled = false; g.env.time = 13; g.env.timeScale = 0;
  g.uw.S.props.villa = { owned: true, dmg: 0, since: 1, lvl: 1 }; g.money.W.dirty.me = 50000; g.vreg.give('sports', 'bought');
  const r0 = g.render.bind(g); g.render = (a, b2) => { if (g.__cam) { const c = g.__cam; g.cam.update = () => {}; g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(c[3], c[4], c[5]); } return r0(a, b2); };
  g.resetPlayerState(-610, -895, Math.PI); });
await frames(page, 60);
const st = await ev(() => { const g = window.game, P = window.__pv.VillaGrounds.people; return { n: P && P.length, kinds: P && P.map(q => q.staff), guardsArmed: P && P.filter(q => q.staff === 'guard').every(q => q.gun) }; });
check('the staff: a butler, a valet and four armed guards', st.n === 6 && st.kinds.filter(k => k === 'guard').length === 4 && st.guardsArmed, JSON.stringify(st));
// the butler
const bt = await ev(() => { const g = window.game, B = window.__pv.VILLA_STAFF.butler; g.player.pos.set(B.x, g.player.pos.y, B.z + 1.2); const a = g.content.findAction(); a && a.act(); const t = document.getElementById('svcTitle').textContent; document.querySelector('#svcBody [data-act="cash"]').click(); const r = { label: a && a.label, title: t, hint: document.getElementById('svcHint').textContent, me: g.money.W.dirty.me, stash: g.money.W.dirty.prop.villa }; g.ui.back(); return r; });
check('the butler puts the cash you carry away in the villa stash', bt.label === 'The butler' && bt.me === 0 && bt.stash === 50000, JSON.stringify(bt));
// walk-through: the player pushed off the butler
const solid = await ev(() => { const g = window.game, B = window.__pv.VillaGrounds.people[0]; g.player.pos.set(B.x + 0.1, g.player.pos.y, B.z); for (let i = 0; i < 10; i++) g.update(1 / 60, 1 / 60); return +Math.hypot(g.player.pos.x - B.x, g.player.pos.z - B.z).toFixed(2); });
check('the staff cannot be walked through', solid >= 0.6, String(solid));
// the valet
const vt = await ev(() => { const g = window.game, V = window.__pv.VILLA_STAFF.valet; g.player.pos.set(V.x, g.player.pos.y, V.z + 1.2); const a = g.content.findAction(); a && a.act(); const btn = document.querySelector('#svcBody [data-act^="bring:"]'); btn && btn.click(); const r = { label: a && a.label, hint: document.getElementById('svcHint').textContent, car: g.vehicles.list.filter(v => v.garageUid && Math.hypot(v.pos.x + 596.5, v.pos.z + 868) < 3).map(v => v.type) }; g.ui.back(); return r; });
check('the valet brings a car of yours round to the motor court', vt.label === 'The valet' && vt.car.includes('sports'), JSON.stringify(vt));
await shot('1-court', [-588, 27, -838, -604, 21.5, -872]);
// the vault: shut it, check the collider, open it
const Q = { door: -563, z1: -994 };
const vd = await ev(() => { const g = window.game, G = window.__pv.VillaGrounds; g.player.pos.set(-563, G.y, -991); const a = g.content.findAction(); const l0 = a && a.label; a.act(); return l0; });
await page.waitForTimeout(500); await ev(() => { for (let i = 0; i < 400; i++) window.__pv.VillaGrounds.update(1 / 60, window.game); });
const shut = await ev(() => { const g = window.game, G = window.__pv.VillaGrounds; const hit = g.world.grid.resolveCircle(-563, -994.6, 0.4, G.y + 0.4, G.y + 1.6, {}).hit; return { t: G.doors.vault.t, hit, saved: g.save.villa.vault, label: (g.content.findAction() || {}).label }; });
check('the Valen Vault: the owner closes and locks it, its door blocks the portal, the state is saved', vd === 'Close and lock the vault' && shut.t === 0 && shut.hit && shut.saved && shut.label === 'Open the vault', JSON.stringify({ vd, shut }));
await shot('2-vault-shut', [-552, 26, -978, -563, 23.5, -994]);
await ev(() => { const g = window.game; g.content.findAction().act(); for (let i = 0; i < 400; i++) window.__pv.VillaGrounds.update(1 / 60, g); });
// the safe
const sf = await ev(() => { const g = window.game, G = window.__pv.VillaGrounds; g.player.pos.set(-543, G.y, -1037.6); const a = g.content.findAction(); const l = a && a.label; a.act(); for (let i = 0; i < 200; i++) G.update(1 / 60, g); return { l, t: G.doors.safe.t, hit: g.world.grid.resolveCircle(-543, -1040, 0.4, G.y + 0.4, G.y + 1.6, {}).hit }; });
check('the walk-in safe in the strongroom opens for the owner', sf.l === 'Open the safe' && sf.t === 1 && !sf.hit, JSON.stringify(sf));
await shot('3-safe-open', [-538, 24, -1031, -544, 22, -1046]);
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await finish(b, 'grounds');
