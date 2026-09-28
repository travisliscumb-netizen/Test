import { h, icon, modal, confirmDialog, toast, fmtTime, fmtNum, slider, sw } from '../dom.js';
import { Game } from '../../engine/game.js';
import { classicRules } from '../../engine/rules.js';
import { AssistRandomizer } from '../../engine/assist.js';
import { Rng, randomSeed } from '../../engine/rng.js';
import { BoardRenderer, drawPieceIcon } from '../../render/board.js';
import { InputController, GestureTracker, GamepadReader } from '../../input.js';
import { MODES } from './classic.js';
import { resolvePlay } from '../labplay.js';
import { pieceColor, lighten, PALETTE } from '../../render/theme.js';
import { ACHIEVEMENTS } from '../../save.js';

const ASSIST_STRENGTH = 0.7;

export function mount(root, params, app) {
  root.classList.add('play');
  const settings = app.settings;
  const isLab = params.kind === 'lab';

  /* ------------------------------------------------------ rules -- */
  let rules, title, subtitle, conceptId = null, goal = null, mode;
  if (isLab) {
    const r = resolvePlay(params.concept, params.source || 'concept', params.pieceIndex || 0);
    if (!r.ok) {
      toast('This design cannot be played', r.errors[0] || 'It failed validation.', { iconName: 'x', error: true, ms: 5000 });
      setTimeout(() => app.back(), 0);
      return {};
    }
    rules = r.rules;
    title = r.concept.name;
    subtitle = 'AI Tetris Lab';
    conceptId = params.concept.id;
    mode = 'lab';
  } else {
    mode = params.mode || 'marathon';
    rules = classicRules();
    title = MODES[mode].title;
    subtitle = 'Classic';
    goal = MODES[mode].goal;
  }
  const unit = rules.progressUnit === 'groups' ? 'Groups' : 'Lines';

  /* --------------------------------------------------- DOM -------- */
  const dpr = Math.min(2, devicePixelRatio || 1);
  const boardCanvas = h('canvas', { 'aria-label': `${title} well`, role: 'img' });
  const popups = h('div', { class: 'popups', 'aria-live': 'assertive' });
  const frame = h('div', { class: 'well-frame' }, boardCanvas, popups);
  const wellCol = h('div', { class: 'well-col' }, frame);

  const holdCanvas = h('canvas', { 'aria-hidden': 'true' });
  const nextCanvas = h('canvas', { 'aria-hidden': 'true' });
  const mHold = h('canvas', { 'aria-hidden': 'true' });
  const mNext = h('canvas', { 'aria-hidden': 'true' });

  const statEl = (label, cls = '') => {
    const v = h('span', { class: 'v' }, '0');
    const el = h('div', { class: `stat ${cls}` }, h('span', { class: 'label-caps' }, label), v);
    return { el, v };
  };
  const S = {
    score: statEl('Score', 'score'), level: statEl('Level'), lines: statEl(unit), time: statEl(goal?.type === 'time' ? 'Left' : 'Time'),
    pieces: statEl('Pieces'), pps: statEl('PPS')
  };
  const M = { score: statEl('Score', 'score'), level: statEl('Lv'), lines: statEl(unit.slice(0, 5)), time: statEl(goal?.type === 'time' ? 'Left' : 'Time') };
  const levelBar = h('i', { style: { width: '0%' } });
  const comboN = h('span', { class: 'n' }, '');
  const comboMeter = h('div', { class: 'combo-meter', 'aria-live': 'polite' }, comboN, h('span', { class: 'label-caps' }, ''));
  const b2bFlag = h('span', { class: 'flag hidden' }, 'B2B');
  const goalLine = h('div', { class: 'goal-line' });
  const bestLine = h('div', { class: 'best-line' });
  const bestRec = isLab ? app.save.data.records.lab[params.concept?.id] : app.save.data.records[mode]?.[0];
  bestLine.textContent = !bestRec ? 'No personal best yet' : mode === 'sprint' ? `Best ${fmtTime(bestRec.timeMs)}` : `Best ${fmtNum(isLab ? bestRec : bestRec.score)}`;

  const pauseBtn = h('button', { class: 'iconbtn', 'aria-label': 'Pause', onclick: () => pause() }, icon('pause'));
  const left = h('aside', { class: 'side left', 'aria-label': 'Hold and stats' },
    h('div', { class: 'hud-box' }, h('div', { class: 'label-caps' }, h('span', {}, 'Hold'), h('span', { class: 'faint' }, keyName('hold'))), holdCanvas),
    h('div', { class: 'hud-box' },
      h('div', { class: 'stats-grid' }, S.level.el, S.lines.el, S.time.el, S.pieces.el),
      h('div', { class: 'levelbar', title: 'Progress to next level' }, levelBar)),
    h('div', { class: 'hud-box mode-box' }, h('div', { class: 'label-caps' }, subtitle), h('div', { style: { fontWeight: 600, fontSize: '1.05rem' } }, title), goalLine),
    h('div', { class: 'hud-actions' }, pauseBtn));
  const right = h('aside', { class: 'side right', 'aria-label': 'Next pieces and score' },
    h('div', { class: 'hud-box' }, h('div', { class: 'label-caps' }, h('span', {}, 'Next')), nextCanvas),
    h('div', { class: 'hud-box' }, S.score.el, bestLine, h('div', { class: 'row', style: { marginTop: '8px', gap: '8px' } }, comboMeter, b2bFlag), S.pps.el));
  const mobileHud = h('div', { class: 'mobile-hud' },
    h('div', { class: 'hud-box', onclick: () => session.game.holdPiece() }, h('div', { class: 'label-caps' }, 'Hold'), mHold),
    h('div', { class: 'hud-box mid' }, M.score.el, M.level.el, M.lines.el, M.time.el),
    h('div', { class: 'hud-box' }, h('div', { class: 'label-caps' }, 'Next'), mNext),
    h('button', { class: 'iconbtn m-pause', 'aria-label': 'Pause', onclick: () => pause() }, icon('pause')));

  const canFlip = rules.pieces.some((p) => p.trans[0].flip >= 0 && p.rotation === 'full');
  const touchBtn = (action, ico, label, cls = '') => {
    const b = h('button', { class: `touch-btn ${cls}`, 'aria-label': label }, icon(ico));
    const down = (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); b.classList.add('pressed'); input.press(action); haptic(6); };
    const up = () => { b.classList.remove('pressed'); input.release(action); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  };
  const touch = h('div', { class: 'touch', 'aria-label': 'Touch controls' },
    h('div', { class: 'grp mov' },
      touchBtn('left', 'left', 'Move left'), touchBtn('soft', 'down', 'Soft drop', 'wide'), touchBtn('right', 'right', 'Move right')),
    h('div', { class: 'grp act' },
      touchBtn('hold', 'hold', 'Hold'),
      canFlip ? touchBtn('flip', 'flip', 'Mirror') : touchBtn('ccw', 'ccw', 'Rotate counter-clockwise'),
      touchBtn('cw', 'cw', 'Rotate clockwise'),
      touchBtn('hard', 'drop', 'Hard drop', 'accent')));

  root.append(mobileHud, left, wellCol, right, touch);

  /* ------------------------------------------------- session -- */
  const renderer = new BoardRenderer(boardCanvas, app.painter);
  const session = { game: null, assist: null, renderer, paused: false, over: false, countdown: 0, startT: 0, rules, params };
  let input;
  const gestures = new GestureTracker({
    move: (d) => session.game.move(d), stepDown: () => session.game.stepDown(), hardDrop: () => session.game.hardDrop(),
    holdPiece: () => session.game.holdPiece(), rotate: (k) => session.game.rotate(k)
  });
  gestures.onTap = (x) => {
    const r = boardCanvas.getBoundingClientRect();
    session.game.rotate(x < r.left + r.width * 0.33 ? 'ccw' : 'cw');
  };

  let displayScore = 0;
  let lastHudSig = '';
  let queueSig = '', holdSig = '';
  let shake = 0;
  let comboBoost = 0;
  let dangerWarned = false;
  let resultShown = false;
  let unlockedThisGame = [];
  let hexLines = 0;
  let countdownEl = null;
  let lastTick = 0;

  function newGame() {
    const seed = randomSeed();
    const assist = !isLab ? new AssistRandomizer(rules, { rng: new Rng(seed ^ 0xa5a5), strength: app.debug?.assistStrength ?? ASSIST_STRENGTH, enabled: app.debug?.assistEnabled ?? true }) : null;
    const game = new Game(rules, { seed, randomizer: assist || undefined, previews: settings.previews, goal, startLevel: params.startLevel || 1, mode });
    session.game = game;
    session.assist = assist;
    session.over = false;
    resultShown = false;
    unlockedThisGame = [];
    displayScore = 0;
    dangerWarned = false;
    hexLines = 0;
    queueSig = holdSig = lastHudSig = '';
    renderer.attach(game);
    renderer.configure({ theme: app.theme, highContrast: settings.highContrast, ghost: settings.ghost, reduced: app.reduced });
    input = new InputController({
      move: (d) => game.move(d), shift: (d) => game.shift(d), rotate: (k) => game.rotate(k), hardDrop: () => game.hardDrop(),
      holdPiece: () => game.holdPiece(), setSoftDrop: (on, f) => game.setSoftDrop(on, f), stepDown: () => game.stepDown()
    }, { das: settings.das, arr: settings.arr, softDrop: settings.softDrop });
    input.onAction = (a) => { if (a === 'pause') pause(); };
    session.input = input;
    session.pad = new GamepadReader(input);
    game.fillQueue();
    layout();
    startCountdown();
    app.debug?.attach(session);
  }

  function startCountdown() {
    session.countdown = app.reduced ? 0.6 : 2.4;
    session.started = false;
    app.audio.setMusic(isLab ? 'lab' : 'game');
    showCount(app.reduced ? 'GO' : '3');
  }

  function showCount(txt) {
    countdownEl?.remove();
    countdownEl = h('div', { class: 'countdown' }, txt);
    popups.append(countdownEl);
    app.audio.play('countdown', { go: txt === 'GO' });
  }

  function layout() {
    const wantTouch = settings.touch === 'buttons' || settings.touch === 'gestures' || (settings.touch === 'auto' && app.touchDevice);
    touch.classList.toggle('on', wantTouch && settings.touch !== 'off');
    touch.classList.toggle('gestures-only', settings.touch === 'gestures');
    // Short landscape screens: the touch clusters become grid columns beside the HUD.
    root.classList.toggle('touch-cols', touch.classList.contains('on') && settings.touch !== 'gestures' && innerWidth > innerHeight && innerHeight <= 560);
    if (settings.touch === 'gestures') for (const b of touch.querySelectorAll('.touch-btn')) b.classList.toggle('hidden', !/Hold|Hard drop/.test(b.getAttribute('aria-label')));
    else for (const b of touch.querySelectorAll('.touch-btn')) b.classList.remove('hidden');
    const fit = () => {
      if (!session.game) return;
      // Size from the screen (viewport-driven), never from the well's own
      // column, so resizing the canvas cannot feed back into the layout.
      const portrait = getComputedStyle(mobileHud).display !== 'none';
      const cs = getComputedStyle(root);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      let availW, availH;
      if (portrait) {
        const gap = parseFloat(cs.rowGap) || 8;
        const touchH = touch.classList.contains('on') ? touch.getBoundingClientRect().height + gap : 0;
        availW = root.clientWidth - padX;
        availH = root.clientHeight - padY - mobileHud.getBoundingClientRect().height - gap - touchH;
      } else {
        const gap = parseFloat(cs.columnGap) || 20;
        let others = left.getBoundingClientRect().width + right.getBoundingClientRect().width;
        let gaps = 2;
        if (root.classList.contains('touch-cols')) {
          for (const g of touch.querySelectorAll('.grp')) others += g.getBoundingClientRect().width;
          gaps = 4;
        }
        availW = root.clientWidth - padX - others - gap * gaps;
        availH = root.clientHeight - padY;
      }
      const size = renderer.resize(Math.max(80, availW - 14), Math.max(120, availH - 14), app.quality === 'lite' ? Math.min(1.5, dpr) : dpr);
      gestures.setCell(renderer.pitch);
      sizePreview(holdCanvas, 130, 84);
      sizePreview(nextCanvas, 130, Math.min(360, Math.max(200, size.h * 0.55)));
      const narrow = innerWidth < 400;
      sizePreview(mHold, narrow ? 48 : 60, 44);
      sizePreview(mNext, narrow ? 84 : 110, 44);
      queueSig = holdSig = '';
    };
    fit();
    // Re-fit once the touch bar's visibility has affected the grid.
    requestAnimationFrame(fit);
  }

  function sizePreview(c, w, hh) {
    c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr);
    c.style.width = `${w}px`; c.style.height = `${hh}px`;
    c._w = w; c._h = hh;
  }

  /* ----------------------------------------------------- previews -- */
  function drawQueue() {
    const g = session.game;
    const sig = g.queue.map((q) => q.p + ':' + q.colors.join('') + q.specials.join('')).join('|') + (g.phase === 'ready' ? 'r' : '');
    if (sig !== queueSig) {
      queueSig = sig;
      paintQueue(nextCanvas, g.queue.slice(0, settings.previews), true);
      paintQueue(mNext, g.queue.slice(0, 3), false);
    }
    const hs = g.hold ? g.hold.p + ':' + g.hold.colors.join('') + (g.holdUsed ? 'u' : '') : 'none';
    if (hs !== holdSig) {
      holdSig = hs;
      paintHold(holdCanvas);
      paintHold(mHold);
    }
  }

  function paintQueue(c, list, vertical) {
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c._w, c._h);
    const n = Math.max(1, list.length);
    list.forEach((inst, i) => {
      const p = rules.pieces[inst.p];
      const st = p.states[0];
      const scale = vertical && i > 0 ? 0.78 : 1;
      const boxW = vertical ? c._w : c._w / n;
      const boxH = vertical ? c._h / (n + 0.4) : c._h;
      const cx = vertical ? c._w / 2 : boxW * (i + 0.5);
      const cy = vertical ? boxH * (i + 0.5) + (i > 0 ? boxH * 0.3 : 0) : c._h / 2;
      ctx.globalAlpha = vertical ? 1 - i * 0.08 : 1;
      drawPieceIcon(ctx, app.painter, rules.lattice, st.cells, inst.colors, inst.specials, cx, cy, boxW * scale, boxH * scale, vertical ? 22 : 14);
    });
    ctx.globalAlpha = 1;
  }

  function paintHold(c) {
    const g = session.game;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c._w, c._h);
    if (!g.hold) return;
    const p = rules.pieces[g.hold.p];
    ctx.globalAlpha = g.holdUsed ? 0.35 : 1;
    drawPieceIcon(ctx, app.painter, rules.lattice, p.states[0].cells, g.hold.colors, g.hold.specials, c._w / 2, c._h / 2, c._w, c._h, 22);
    ctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------------- HUD -- */
  function updateHud(dt) {
    const g = session.game;
    const st = g.stats;
    displayScore += (st.score - displayScore) * Math.min(1, dt * 12);
    if (Math.abs(st.score - displayScore) < 1) displayScore = st.score;
    const timeMs = goal?.type === 'time' ? goal.value - st.timeMs : st.timeMs;
    const pps = st.timeMs > 1000 ? (st.pieces / (st.timeMs / 1000)).toFixed(2) : '0.00';
    const progress = rules.progressUnit === 'groups' ? st.groups : st.lines;
    const sig = `${Math.round(displayScore)}|${st.level}|${progress}|${Math.floor(timeMs / 100)}|${st.pieces}|${st.combo}|${st.b2b}`;
    if (sig === lastHudSig) return;
    const levelChanged = !lastHudSig || lastHudSig.split('|')[1] !== String(st.level);
    lastHudSig = sig;
    const scoreTxt = fmtNum(displayScore);
    S.score.v.textContent = scoreTxt; M.score.v.textContent = scoreTxt;
    S.level.v.textContent = String(st.level); M.level.v.textContent = String(st.level);
    const linesTxt = goal?.type === 'lines' ? `${Math.min(st.lines, goal.value)}/${goal.value}` : String(progress);
    S.lines.v.textContent = linesTxt; M.lines.v.textContent = linesTxt;
    const t = fmtTime(timeMs).slice(0, -1);
    S.time.v.textContent = t; M.time.v.textContent = t.slice(0, -2);
    S.pieces.v.textContent = String(st.pieces);
    S.pps.v.textContent = pps;
    S.pps.el.firstChild.textContent = 'Pieces / sec';
    const per = rules.linesPerLevel;
    levelBar.style.width = `${((st.progress % per) / per) * 100}%`;
    if (st.combo > 0) { comboN.textContent = `×${st.combo}`; comboMeter.lastChild.textContent = 'Combo'; }
    else { comboN.textContent = ''; comboMeter.lastChild.textContent = ''; }
    b2bFlag.classList.toggle('hidden', !st.b2b);
    if (levelChanged && st.level > 1) { S.level.el.classList.remove('bump'); void S.level.el.offsetWidth; S.level.el.classList.add('bump'); }
    goalLine.textContent = goal?.type === 'lines' ? `Clear ${goal.value} lines` : goal?.type === 'time' ? 'Score big before time runs out' : isLab ? (rules.concept.tagline || '') : `Level up every ${per} lines`;
  }

  /* ------------------------------------------------------ feedback -- */
  function popup(big, small, color, cls = '') {
    if (!big && !small) return;
    // Popups that overlap in time take successive vertical slots.
    const live = [...popups.querySelectorAll(`.pop.${cls || 'label'}`)].filter((p) => !p.dataset.done);
    const slot = live.length;
    const el = h('div', { class: `pop ${cls || 'label'}`, style: { '--pc': color || 'var(--accent)', '--slot': String(slot) } },
      big ? h('span', { class: 'big' }, big) : null, small ? h('span', { class: 'small' }, small) : null);
    setTimeout(() => { el.dataset.done = '1'; }, 700);
    popups.append(el);
    while (popups.children.length > 5) popups.firstChild.remove();
    setTimeout(() => el.remove(), 1300);
  }

  function haptic(ms) { if (settings.haptics && navigator.vibrate && app.touchDevice) navigator.vibrate(ms); }
  function doShake(amount) { if (settings.shake && !app.reduced) shake = Math.min(14, shake + amount); }

  function unlock(id) {
    if (app.save.unlock(id)) {
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      unlockedThisGame.push(a);
      app.audio.play('achievement');
      // On phones the HUD sits where toasts appear; hold them for the results screen.
      if ((innerWidth > 760 && innerHeight > 560) || session.over) toast(`Achievement: ${a.name}`, a.desc, { iconName: 'medal' });
      else popup('', `★ ${a.name}`, '#ffd22e', 'points');
    }
  }

  function origin() {
    const r = boardCanvas.getBoundingClientRect();
    return { x: r.left, y: r.top };
  }

  function handleEvents(events) {
    const g = session.game;
    const o = origin();
    renderer.handle(events, app.fx, o);
    for (const e of events) {
      switch (e.type) {
        case 'move': app.audio.play('move'); break;
        case 'rotate': app.audio.play('rotate', e); break;
        case 'blocked': if (e.rotate) app.audio.play('blocked'); break;
        case 'softdrop': app.audio.play('softdrop'); break;
        case 'harddrop': app.audio.play('harddrop', e); doShake(1.5 + Math.min(4, e.distance / 5)); haptic(12); break;
        case 'lock': app.audio.play('lock'); break;
        case 'hold': app.audio.play('hold'); break;
        case 'garbage': app.audio.play('garbage'); doShake(3); break;
        case 'timeout': popup('', 'TIME!', '#ff4d5e', 'points'); break;
        case 'tspin': app.audio.play('tspin'); popup(e.mini ? 'MINI T-SPIN' : 'T-SPIN', `+${fmtNum(e.points)}`, PALETTE[3]); break;
        case 'clear': onClear(e); break;
        case 'perfect':
          app.audio.play('perfect');
          popup('PERFECT CLEAR', `+${fmtNum(e.points)}`, '#ffd22e');
          app.fx.motes(o.x, o.y, renderer.cssW, renderer.cssH, ['#ffd22e', '#ffffff', app.theme.accent2], 70);
          app.bg.pulse(1, '#ffd22e');
          unlock('perfect');
          break;
        case 'levelup':
          app.audio.play('levelup');
          popup(`LEVEL ${e.level}`, isLab ? '' : 'Speed up!', app.theme.accent2);
          app.bg.kickHue(1);
          app.fx.motes(o.x, o.y + renderer.cssH * 0.6, renderer.cssW, renderer.cssH * 0.4, [app.theme.accent, app.theme.accent2, '#ffffff'], 40);
          if (mode === 'marathon') { if (e.level >= 10) unlock('level-10'); if (e.level >= 15) unlock('level-15'); }
          break;
        case 'gameover': onEnd(false); break;
        case 'complete': onEnd(true); break;
        default: break;
      }
    }
    // Danger cue.
    if (g.danger > 0.55 && !dangerWarned && !g.isOver) { dangerWarned = true; app.audio.play('danger'); haptic(30); }
    if (g.danger < 0.3) dangerWarned = false;
    frame.classList.toggle('danger', g.danger > 0.55 && !g.isOver);
  }

  function onClear(e) {
    const n = e.lines || e.groups || 1;
    if (e.chain > 1) app.audio.play('chain', e); else app.audio.play('clear', { lines: n, combo: e.combo });
    if (e.tspin && e.lines) app.audio.play('tspin');
    if (e.b2b) app.audio.play('b2b');
    if (e.combo > 0) app.audio.play('combo', e);
    if (e.bombs) { app.audio.play('bomb'); doShake(6); }
    const colorFor = e.lines >= 4 ? PALETTE[1] : e.tspin ? PALETTE[3] : e.chain > 1 ? '#ffd22e' : app.theme.accent;
    let small = `+${fmtNum(e.points)}`;
    if (e.b2b) small = `BACK-TO-BACK · ${small}`;
    const showLabel = e.lines >= 2 || e.tspin || e.chain > 1 || e.groups > 1 || e.bombs || e.lines >= 4;
    popup(showLabel ? e.label : '', small, colorFor, showLabel ? '' : 'points');
    if (e.combo >= 2) setTimeout(() => popup('', `${e.combo} COMBO`, '#ffd22e', 'points'), 180);
    if (e.clutch) setTimeout(() => popup('CLUTCH!', 'Saved it', '#ff4d5e'), 260);
    comboBoost = Math.min(1, comboBoost + 0.15 + n * 0.08);
    app.bg.pulse(0.25 + n * 0.12, lighten(pieceColor(e.removed?.[0]?.[2] & 31 || 1, app.theme), 0.2));
    if (e.lines >= 4 || e.chain >= 3) { doShake(8); haptic(40); app.bg.pulse(0.8, PALETTE[1]); }
    else if (n >= 2) { doShake(3); haptic(18); }
    // Achievements.
    if (e.lines >= 1 || e.groups >= 1) unlock('first-clear');
    if (e.lines >= 4) unlock('tetris');
    if (e.tspin && e.lines > 0 && !isLab) {
      unlock('tspin');
      if (e.tspin === 'full' && e.lines === 2) unlock('tspin-double');
      if (e.tspin === 'full' && e.lines === 3) unlock('tspin-triple');
    }
    if (e.b2b) unlock('b2b');
    if (e.combo >= 5) unlock('combo-5');
    if (e.combo >= 10) unlock('combo-10');
    if (e.clutch) unlock('clutch');
    if (isLab && e.chain >= 3) unlock('lab-chain');
    if (isLab && rules.lattice === 'hex') { hexLines += e.lines; if (hexLines >= 20) unlock('hex'); }
  }

  function summary(completed) {
    const st = session.game.stats;
    return {
      mode, completed, score: st.score, lines: st.lines, groups: st.groups, level: st.level, timeMs: st.timeMs, pieces: st.pieces,
      tetrises: st.tetrises, tspins: st.tspins, maxCombo: st.maxCombo, maxChain: st.maxChain, pcs: st.pcs, bombs: st.bombs,
      holds: st.holds, clutches: st.clutches
    };
  }

  function onEnd(completed) {
    if (session.over) return;
    session.over = true;
    input.reset();
    app.audio.play(completed ? 'complete' : 'gameover');
    if (!completed) doShake(6);
    const sum = summary(completed);
    // Persist.
    const sv = app.save;
    sv.bump('games'); sv.bump('pieces', sum.pieces); sv.bump('lines', sum.lines); sv.bump('tetrises', sum.tetrises);
    sv.bump('tspins', sum.tspins); sv.bump('pcs', sum.pcs); sv.bump('timeMs', Math.round(sum.timeMs)); sv.bump('holds', sum.holds);
    sv.bump('clutches', sum.clutches); sv.bump('bombs', sum.bombs);
    sv.max('maxCombo', sum.maxCombo); sv.max('maxChain', sum.maxChain);
    if (mode === 'marathon') sv.max('bestLevel', sum.level);
    if (isLab) sv.bump('labGames');
    const xp = Math.min(4000, Math.round(sum.score / 200 + sum.lines * 8 + sum.groups * 6 + sum.pieces));
    const rankBefore = sv.rank.level;
    sv.bump('xp', xp);
    let record = { rank: 0, personalBest: false };
    let labBest = false;
    if (!isLab) record = sv.addRecord(mode, { ...sum, completed });
    else if (conceptId) labBest = sv.addLabRecord(conceptId, sum.score);
    if (isLab) unlock('lab-play');
    if (sv.data.stats.lines >= 100) unlock('lines-100');
    if (sv.data.stats.lines >= 500) unlock('lines-500');
    if (sv.data.stats.bombs >= 25) unlock('lab-bomb');
    if (mode === 'sprint' && completed && sum.timeMs < 180000) unlock('sprint-180');
    if (mode === 'sprint' && completed && sum.timeMs < 100000) unlock('sprint-100');
    if (mode === 'ultra' && sum.score >= 50000) unlock('ultra-50k');
    if (mode === 'marathon' && sum.score >= 250000) unlock('score-250k');
    const doneCh = sv.progressChallenges(sum);
    for (const c of doneCh) toast('Challenge complete', `${c.text} · +${c.xp} XP`, { iconName: 'target' });
    const rankAfter = sv.rank.level;
    if (rankAfter > rankBefore) setTimeout(() => { toast(`Rank ${rankAfter}!`, 'New unlocks may be waiting in Settings.', { iconName: 'star' }); app.audio.play('achievement'); }, 900);
    sv.flush();
    setTimeout(() => showResults(sum, record, labBest, xp, completed), completed ? 900 : 1300);
  }

  function showResults(sum, record, labBest, xp, completed) {
    if (resultShown) return;
    resultShown = true;
    const headline = completed ? (mode === 'sprint' ? 'Sprint complete!' : mode === 'ultra' ? 'Time!' : 'Complete!') : 'Game over';
    const hero = mode === 'sprint' && completed ? fmtTime(sum.timeMs) : fmtNum(sum.score);
    const cells = [
      [unit, String(rules.progressUnit === 'groups' ? sum.groups : sum.lines)], ['Level', String(sum.level)], ['Time', fmtTime(sum.timeMs)],
      ['Pieces/sec', sum.timeMs > 0 ? (sum.pieces / (sum.timeMs / 1000)).toFixed(2) : '0'], ['Best combo', String(sum.maxCombo)],
      isLab ? ['Best chain', String(sum.maxChain)] : ['Tetris · Spin', `${sum.tetrises} · ${sum.tspins}`]
    ];
    // A finished Sprint shows its time as the hero number, so list the score instead.
    if (mode === 'sprint' && completed) cells[2] = ['Score', fmtNum(sum.score)];
    modal((close) => [
      h('div', { class: 'label-caps' }, `${subtitle} · ${title}`),
      h('h2', {}, headline),
      h('div', { class: 'result-hero' },
        h('div', { class: 'score' }, hero),
        record.personalBest ? h('div', { class: 'newbest' }, 'NEW PERSONAL BEST') : record.rank ? h('div', { class: 'chip' }, `#${record.rank} on your ${title} board`) : null,
        labBest ? h('div', { class: 'newbest' }, 'BEST SCORE FOR THIS DESIGN') : null),
      h('div', { class: 'result-grid' }, cells.map(([k, v]) => h('div', { class: 'cell' }, h('div', { class: 'label-caps' }, k), h('div', { class: 'v' }, v)))),
      h('p', { class: 'muted', style: { marginTop: '12px' } }, `+${fmtNum(xp)} XP`),
      unlockedThisGame.length ? h('div', { class: 'chips' }, unlockedThisGame.map((a) => h('span', { class: 'chip warn', title: a.desc }, icon('medal'), a.name))) : null,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', autofocus: true, onclick: () => { close(); newGame(); } }, icon('refresh'), 'Play again'),
        isLab ? h('button', { class: 'btn ghost', onclick: () => { close(); app.back(); } }, icon('lab'), 'Back to Lab')
          : h('button', { class: 'btn ghost', onclick: () => { close(); app.go('classic', {}, { replace: true }); } }, icon('grid'), 'Modes'),
        h('button', { class: 'btn ghost', onclick: () => { close(); app.home(); } }, 'Menu'))
    ], { label: headline });
  }

  /* ------------------------------------------------------- pause -- */
  function pause() {
    const g = session.game;
    if (session.paused || session.over || !g) return;
    session.paused = true;
    input.reset();
    app.audio.play('back');
    app.audio.setIntensity(0.1);
    const resume = (close) => { close(); session.paused = false; };
    modal((close) => [
      h('div', { class: 'label-caps' }, `${subtitle} · ${title}`),
      h('h2', {}, 'Paused'),
      h('div', { class: 'setting' }, h('div', { class: 'txt' }, h('b', {}, 'Music')), slider(settings.music, 0, 1, 0.05, (v) => { app.save.setSetting('music', v); app.applySettings(); }, 'Music volume')),
      h('div', { class: 'setting' }, h('div', { class: 'txt' }, h('b', {}, 'Effects')), slider(settings.sfx, 0, 1, 0.05, (v) => { app.save.setSetting('sfx', v); app.applySettings(); }, 'Effects volume')),
      h('div', { class: 'setting' }, h('div', { class: 'txt' }, h('b', {}, 'Ghost piece')), sw(settings.ghost, (v) => { app.save.setSetting('ghost', v); renderer.configure({ ghost: v }); }, 'Ghost piece')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', autofocus: true, onclick: () => resume(close) }, icon('play'), 'Resume'),
        h('button', { class: 'btn ghost', onclick: () => { close(); session.paused = false; newGame(); } }, icon('refresh'), 'Restart'),
        h('button', { class: 'btn ghost', onclick: async () => {
          if (await confirmDialog('Quit this game?', 'Your current run will end and will not be recorded.', { ok: 'Quit', danger: true })) { close(); session.paused = false; session.over = true; app.back(); }
        } }, 'Quit'))
    ], { onDismiss: () => { session.paused = false; }, label: 'Paused' });
  }

  /* --------------------------------------------------------- input -- */
  const keyMap = () => {
    const m = new Map();
    for (const [action, codes] of Object.entries(settings.keys)) for (const c of codes) m.set(c, action);
    return m;
  };
  let keys = keyMap();
  function keyName(action) { const k = settings.keys[action]?.[0] || ''; return k.replace('Key', '').replace('Arrow', '').replace('Left', ''); }

  const onKeyUp = (e) => {
    const a = keys.get(e.code);
    if (a && input) { input.release(a); e.preventDefault(); }
  };
  document.addEventListener('keyup', onKeyUp);

  const onPointer = (type) => (e) => {
    if (settings.touch === 'buttons' || settings.touch === 'off' || e.pointerType === 'mouse') return;
    if (!session.started || session.paused || session.over) return;
    e.preventDefault();
    if (type === 'down') { boardCanvas.setPointerCapture?.(e.pointerId); gestures.start(e.pointerId, e.clientX, e.clientY, e.timeStamp); }
    else if (type === 'move') gestures.move(e.pointerId, e.clientX, e.clientY, e.timeStamp);
    else if (type === 'up') gestures.end(e.pointerId, e.clientX, e.clientY, e.timeStamp);
    else gestures.cancel(e.pointerId);
  };
  boardCanvas.addEventListener('pointerdown', onPointer('down'));
  boardCanvas.addEventListener('pointermove', onPointer('move'));
  boardCanvas.addEventListener('pointerup', onPointer('up'));
  boardCanvas.addEventListener('pointercancel', onPointer('cancel'));

  let lastBox = '';
  const ro = new ResizeObserver(() => {
    const box = `${root.clientWidth}x${root.clientHeight}`;
    if (box === lastBox) return;
    lastBox = box;
    layout();
  });
  ro.observe(root);

  newGame();

  /* --------------------------------------------------------- frame -- */
  return {
    session,
    frame(dt) {
      const g = session.game;
      if (!g) return;
      const dtMs = dt * 1000;
      if (!session.started && !session.paused) {
        const before = session.countdown;
        session.countdown -= dt;
        const step = (t) => (t > 1.6 ? '3' : t > 0.8 ? '2' : t > 0 ? '1' : 'GO');
        if (!app.reduced && step(before) !== step(session.countdown)) showCount(step(session.countdown));
        if (session.countdown <= 0) {
          session.started = true;
          app.audio.play('start');
          g.start();
          setTimeout(() => countdownEl?.remove(), 500);
        }
      } else if (session.started && !session.paused && !session.over) {
        session.pad?.poll();
        input.update(dtMs);
        g.tick(dtMs);
      }
      const events = g.drainEvents();
      if (events.length) handleEvents(events);
      renderer.update(dt, app.fx, origin());
      renderer.draw();
      drawQueue();
      updateHud(dt);
      if (shake > 0.05) {
        shake *= Math.exp(-dt * 12);
        frame.style.transform = `translate(${(Math.random() - 0.5) * shake}px, ${(Math.random() - 0.3) * shake}px)`;
      } else if (frame.style.transform) frame.style.transform = '';
      comboBoost = Math.max(0, comboBoost - dt * 0.12);
      // Placement clock: tick in the last second.
      if (rules.placement === 'timed' && g.active && session.started && !session.paused) {
        const leftMs = g.placeLimit() - (g.placeTimer || 0);
        const sec = Math.ceil(leftMs / 333);
        if (leftMs < 1000 && sec !== lastTick) { lastTick = sec; app.audio.play('countdown', { go: false }); }
      }
      const intensity = session.paused ? 0.1 : Math.min(1, 0.25 + (g.stats.level - 1) * 0.045 + g.danger * 0.4 + comboBoost * 0.3);
      if (!session.paused) app.audio.setIntensity(intensity, g.danger, g.stats.level);
    },
    bgState: () => ({ danger: session.game?.danger || 0, intensity: Math.min(1, ((session.game?.stats.level || 1) - 1) / 14 + comboBoost * 0.4) }),
    key(e) {
      const a = keys.get(e.code);
      if (!a) return false;
      e.preventDefault();
      if (e.repeat) return true;
      if (a === 'pause' || e.key === 'Escape') { pause(); return true; }
      if (session.started && !session.paused && !session.over) input.press(a);
      return true;
    },
    blur() { if (session.started && !session.over) pause(); },
    resize: layout,
    settingsChanged() {
      keys = keyMap();
      renderer.configure({ theme: app.theme, highContrast: settings.highContrast, ghost: settings.ghost, reduced: app.reduced });
      input?.setTiming({ das: settings.das, arr: settings.arr, softDrop: settings.softDrop });
      queueSig = holdSig = '';
    },
    unmount() {
      ro.disconnect();
      document.removeEventListener('keyup', onKeyUp);
      input?.reset();
      app.debug?.attach(null);
      app.audio.setMusic('menu');
    }
  };
}
