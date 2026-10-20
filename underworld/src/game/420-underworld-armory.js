/* =====================================================================
   [UNDERWORLD] ARMORY: one owned copy of each gun (no duplicates), and it is
   always somewhere: on you, or in the stash at one of your properties.
   Ammunition is counted in rounds (in the magazine, in your pockets, in each
   stash); armour is the vest you wear plus spare vests kept in stashes.
   The loadout groups it all as MELEE / SECONDARY / PRIMARY / ARMOR.
   ===================================================================== */
const SLOT_NAMES = { melee: 'MELEE', secondary: 'SECONDARY', primary: 'PRIMARY' };
class Armory {
  constructor(uw) { this.uw = uw; }
  get g() { return this.uw.g; }
  get s() { return this.uw.g.save; }
  ws(pid) { const S = this.uw.S; return S.wstash[pid] || (S.wstash[pid] = freshWStash()); }
  where(gid) { if (gid === 'fists') return 'carried'; const s = this.s; if (!s.weapons[gid]) return null; return s.wloc[gid] || 'carried'; }
  whereText(gid) { const w = this.where(gid); return !w ? 'not owned' : w === 'carried' ? 'on you' : 'stored at ' + (PROP_BY_ID[w] ? PROP_BY_ID[w].name : 'a stash'); }
  roundsOn(gid) { return (this.s.ammo[gid] | 0) + (this.g.player.mag[gid] | 0); }
  roundsStashed(gid) { let n = 0; for (const id in this.uw.S.wstash) n += this.uw.S.wstash[id].ammo[gid] | 0; return n; }
  // ---- moves (only valid while you are at the property: the UI only offers them there)
  leave(gid, pid) {
    const s = this.s, p = this.g.player, w = WEAPONS.find(x => x.id === gid);
    if (!w || gid === 'fists' || this.where(gid) !== 'carried') return 'You are not carrying that.';
    s.wloc[gid] = pid;
    if (!w.melee) { s.ammo[gid] = (s.ammo[gid] | 0) + (p.mag[gid] | 0); p.mag[gid] = 0; if (p.reloadW === gid) { p.reloadT = 0; p.reloadW = null; } }
    if (WEAPONS[p.weapon] && WEAPONS[p.weapon].id === gid) p.weapon = 0;
    return `${w.name} left in the stash at ${PROP_BY_ID[pid].name}.`;
  }
  take(gid, pid) {
    const s = this.s, w = WEAPONS.find(x => x.id === gid);
    if (!w || s.wloc[gid] !== pid) return 'That gun is not here.';
    s.wloc[gid] = null; return `${w.name} taken. It’s on you now.`;
  }
  ammoLeave(gid, n, pid) { const s = this.s, A = this.ws(pid).ammo; n = n < 0 ? s.ammo[gid] | 0 : Math.min(n, s.ammo[gid] | 0); if (n <= 0) return 'No spare rounds on you (rounds in the magazine stay in the gun).'; s.ammo[gid] -= n; A[gid] = (A[gid] | 0) + n; return `Left ${n} ${WEAPONS.find(x => x.id === gid).ammoName}.`; }
  ammoTake(gid, n, pid) { const s = this.s, A = this.ws(pid).ammo; n = n < 0 ? A[gid] | 0 : Math.min(n, A[gid] | 0); if (n <= 0) return 'None here.'; A[gid] -= n; s.ammo[gid] = (s.ammo[gid] | 0) + n; return `Took ${n} ${WEAPONS.find(x => x.id === gid).ammoName}.`; }
  vestStore(pid) { const p = this.g.player; if (p.vest < 1) return 'You are not wearing a vest.'; this.ws(pid).vests.push(Math.round(p.vest)); p.vest = 0; this.s.vest = 0; return 'Vest off and stored.'; }
  vestWear(i, pid) {
    const p = this.g.player, V = this.ws(pid).vests; if (!(i >= 0 && i < V.length)) return 'No vest there.';
    const v = V.splice(i, 1)[0]; if (p.vest >= 1) V.push(Math.round(p.vest));
    p.vest = clamp(v, 0, VEST_MAX); this.s.vest = p.vest; return `Vest on (${Math.round(p.vest)} / ${VEST_MAX}).`;
  }
  equip(gid) { const p = this.g.player, i = WEAPONS.findIndex(w => w.id === gid); if (i < 0 || !p.carries(gid)) return 'You need to be carrying it.'; p.selectWeapon(i); return `${WEAPONS[i].name} in hand.`; }
  unequip() { this.g.player.weapon = 0; return 'Holstered: fists.'; }
  // ---- shared actions from any screen; returns a message, or null if the action is not ours
  act(a, pid) {
    const [k, x, y] = a.split(':');
    switch (k) {
      case 'eq': return this.equip(x);
      case 'uneq': return this.unequip();
      case 'wleave': return pid ? this.leave(x, pid) : 'Only at one of your properties.';
      case 'wtake': return pid ? this.take(x, pid) : 'Only at that property.';
      case 'aleave': return pid ? this.ammoLeave(x, +y, pid) : null;
      case 'atake': return pid ? this.ammoTake(x, +y, pid) : null;
      case 'vstore': return pid ? this.vestStore(pid) : null;
      case 'vwear': return pid ? this.vestWear(+x, pid) : null;
    }
    return null;
  }
  // ---- the loadout panel (armorer, phone, property): what you own, carry, have equipped, and where
  loadoutHTML(pid) {
    const s = this.s, p = this.g.player, cur = p.wep.id;
    const chip = (t, c) => `<span class="chip" style="--c:${c}">${t}</span>`;
    const row = w => {
      const own = w.id === 'fists' || s.weapons[w.id], where = this.where(w.id), eq = cur === w.id;
      let st = !own ? chip('NOT OWNED', '#5a6170') : eq ? chip('EQUIPPED', '#ffb547') : where === 'carried' ? chip('CARRIED', '#7fe08f') : chip('STORED', '#7fb2ff');
      let ammo = '';
      if (!w.melee && own) ammo = `<span>${p.mag[w.id] | 0} in the magazine · ${s.ammo[w.id] | 0} ${w.ammoName} on you${this.roundsStashed(w.id) ? ' · ' + this.roundsStashed(w.id) + ' in stashes' : ''}</span>`;
      else if (!w.melee) ammo = `<span>${(s.ammo[w.id] | 0) + this.roundsStashed(w.id)} ${w.ammoName} owned</span>`;
      const btns = [];
      if (own && where === 'carried' && !eq) btns.push(`<button class="sbtn gold" data-act="eq:${w.id}">Equip</button>`);
      if (eq && w.id !== 'fists') btns.push(`<button class="sbtn" data-act="uneq">Unequip</button>`);
      if (pid && own && w.id !== 'fists') {
        if (where === 'carried') btns.push(`<button class="sbtn" data-act="wleave:${w.id}">Move to stash</button>`);
        else if (where === pid) btns.push(`<button class="sbtn gold" data-act="wtake:${w.id}">Withdraw from stash</button>`);
      }
      return `<div class="job" style="flex-wrap:wrap"><i>${w.melee ? '✊' : '▸'}</i><div style="min-width:180px"><b>${w.name} ${st}</b><span>${own ? esc(this.whereText(w.id)) : 'Buy it from the Armorer'}</span>${ammo}</div><div class="btns">${btns.join('')}</div></div>`;
    };
    let h = '';
    for (const slot of ['melee', 'secondary', 'primary']) h += `<h3>${SLOT_NAMES[slot]}</h3><div class="jobs">${WEAPONS.filter(w => w.slot === slot).map(row).join('')}</div>`;
    const spares = []; for (const id in this.uw.S.wstash) for (const v of this.uw.S.wstash[id].vests) spares.push(`${PROP_BY_ID[id] ? PROP_BY_ID[id].name : id} (${Math.round(v)})`);
    h += `<h3>ARMOR</h3><div class="jobs"><div class="job"><i>⛨</i><div><b>Kevlar vest ${p.vest >= 1 ? chip('WORN', '#7fe08f') : chip('NONE', '#5a6170')}</b><span>${p.vest >= 1 ? `${Math.round(p.vest)} / ${VEST_MAX} armour points left` : 'Not wearing one'} · spares: ${spares.length ? esc(spares.join(', ')) : 'none'}</span></div></div></div>`;
    return h;
  }
  // ---- the weapons part of a property's stash screen
  stashHTML(pid) {
    const s = this.s, p = this.g.player, W = this.ws(pid);
    let h = `<h3>Weapons, ammo &amp; armour <small>${esc(PROP_BY_ID[pid].name)}</small></h3><div class="jobs">`;
    for (const w of WEAPONS) {
      if (w.id === 'fists' || !s.weapons[w.id]) continue;
      const where = this.where(w.id);
      h += `<div class="job"><i>${w.melee ? '✊' : '▸'}</i><div><b>${w.name}</b><span>${esc(this.whereText(w.id))}</span></div>${where === 'carried' ? `<button class="sbtn" data-act="wleave:${w.id}">Move to stash</button>` : where === pid ? `<button class="sbtn gold" data-act="wtake:${w.id}">Withdraw</button>` : ''}</div>`;
    }
    for (const w of WEAPONS) {
      if (w.melee) continue;
      const on = s.ammo[w.id] | 0, here = W.ammo[w.id] | 0; if (!on && !here) continue;
      h += `<div class="job" style="flex-wrap:wrap"><i>⁘</i><div style="min-width:170px"><b>${w.ammoName[0].toUpperCase() + w.ammoName.slice(1)}</b><span>${on} on you · ${here} here</span></div><div class="btns"><button class="sbtn" data-act="aleave:${w.id}:${w.mag}" ${on ? '' : 'disabled'}>Leave ${w.mag}</button><button class="sbtn" data-act="aleave:${w.id}:-1" ${on ? '' : 'disabled'}>Leave all</button><button class="sbtn" data-act="atake:${w.id}:-1" ${here ? '' : 'disabled'}>Take all</button></div></div>`;
    }
    h += `<div class="job" style="flex-wrap:wrap"><i>⛨</i><div style="min-width:170px"><b>Vests</b><span>wearing ${p.vest >= 1 ? Math.round(p.vest) + ' / ' + VEST_MAX : 'none'} · ${W.vests.length} spare here</span></div><div class="btns"><button class="sbtn" data-act="vstore" ${p.vest >= 1 ? '' : 'disabled'}>Take off &amp; store</button>${W.vests.map((v, i) => `<button class="sbtn gold" data-act="vwear:${i}">Wear spare (${Math.round(v)})</button>`).join('')}</div></div>`;
    return h + '</div>';
  }
  // every stash at a glance (read-only, from the phone or the armorer)
  stashesHTML() {
    const S = this.uw.S, s = this.s;
    const ids = new Set(Object.keys(S.wstash)); for (const k of ARMORY_GUNS) if (s.wloc[k]) ids.add(s.wloc[k]);
    if (!ids.size) return '<div class="hint">Nothing stashed yet. At any property you own, open its menu to leave guns, rounds and spare vests there. Guns in a stash are not taken if you are arrested.</div>';
    let h = '<div class="grid2">';
    for (const id of ids) {
      const W = this.ws(id), guns = ARMORY_GUNS.filter(k => s.wloc[k] === id).map(k => WEAPONS.find(w => w.id === k).name);
      const ammo = WEAPONS.filter(w => !w.melee && W.ammo[w.id] > 0).map(w => `${W.ammo[w.id]} ${w.ammoName}`);
      const L = this.uw.loc('prop', id);
      h += `<div class="card"><div class="t">${esc(PROP_BY_ID[id] ? PROP_BY_ID[id].name : id)}</div><div class="d">Guns: ${guns.length ? esc(guns.join(', ')) : 'none'}<br>Ammo: ${ammo.length ? esc(ammo.join(', ')) : 'none'}<br>Spare vests: ${W.vests.length}</div>${L ? `<div class="btns">${this.uw.ui.wpBtn(L.x, L.z, PROP_BY_ID[id].name)}</div>` : ''}</div>`;
    }
    return h + '</div>';
  }
}

