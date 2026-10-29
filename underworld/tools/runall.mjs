// usage: node runall.mjs <label> <path-to-index.html> [suite ...]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const [label, file, ...only] = process.argv.slice(2);
const T = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'tests'), REPO = path.resolve(T, '..', '..');
const OUT = path.resolve(process.env.RUNS_DIR || path.join(T, '..', '.runs'), label);
fs.mkdirSync(OUT, { recursive: true });
const ORDER = ['arrest','stress','soak','gambling','casino','interiors','homes','session','prison','property','vehicles','ramps','inventory','cargo','phone','city','roads','map','taxi','stations','shooting','survival','core','ui','offline','smoke','money','business','dealers','street','pwa','camera','police','gangs','kingpin','tutorial','phoneapps','static-money','build','ledger','progression','fixer','carmoney','warehouse', 'compound', 'breach', 'threat', 'raid', 'shipment', 'vehicle', 'hot', 'races', 'motorsport', 'offroad','roadnet','unique','legal','fronts','tables','crime','opening','economy','royale-sim','perf','shots','cityshots','qashots','frontshots','carshots','contact'];
const all = fs.readdirSync(T).filter(f => f.endsWith('.mjs') && f !== 'lib.mjs').map(f => f.slice(0, -4));
const missing = all.filter(s => !ORDER.includes(s)); if (missing.length) { console.error('suites not in ORDER: ' + missing); process.exit(2); }
const list = only.length ? only : ORDER.filter(s => all.includes(s));
const res = fs.existsSync(path.join(OUT, 'results.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'results.json'))) : {};
const queue = list.filter(s => !res[s] || res[s].code !== 0 && only.length);
const CONC = +process.env.CONC || 2, TIMEOUT = 75 * 60e3;
function run(s) {
  return new Promise(resolve => {
    const args = [path.join(T, s + '.mjs')]; if (s === 'perf') args.push(file);
    const env = { ...process.env, UW_FILE: file, ...(s === 'soak' ? { CYCLES: '6' } : {}) };
    const t0 = Date.now(), log = fs.openSync(path.join(OUT, s + '.log'), 'w');
    const p = spawn('node', args, { cwd: REPO, env, stdio: ['ignore', log, log] });
    const k = setTimeout(() => p.kill('SIGKILL'), TIMEOUT);
    p.on('exit', (code, sig) => {
      clearTimeout(k); fs.closeSync(log);
      const txt = fs.readFileSync(path.join(OUT, s + '.log'), 'utf8');
      const pass = (txt.match(/^PASS/mg) || []).length, fail = (txt.match(/^FAIL  /mg) || []).length;
      res[s] = { code: code ?? (sig || 'killed'), pass, fail, sec: Math.round((Date.now() - t0) / 1000), fails: txt.split('\n').filter(l => l.startsWith('FAIL  ')).map(l => l.slice(0, 300)) };
      fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(res, null, 1));
      console.log(`${label} ${s}: exit ${res[s].code} ${pass} pass ${fail} fail ${res[s].sec}s`);
      resolve();
    });
  });
}
const workers = Array.from({ length: CONC }, async () => { while (queue.length) await run(queue.shift()); });
await Promise.all(workers);
console.log(`${label}: all done`);
