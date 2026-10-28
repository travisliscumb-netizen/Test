/* =====================================================================
   [UNDERWORLD] TOOLS (M10): lockpicks. A set is bought from Dockside Sully
   (Dirty Cash), carried (up to TOOLS.carry), and stashed at any property you
   own that holds things. A break-in needs one: a house door, a property you
   don't own, a shop's staff door picked quietly instead of shouldered. Each
   job uses a set up. An arrest takes the ones on you (and they are on the
   charge sheet: possession of burglary tools); stashed ones stay put.
   State: save.uw.tools = { picks, at: { propId: n } }.
   ===================================================================== */
const TOOLS = { price: 150, carry: 5, stash: 50, days: 3 };
class Tools {
  constructor(uw) { this.uw = uw; }
  get T() { const S = this.uw.S; return S.tools || (S.tools = { picks: 0, at: {} }); }
  static sanitize(T, num) {
    const out = { picks: 0, at: {} }; if (!T || typeof T !== 'object') return out;
    out.picks = Math.floor(num(T.picks, 0, 0, TOOLS.carry));
    if (T.at && typeof T.at === 'object') for (const id in T.at) { const d = PROP_BY_ID[id], n = Math.floor(num(T.at[id], 0, 0, TOOLS.stash)); if (d && n > 0) out.at[id] = n; }
    return out;
  }
  get picks() { return this.T.picks; }
  // a break-in uses a set up; true when there was one
  usePick() { const T = this.T; if (T.picks <= 0) return false; T.picks--; return true; }
  // at Sully's: returns '' or why not
  buy(n = 1) {
    const T = this.T; n = Math.min(n, TOOLS.carry - T.picks);
    if (n <= 0) return `You can carry ${TOOLS.carry} sets.`;
    if (!Money.can(n * TOOLS.price, 'lockpick')) return 'Cash on you only.';
    Money.pay(n * TOOLS.price, 'lockpick'); T.picks += n; this.uw.g.saveGame();
    return '';
  }
  // a property's stash: in person, at a place that holds things
  canStash(id) { return this.uw.props.owned(id) && Money.canHoldCash(id); }
  store(id, n) { const T = this.T; if (!this.canStash(id)) return 'Nowhere to keep them here.'; n = Math.min(n, T.picks, TOOLS.stash - (T.at[id] || 0)); if (n <= 0) return 'Nothing to put away.'; T.picks -= n; T.at[id] = (T.at[id] || 0) + n; return ''; }
  take(id, n) { const T = this.T, have = T.at[id] || 0; n = Math.min(n, have, TOOLS.carry - T.picks); if (n <= 0) return have ? `You can carry ${TOOLS.carry} sets.` : 'None stashed here.'; T.at[id] = have - n; if (!T.at[id]) delete T.at[id]; T.picks += n; return ''; }
  // an arrest: the sets on you go
  confiscate() { const n = this.T.picks; this.T.picks = 0; return n; }
  stashHTML(id) {
    if (!this.canStash(id)) return '';
    const T = this.T, here = T.at[id] || 0;
    return `<h3>Tools</h3><div class="job"><div style="flex:1"><b>Lockpick sets</b><span>${T.picks} on you · ${here} here</span></div><button class="sbtn" data-act="tpst" ${T.picks ? '' : 'disabled'}>Store all</button><button class="sbtn" data-act="tptk" ${here && T.picks < TOOLS.carry ? '' : 'disabled'}>Take</button></div>`;
  }
  shopHTML() {
    const T = this.T;
    return `<h3>Tools</h3><div class="job"><div style="flex:1"><b>Lockpick set</b><span>${fmtMoney(TOOLS.price)} each, cash · you carry ${T.picks}/${TOOLS.carry} · one set per break-in · the police take them if they catch you with them</span></div><button class="sbtn gold" data-act="pick:1" ${T.picks < TOOLS.carry && Money.can(TOOLS.price, 'lockpick') ? '' : 'disabled'}>Buy 1</button><button class="sbtn" data-act="pick:${TOOLS.carry}" ${T.picks < TOOLS.carry && Money.can(TOOLS.price, 'lockpick') ? '' : 'disabled'}>Fill up</button></div>`;
  }
}
