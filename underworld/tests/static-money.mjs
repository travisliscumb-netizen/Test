/* Static money guard (Node, no browser). Inventories every place the game reads or writes the player's
   single `save.money` balance, grouped by the function that does it, and fails when a write appears in a
   function that is not on the allowlist below or a function writes more often than it did.

   Orientation snapshot (Session 0, commit 3be344e): this list is the full set of hidden writes the
   Dirty Cash / Clean Bank foundation (Session 1) has to route through the new ledger. Session 1 shrinks
   WRITE_ALLOW to the ledger itself; at that point any direct write anywhere else fails this suite.

   Receivers counted as the player's money: save / s / d / this.save / g.save / this.g.save / uw.g.save
   (faction treasuries `f.money`, `tw.money`, `S.factions[..].money` are a different thing and are skipped).
   Funnels counted as writes: addMoney(...), content.spend / this.spend / C2.spend(...), uw.expense / uw.income(...),
   Gamble.settle(...) / debit(...).

   node underworld/tests/static-money.mjs          check against the allowlist
   LIST=1 node underworld/tests/static-money.mjs   print the full read/write inventory */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = process.env.UW_FILE ? path.resolve(process.env.UW_FILE) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
const lines = fs.readFileSync(FILE, 'utf8').split('\n');
// the game module starts after the inlined three.js bundle
const start = lines.findIndex(l => l.includes('MASTER_TEMPLATE_VERSION'));
if (start < 0) { console.log('FAIL  game module not found in ' + FILE); process.exit(1); }

const RECV = String.raw`(?:\b(?:this\.g\.save|uw\.g\.save|this\.save|g\.save|save|s|d))`;
const WRITE = new RegExp(RECV + String.raw`\.money\s*(?:\+=|-=|\*=|\/=|\+\+|--|=(?!=))`, 'g');
const READ = new RegExp(RECV + String.raw`\.money\b(?!\s*(?:\+=|-=|\*=|\/=|\+\+|--|=(?!=)))`, 'g');
const FUNNEL = /\b(?:addMoney|content\.spend|C2\.spend|this\.spend|uw\.expense|uw\.income|this\.expense|this\.income|this\.settle|this\.debit)\s*\(/g;
const DEF = /^(?:class|const|function|let) ([A-Za-z_$][\w$]*)/;
const METH = /^  (?:async |static |get |set )?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/;

function owner(i) {
  let m = null;
  for (let k = i; k >= start; k--) {
    if (!m) { const mm = METH.exec(lines[k]); if (mm) m = mm[1]; }
    const cc = DEF.exec(lines[k]); if (cc) return `${cc[1]}.${m || '<top>'}`;
  }
  return '<module>';
}
const writes = {}, reads = {}, funnels = {};
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
for (let i = start; i < lines.length; i++) {
  const L = lines[i];
  // the funnels' own definitions are where a ledger will live; their bodies are counted as writes below
  for (const _ of L.matchAll(WRITE)) bump(writes, owner(i));
  for (const _ of L.matchAll(READ)) bump(reads, owner(i));
  for (const m of L.matchAll(FUNNEL)) { if (/^\s{2}(addMoney|spend|expense|income|settle|debit)\(/.test(L)) continue; bump(funnels, owner(i) + ' → ' + m[0].replace(/\s*\($/, '')); }
}

// direct writes to save.money, by function, at commit 3be344e (every one of these must go through the ledger in Session 1)
const WRITE_ALLOW = {
  'SaveSystem.sanitize': 2,      // refund of a malformed blackjack hand; NaN reset
  'MoneyFeed.bind': 0,
  'ContentManager.spend': 1,     // generic spend funnel (35 callers: content.spend, this.spend, C2.spend)
  'Underworld.expense': 1,       // wages, upkeep, protection, bribes, deliveries
  'CrewManager.disloyalty': 2,   // skimming, betrayal theft
  'Gamble.settle': 1, 'Gamble.barDrink': 1, 'Gamble.debit': 1, 'Gamble.recover': 1, 'Gamble.pokerLeave': 1,
  'UIManager.buy': 2,            // Training upgrades + the hidden legacy ARMS shop
  'Game.addMoney': 1             // generic income funnel (27 callers)
};

let fail = 0;
const out = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
for (const k of Object.keys(writes).sort()) {
  const allowed = WRITE_ALLOW[k] || 0;
  out(writes[k] <= allowed, `${k}: ${writes[k]} direct write(s) to save.money${writes[k] > allowed ? ` (allowed ${allowed})` : ''}`);
}
const nW = Object.values(writes).reduce((a, b) => a + b, 0), nR = Object.values(reads).reduce((a, b) => a + b, 0), nF = Object.values(funnels).reduce((a, b) => a + b, 0);
console.log(`\ninventory: ${nW} direct writes in ${Object.keys(writes).length} functions · ${nF} funnel calls in ${Object.keys(funnels).length} call sites · ${nR} reads in ${Object.keys(reads).length} functions`);
if (process.env.LIST) {
  console.log('\n-- direct writes'); for (const k of Object.keys(writes).sort()) console.log(`${writes[k]}\t${k}`);
  console.log('\n-- funnel calls (each one is a money write)'); for (const k of Object.keys(funnels).sort()) console.log(`${funnels[k]}\t${k}`);
  console.log('\n-- reads (affordability checks and displays)'); for (const k of Object.keys(reads).sort()) console.log(`${reads[k]}\t${k}`);
}
console.log(`\nstatic-money: ${fail ? 'FAILED' : 'ALL CHECKS PASSED'}`);
process.exit(fail ? 1 : 0);
