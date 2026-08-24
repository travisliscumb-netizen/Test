
/* ============================================================================
   SECTION 08 — UI LAYER
   ----------------------------------------------------------------------------
   Tech Arch §14: UI observes game state, it never owns game rules. Everything
   here reads GAME/SAVE/CHEATS and writes only to the DOM (plus user intent
   handed back through GAME.* calls).
   S13: touch-first, large targets, no hover-dependent interaction.
   ========================================================================== */
var UPGRADES = [
  { id:'engine',    name:'Engine Coils',   desc:'Faster top speed and sharper acceleration.', cost:[900,2200,4500,8000,14000] },
  { id:'beamWidth', name:'Beam Aperture',  desc:'Wider tractor beam — easier to line targets up.', cost:[800,2000,4200,7500,13000] },
  { id:'beamPower', name:'Beam Emitter',   desc:'Grabs heavier animals faster.', cost:[1000,2400,5000,9000,15000] },
  { id:'shields',   name:'Hull Shielding', desc:'+25 shields per level.', cost:[1100,2600,5200,9500,16000] },
  { id:'boost',     name:'Boost Cells',    desc:'More boost, recharging quicker.', cost:[700,1800,3900,7000,12000] }
];
var MAX_UP_LEVEL = 5;

var UI = {
  el: {}, _toasts: [], _lastHud: {},

  init: function () {
    var self = this;
    var $ = function (id) { return document.getElementById(id); };
    this.el = {
      hud: $('hud'), score: $('c-score'), goal: $('c-goal'), time: $('c-time'),
      shield: $('shieldbar'), shieldFill: $('shieldbar').querySelector('i'),
      shieldTxt: $('shieldtxt'), alert: $('alert'), beamState: $('beamstate'),
      combo: $('combo'), toast: $('toast'), boostFill: $('boostbar').querySelector('i'),
      boostBtn: $('btn-boost'),
      title: $('scr-title'), pause: $('scr-pause'), result: $('scr-result'),
      campaign: $('scr-campaign'), upgrades: $('scr-upgrades'),
      cheats: $('scr-cheats'), settings: $('scr-settings')
    };

    function tap(id, fn) {
      var e = $(id);
      if (!e) return;
      e.addEventListener('click', function (ev) { AUDIO.unlock(); AUDIO.sfx('ui'); fn(ev); });
    }

    // title
    tap('m-play', function () { self.playNext(); });
    tap('m-campaign', function () { self.showCampaign(); });
    tap('m-upgrades', function () { self.showUpgrades(); });
    tap('m-cheats', function () { self.showCheats('title'); });
    tap('m-settings', function () { self.showSettings('title'); });
    tap('m-free', function () { GAME.startMission('farm', 0, true); });

    // pause
    tap('btn-pause', function () { GAME.pause(); });
    tap('p-resume', function () { GAME.resume(); });
    tap('p-restart', function () { GAME.startMission(GAME.map.id, GAME.missionIdx, GAME.freeplay); });
    tap('p-cheats', function () { self.showCheats('pause'); });
    tap('p-settings', function () { self.showSettings('pause'); });
    tap('p-quit', function () { GAME.quitToTitle(); });

    // result
    tap('r-next', function () { self.afterResult(); });
    tap('r-retry', function () { GAME.startMission(GAME.map.id, GAME.missionIdx, GAME.freeplay); });
    tap('r-quit', function () { GAME.quitToTitle(); });

    // back buttons
    tap('camp-back', function () { self.hideAll(); self.showTitle(); });
    tap('u-back', function () { self.hideAll(); self.showTitle(); });
    tap('ch-back', function () { self.backFrom('cheats'); });
    tap('set-back', function () { self.backFrom('settings'); });
    tap('ch-clear', function () { CHEATS.clear(); self.renderCheats(); self.toastNow('All cheats off.'); });
    tap('set-wipe', function () {
      if (window.confirm('Erase all saved progress, upgrades and settings? This cannot be undone.')) {
        SAVE.wipe(); self.renderSettings(); self.toastNow('Save erased.');
      }
    });
  },

  /* --------------------------------------------------------------- SCREENS -- */
  hideAll: function () {
    ['title','pause','result','campaign','upgrades','cheats','settings'].forEach(function (k) {
      UI.el[k].classList.add('hidden');
    });
  },
  showHUD: function (on) { this.el.hud.classList.toggle('hidden', !on); },

  showTitle: function () {
    this.hideAll(); this.showHUD(false);
    var d = SAVE.data;
    document.getElementById('t-career').textContent = d.career.toLocaleString();
    document.getElementById('t-combo').textContent = d.bestCombo + '×';
    document.getElementById('t-abd').textContent = d.totalAbducted.toLocaleString();
    var nx = this.nextMission();
    document.getElementById('m-play-hint').textContent =
      nx ? (MAPS[nx.mapId].name + ' · ' + nx.mission.name) : 'all clear';
    var lv = 0;
    UPGRADES.forEach(function (u) { lv += SAVE.data.upgrades[u.id]; });
    document.getElementById('m-up-hint').textContent =
      lv + '/' + (UPGRADES.length * MAX_UP_LEVEL) + ' · ' + SAVE.bank().toLocaleString() + ' pts';
    this.el.title.classList.remove('hidden');
  },

  /* first mission not yet completed, in campaign order */
  nextMission: function () {
    for (var i = 0; i < MAP_ORDER.length; i++) {
      var map = MAPS[MAP_ORDER[i]];
      if (!map.built) continue;
      for (var j = 0; j < map.missions.length; j++) {
        var key = map.id + ':' + map.missions[j].id;
        if (!(SAVE.data.progress.missions[key] || {}).done)
          return { mapId: map.id, idx: j, mission: map.missions[j] };
      }
    }
    return null;
  },
  playNext: function () {
    var nx = this.nextMission();
    if (nx) GAME.startMission(nx.mapId, nx.idx, false);
    else { this.toastNow('Campaign complete — starting free flight.'); GAME.startMission('farm', 0, true); }
  },
  afterResult: function () {
    var nx = this.nextMission();
    if (nx) GAME.startMission(nx.mapId, nx.idx, false);
    else GAME.quitToTitle();
  },

  showPause: function (g) {
    this.hideAll();
    document.getElementById('p-sub').textContent = g.freeplay
      ? 'Free flight' : (g.map.name + ' · ' + g.mission.name);
    this.el.pause.classList.remove('hidden');
  },

  showResult: function (g, won, reason) {
    this.hideAll(); this.showHUD(false);
    document.getElementById('r-title').textContent = won ? 'MISSION COMPLETE' : 'MISSION FAILED';
    document.getElementById('r-title').style.color = won ? 'var(--alien)' : 'var(--danger)';
    document.getElementById('r-sub').textContent = reason ||
      (won ? 'The herd is considerably smaller than it was.' : '');
    document.getElementById('r-score').textContent = g.score.toLocaleString();
    document.getElementById('r-count').textContent = g.taken + (g.goal ? '/' + g.goal : '');
    document.getElementById('r-combo').textContent = g.bestCombo + '×';

    var rows = '';
    SPECIES_KEYS.forEach(function (k) {
      var n = g.breakdown[k] || 0;
      if (!n) return;
      rows += '<div class="row"><div class="left"><div class="name">' + SPECIES[k].name +
              '</div><div class="desc">' + SPECIES[k].points + ' pts each</div></div>' +
              '<div class="badge ok">× ' + n + '</div></div>';
    });
    if (g.farmersTaken) rows += '<div class="row"><div class="left"><div class="name">Farmers</div>' +
      '<div class="desc">Returned unharmed, as always</div></div><div class="badge">× ' + g.farmersTaken + '</div></div>';
    if (CHEATS.any()) rows += '<div class="row"><div class="left"><div class="name">Cheats were on</div>' +
      '<div class="desc">Score still counts — this game has no shame about it</div></div>' +
      '<div class="badge">' + Object.keys(CHEATS.on).length + '</div></div>';
    if (!rows) rows = '<div class="row"><div class="left"><div class="desc">Nothing abducted. Bold strategy.</div></div></div>';
    document.getElementById('r-break').innerHTML = rows;

    document.getElementById('r-next').textContent = won ? '▶ NEXT MISSION' : '▶ CONTINUE';
    this.el.result.classList.remove('hidden');
  },

  /* ------------------------------------------------------------- CAMPAIGN -- */
  showCampaign: function () {
    this.hideAll();
    var list = document.getElementById('camp-list');
    var html = '';
    MAP_ORDER.forEach(function (id) {
      var map = MAPS[id];
      var unlocked = map.built && SAVE.data.progress.unlocked >= map.index;
      if (map.built) {
        html += '<div class="sec">' + map.index + '. ' + map.name.toUpperCase() + '</div>';
        map.missions.forEach(function (ms, j) {
          var key = map.id + ':' + ms.id;
          var rec = SAVE.data.progress.missions[key];
          var prevKey = j > 0 ? map.id + ':' + map.missions[j-1].id : null;
          var open = j === 0 || (SAVE.data.progress.missions[prevKey] || {}).done;
          html += '<button class="mbtn' + (open ? '' : '') + '" data-map="' + map.id +
            '" data-idx="' + j + '"' + (open ? '' : ' disabled') + '>' +
            '<span>' + ms.name + '<br><span class="hint">' + ms.goal + ' animals · ' +
            fmtTime(ms.time) + '</span></span>' +
            (rec && rec.done ? '<span class="badge ok">BEST ' + rec.best.toLocaleString() + '</span>'
                             : (open ? '<span class="badge">PLAY</span>'
                                     : '<span class="badge lock">LOCKED</span>')) + '</button>';
        });
      } else {
        html += '<button class="mbtn" disabled><span>' + map.index + '. ' + map.name +
          '<br><span class="hint">not built yet</span></span><span class="badge lock">SOON</span></button>';
      }
    });
    list.innerHTML = html;
    var self = this;
    Array.prototype.forEach.call(list.querySelectorAll('button[data-map]'), function (b) {
      b.addEventListener('click', function () {
        if (b.hasAttribute('disabled')) return;
        AUDIO.sfx('ui');
        GAME.startMission(b.getAttribute('data-map'), parseInt(b.getAttribute('data-idx'), 10), false);
      });
    });
    document.getElementById('camp-note').textContent =
      'Only the Farm is built. The other nine maps are locked on purpose: the project rule is that each ' +
      'environment gets researched and given its own props, architecture, vehicles and NPCs rather than ' +
      'recycled farm assets. The engine is already map-agnostic, so they plug in without rewriting anything.';
    this.el.campaign.classList.remove('hidden');
  },

  /* ------------------------------------------------------------- UPGRADES -- */
  showUpgrades: function () { this.hideAll(); this.renderUpgrades(); this.el.upgrades.classList.remove('hidden'); },
  renderUpgrades: function () {
    var bank = SAVE.bank();
    document.getElementById('u-bank').textContent = bank.toLocaleString();
    var html = '<div class="card">';
    UPGRADES.forEach(function (u) {
      var lv = SAVE.data.upgrades[u.id];
      var maxed = lv >= MAX_UP_LEVEL;
      var cost = maxed ? 0 : u.cost[lv];
      var pips = '';
      for (var i = 0; i < MAX_UP_LEVEL; i++) pips += i < lv ? '●' : '○';
      html += '<div class="row"><div class="left"><div class="name">' + u.name +
        ' <span class="hint" style="opacity:.7">' + pips + '</span></div>' +
        '<div class="desc">' + u.desc + '</div></div>' +
        (maxed ? '<span class="badge ok">MAX</span>'
               : '<button class="pill' + (bank >= cost ? ' on' : '') + '" data-up="' + u.id +
                 '" style="flex:none;min-width:96px">' + cost.toLocaleString() + '</button>') +
        '</div>';
    });
    html += '</div><p class="note">Upgrades are permanent. They persist across every mission and map, ' +
      'and are paid for out of career points — spending them never reduces your career total.</p>';
    document.getElementById('u-list').innerHTML = html;

    var self = this;
    Array.prototype.forEach.call(document.querySelectorAll('#u-list button[data-up]'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-up');
        var lv = SAVE.data.upgrades[id];
        var def = UPGRADES.filter(function (x) { return x.id === id; })[0];
        var cost = def.cost[lv];
        if (SAVE.bank() < cost) { self.toastNow('Not enough career points yet.'); return; }
        SAVE.data.upgrades[id] = lv + 1;
        SAVE.data.spent += cost;
        SAVE.queue();
        AUDIO.sfx('capture');
        self.renderUpgrades();
      });
    });
  },

  /* --------------------------------------------------------------- CHEATS -- */
  showCheats: function (from) { this._from = from; this.hideAll(); this.renderCheats(); this.el.cheats.classList.remove('hidden'); },
  renderCheats: function () {
    var html = '<div class="card">';
    CHEAT_DEFS.forEach(function (c) {
      var on = CHEATS.on[c.id];
      html += '<div class="row"><div class="left"><div class="name">' + c.name + '</div>' +
              '<div class="desc">' + c.desc + '</div></div>';
      if (c.step) {
        html += '<div class="step"><button data-step="' + c.id + '" data-d="-1">−</button>' +
                '<span class="v">' + (on || 1) + '</span>' +
                '<button data-step="' + c.id + '" data-d="1">+</button></div>';
      } else if (c.opts) {
        html += '<button class="pill' + (on ? ' on' : '') + '" data-opt="' + c.id +
                '" style="flex:none;min-width:96px">' + (on || c.opts[0]) + '</button>';
      } else {
        html += '<div class="tg' + (on ? ' on' : '') + '" data-cheat="' + c.id + '"><i></i></div>';
      }
      html += '</div>';
    });
    html += '</div><p class="note">Cheats are always available — no unlocking, no achievements. ' +
      'Mutually exclusive ones (UFO size, score multiplier, population, roster) swap rather than stack. ' +
      'Heavy population cheats are a genuine stress test; expect the frame rate to work for a living.</p>';
    document.getElementById('ch-list').innerHTML = html;

    var self = this;
    Array.prototype.forEach.call(document.querySelectorAll('#ch-list [data-cheat]'), function (t) {
      t.addEventListener('click', function () {
        var id = t.getAttribute('data-cheat');
        CHEATS.set(id, !CHEATS.on[id]);
        AUDIO.sfx('ui'); self.renderCheats();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#ch-list [data-step]'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-step'), d = parseInt(b.getAttribute('data-d'), 10);
        var def = CHEAT_DEFS.filter(function (x) { return x.id === id; })[0];
        var cur = CHEATS.on[id] || 1;
        var i = def.step.indexOf(cur);
        if (i < 0) i = 0;
        i = clamp(i + d, 0, def.step.length - 1);
        CHEATS.set(id, def.step[i] === 1 ? false : def.step[i]);
        AUDIO.sfx('ui'); self.renderCheats();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#ch-list [data-opt]'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-opt');
        var def = CHEAT_DEFS.filter(function (x) { return x.id === id; })[0];
        var cur = CHEATS.on[id] || def.opts[0];
        var i = (def.opts.indexOf(cur) + 1) % def.opts.length;
        CHEATS.set(id, def.opts[i] === 'Clear' ? false : def.opts[i]);
        AUDIO.sfx('ui'); self.renderCheats();
      });
    });
  },

  /* ------------------------------------------------------------- SETTINGS -- */
  showSettings: function (from) { this._from = from; this.hideAll(); this.renderSettings(); this.el.settings.classList.remove('hidden'); },
  renderSettings: function () {
    function slider(id, label, desc, val) {
      return '<div class="row"><div class="left"><div class="name">' + label + '</div>' +
        '<div class="desc">' + desc + '</div></div>' +
        '<input type="range" min="0" max="100" value="' + Math.round(val * 100) + '" data-set="' + id + '"></div>';
    }
    function toggle(id, label, desc, val) {
      return '<div class="row"><div class="left"><div class="name">' + label + '</div>' +
        '<div class="desc">' + desc + '</div></div>' +
        '<div class="tg' + (val ? ' on' : '') + '" data-tog="' + id + '"><i></i></div></div>';
    }
    var html = '<div class="sec">Audio</div><div class="card">' +
      slider('master', 'Master volume', 'Everything.', SETTINGS.master) +
      slider('music', 'Music', 'Relaxed farm loop that ramps when the farmer notices you.', SETTINGS.music) +
      slider('sfx', 'Sound effects', 'Beam, animals, impacts, UI.', SETTINGS.sfx) +
      '</div><div class="sec">Graphics</div><div class="card">' +
      '<div class="row"><div class="left"><div class="name">Quality preset</div>' +
      '<div class="desc">Takes effect on the next mission start.</div></div>' +
      '<div class="step">' +
      ['low','med','high'].map(function (q) {
        return '<button class="pill' + (SETTINGS.quality === q ? ' on' : '') +
               '" data-q="' + q + '" style="min-width:56px">' + q.toUpperCase() + '</button>';
      }).join('') + '</div></div>' +
      toggle('shadows', 'Shadows', 'Soft sun shadows. First thing dropped if frames get tight.', SETTINGS.shadows) +
      toggle('particles', 'Particles & grass', 'Beam dust, impacts, waving grass tufts.', SETTINGS.particles) +
      '</div><div class="sec">Controls & accessibility</div><div class="card">' +
      toggle('invertY', 'Invert altitude buttons', 'Swaps the up/down climb buttons.', SETTINGS.invertY) +
      toggle('showHints', 'Show hints', 'Briefing text and helper messages during play.', SETTINGS.showHints) +
      toggle('reduceMotion', 'Reduce motion', 'Calmer camera and less screen shake.', SETTINGS.reduceMotion) +
      '</div>';
    document.getElementById('set-list').innerHTML = html;

    var self = this;
    Array.prototype.forEach.call(document.querySelectorAll('#set-list input[data-set]'), function (s) {
      s.addEventListener('input', function () {
        SETTINGS[s.getAttribute('data-set')] = parseInt(s.value, 10) / 100;
        AUDIO.applyVolumes(); SAVE.queue();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#set-list [data-tog]'), function (t) {
      t.addEventListener('click', function () {
        var id = t.getAttribute('data-tog');
        SETTINGS[id] = !SETTINGS[id];
        if (id === 'shadows' && GAME.renderer) {
          GAME.renderer.shadowMap.enabled = SETTINGS.shadows;
          if (GAME.sun) GAME.sun.castShadow = SETTINGS.shadows;
        }
        SAVE.queue(); AUDIO.sfx('ui'); self.renderSettings();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#set-list [data-q]'), function (b) {
      b.addEventListener('click', function () {
        SETTINGS.quality = b.getAttribute('data-q');
        SAVE.queue(); AUDIO.sfx('ui'); self.renderSettings();
        self.toastNow('Applies on the next mission start.');
      });
    });
  },

  backFrom: function (which) {
    this.hideAll();
    if (this._from === 'pause' && GAME.phase === 'PAUSED') this.showPause(GAME);
    else this.showTitle();
  },

  /* ------------------------------------------------------------------ HUD -- */
  /* syncHUD = event-driven values. syncLive = per-frame values. Split so the
     DOM is not thrashed 60 times a second for things that rarely change. */
  syncHUD: function (g) {
    this.el.score.querySelector('.val').textContent = g.score.toLocaleString();
    this.el.goal.querySelector('.val').textContent = g.freeplay
      ? String(g.taken) : (g.taken + '/' + g.goal);
    this.el.goal.querySelector('.lab').textContent = g.freeplay ? 'Abducted' : 'Animals';
  },

  syncLive: function (g) {
    // timer
    if (g.freeplay) {
      this.el.time.querySelector('.val').textContent = '∞';
      this.el.time.classList.remove('low');
    } else {
      var s = Math.ceil(g.timeLeft);
      if (this._lastHud.t !== s) {
        this._lastHud.t = s;
        this.el.time.querySelector('.val').textContent = fmtTime(g.timeLeft);
        this.el.time.classList.toggle('low', g.timeLeft < 30);
      }
    }
    // shields
    var pct = Math.round(UFO.shield / UFO.maxShield * 100);
    if (this._lastHud.s !== pct) {
      this._lastHud.s = pct;
      this.el.shieldFill.style.width = pct + '%';
      this.el.shield.classList.toggle('hurt', pct < 35);
      this.el.shieldTxt.textContent = CHEATS.mod.invulnerable ? 'GOD MODE' : 'SHIELDS';
    }
    // boost
    var bp = Math.round(UFO.boost / (TUNE.ufo.boostMax + SAVE.data.upgrades.boost * 0.5) * 100);
    if (this._lastHud.b !== bp) {
      this._lastHud.b = bp;
      this.el.boostFill.style.width = bp + '%';
      this.el.boostBtn.classList.toggle('empty', bp < 6);
    }
    // beam state
    var bs = !BEAM.active ? 'BEAM READY'
           : (BEAM.target ? (BEAM.target.state === 'BEAMED' ? 'LIFTING' : 'LOCKED') : 'SEARCHING');
    if (this._lastHud.bs !== bs) {
      this._lastHud.bs = bs;
      this.el.beamState.textContent = bs;
      this.el.beamState.classList.toggle('on', BEAM.active);
    }
    // alert
    var lv = FARMERS.alertLevel();
    var cls = lv > 0.62 ? 's2' : (lv > 0.30 ? 's1' : '');
    var txt = CHEATS.mod.peacefulFarmer ? 'PEACEFUL'
            : (lv > 0.62 ? 'CHASING!' : (lv > 0.30 ? 'SUSPICIOUS' : 'CALM'));
    if (this._lastHud.a !== txt) {
      this._lastHud.a = txt;
      this.el.alert.className = cls;
      this.el.alert.querySelector('.txt').textContent = txt;
    }
  },

  popCombo: function (mult) {
    var c = this.el.combo;
    c.textContent = mult + '× COMBO';
    c.classList.remove('pop');
    void c.offsetWidth;              // restart the animation
    c.classList.add('pop');
  },

  floatScore: function (text) { this.toastNow(text, 900); },

  toastNow: function (text, ms) {
    var d = document.createElement('div');
    d.className = 'tmsg';
    d.textContent = text;
    this.el.toast.appendChild(d);
    setTimeout(function () {
      d.style.transition = 'opacity .3s';
      d.style.opacity = '0';
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 320);
    }, ms || 2400);
    // never let toasts stack up forever
    while (this.el.toast.children.length > 4)
      this.el.toast.removeChild(this.el.toast.firstChild);
  },

  flashDamage: function () {
    if (SETTINGS.reduceMotion) return;
    var f = document.createElement('div');
    f.style.cssText = 'position:fixed;inset:0;z-index:15;pointer-events:none;' +
      'background:radial-gradient(circle,transparent 45%,rgba(255,80,64,.55));' +
      'transition:opacity .35s;opacity:1';
    document.body.appendChild(f);
    requestAnimationFrame(function () {
      f.style.opacity = '0';
      setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 400);
    });
  }
};

/* ============================================================================
   BOOT
   ========================================================================== */
SAVE.load();
AUDIO.init();
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', function () { GAME.init(); });
else GAME.init();
