/* Static money guard (Node, no browser). Since overhaul Session 1 the player's money exists only in the Money
   ledger (src/game/035-core-money.js) as save.wallet: Dirty Cash by place and Clean Bank. This suite fails when:
   - anything reads or writes the old single balance (save.money and its aliases), or calls one of the old raw
     writers (addMoney, content.spend, uw.income, uw.expense);
   - anything outside the ledger and the save system touches `wallet`, or the ledger's balances (`W.clean`,
     `W.debt`, `W.dirty`);
   - a call names a money source (earn / pay / can / available / html) that MONEY_SOURCES does not define, so a
     typo fails here instead of throwing in the middle of play.
   It also prints the inventory: every call into the ledger, by source tag and by function.

   node underworld/tests/static-money.mjs          check
   LIST=1 node underworld/tests/static-money.mjs   print the full inventory */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = process.env.UW_FILE ? path.resolve(process.env.UW_FILE) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
const lines = fs.readFileSync(FILE, 'utf8').split('\n');
const start = lines.findIndex(l => l.includes('MASTER_TEMPLATE_VERSION'));
let fail = 0;
const out = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
if (start < 0) { out(false, 'game module not found in ' + FILE); process.exit(1); }

// the two sections allowed to touch the wallet: the ledger itself and the save system that creates and loads it
const section = tag => { const a = lines.findIndex((l, i) => i > start && l.includes(tag)); let b = a + 1; while (b < lines.length && !/^\/\* ={10,}/.test(lines[b])) b++; return [a, b]; };
const [m0, m1] = section('[CORE] MONEY'), [s0, s1] = section('[CORE] SAVE SYSTEM');
out(m0 > 0 && s0 > 0, `found the ledger (lines ${m0 + 1}-${m1}) and the save system (lines ${s0 + 1}-${s1})`);
const inMoney = i => i >= m0 && i < m1, inSave = i => i >= s0 && i < s1;

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
// MONEY_SOURCES keys, read from the source text
const srcText = lines.slice(m0, m1).join('\n');
const tbl = /const MONEY_SOURCES = \{([\s\S]*?)\n\};/.exec(srcText);
const SOURCES = new Set(tbl ? [...tbl[1].matchAll(/\b([A-Za-z]\w*):\s*\{/g)].map(m => m[1]) : []);
out(SOURCES.size >= 30, `MONEY_SOURCES defines ${SOURCES.size} sources`);

const LEGACY = /\b(?:this\.g\.save|uw\.g\.save|this\.save|g\.save|save|s|d)\.money\b/;
const OLDCALL = /\b(?:addMoney|content\.spend|uw\.income|uw\.expense)\s*\(/;
const WALLET = /\.wallet\b|\bW\.(?:clean|debt|dirty|stunt)\b/;
// calls into the ledger: Money.x(...) or g.earn(...); arguments are split at top-level commas, so nested calls
// (Math.round(...), rand(0.9, 1.1)) don't confuse the source argument
const CALL = /\b(?:Money|g|this\.g|game|uw\.g)\.(earn|pay|can|available|html)\(/g;
function args(L, from) {
  const out = []; let depth = 0, cur = '', q = null;
  for (let k = from; k < L.length; k++) {
    const c = L[k];
    if (q) { cur += c; if (c === q && L[k - 1] !== '\\') q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    if (c === ')' || c === ']' || c === '}') { if (depth === 0) { out.push(cur.trim()); return out; } depth--; }
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  return out;
}
const legacy = [], old = [], wallet = [], unknown = [], unsourced = [], calls = {}, bySrc = {}, dynamic = [];
for (let i = start; i < lines.length; i++) {
  const L = lines[i];
  if (inMoney(i)) continue;
  if (LEGACY.test(L) && !/delete d\.money|data\.money/.test(L)) legacy.push(`${owner(i)} (line ${i + 1})`);
  if (OLDCALL.test(L)) old.push(`${owner(i)} (line ${i + 1})`);
  if (WALLET.test(L) && !inSave(i)) wallet.push(`${owner(i)} (line ${i + 1})`);
  for (const m of L.matchAll(CALL)) {
    const fn = m[1], A = args(L, m.index + m[0].length);
    if (fn === 'earn' && m[0].startsWith('g.') === false && A.length === 1) continue;
    // the source is the only argument of html/available, the second of earn/pay/can
    const expr = (fn === 'html' || fn === 'available' ? A[0] : A[1]) || '';
    // a call without its source is a bug, not a default: Money.can(450) is always false (Session 1 shipped one)
    if (!expr) { unsourced.push(`${owner(i)}: ${m[0]}${A.join(', ')}) (line ${i + 1})`); continue; }
    const lits = [...expr.matchAll(/(?<![=!]==\s*)'([A-Za-z]+)'/g)].map(x => x[1]); // not the literals a ternary compares against
    if (!/^'[A-Za-z]+'$/.test(expr)) dynamic.push(`${owner(i)} ${fn}(… ${expr})`);
    if (!lits.length) continue;
    for (const src of lits) {
      if (fn === 'html' && src === 'either') continue; // the both-balances display
      if (!SOURCES.has(src)) unknown.push(`${owner(i)}: ${fn}(…, '${src}') (line ${i + 1})`);
      const k = `${owner(i)} → ${fn}:${src}`; calls[k] = (calls[k] || 0) + 1; bySrc[src] = (bySrc[src] || 0) + 1;
    }
  }
  // sources given as data (Fuel & Go items: pay: 'food')
  for (const m of L.matchAll(/\bpay: '([A-Za-z]+)'/g)) { if (!SOURCES.has(m[1])) unknown.push(`${owner(i)}: data pay: '${m[1]}' (line ${i + 1})`); bySrc[m[1]] = (bySrc[m[1]] || 0) + 1; }
}
out(!legacy.length, `nothing reads or writes the old single balance (save.money)${legacy.length ? ': ' + legacy.join(', ') : ''}`);
out(!old.length, `no call to the removed raw writers (addMoney, content.spend, uw.income, uw.expense)${old.length ? ': ' + old.join(', ') : ''}`);
out(!wallet.length, `only the ledger and the save system touch the wallet${wallet.length ? ': ' + wallet.join(', ') : ''}`);
out(!unsourced.length, `every ledger call names its source${unsourced.length ? ': ' + unsourced.join(', ') : ''}`);
out(!unknown.length, `every money source named in a call exists in MONEY_SOURCES${unknown.length ? ': ' + unknown.join(', ') : ''}`);
const unused = [...SOURCES].filter(k => !bySrc[k]);
out(!unused.length, `every source in MONEY_SOURCES is used somewhere${unused.length ? ' (unused: ' + unused.join(', ') + ')' : ''}`);
console.log(`\ninventory: ${Object.values(calls).reduce((a, b) => a + b, 0)} source references in ${Object.keys(calls).length} places · ${dynamic.length} computed (their literals are checked) · ${SOURCES.size} sources`);
if (process.env.LIST) {
  console.log('\n-- ledger calls by function'); for (const k of Object.keys(calls).sort()) console.log(`${calls[k]}\t${k}`);
  console.log('\n-- computed sources'); for (const d of dynamic) console.log('\t' + d);
}
console.log(`\nstatic-money: ${fail ? 'FAILED' : 'ALL CHECKS PASSED'}`);
process.exit(fail ? 1 : 0);
