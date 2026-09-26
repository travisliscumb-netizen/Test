/* Phone layout check, injected by tests/run.mjs into a touch-emulated page.
   Starts a mission, then measures every touch button against every other
   button and against the HUD regions they must not cover: the objective list,
   the minimap, the health bar and the ammo readout (the last three are drawn
   on the HUD canvas, so their boxes are computed the way the painter lays
   them out). Everything must also sit fully on screen. */
'use strict';

window.__LAYOUT__ = function () {
  GAME.difficulty = 2;                       // longest objective list
  startMission();
  var w = window.innerWidth, h = window.innerHeight;
  var problems = [];
  if (!document.getElementById('touch').classList.contains('on')) problems.push('touch layer not shown on a touch device');

  function rectOf(el) { var r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }
  function overlap(a, b) { return a.l < b.r - 1 && a.r > b.l + 1 && a.t < b.b - 1 && a.b > b.t + 1; }

  // the USE button only appears near a terminal; measure it as if it had
  document.getElementById('btnUse').classList.add('on');
  var buttons = {};
  var list = document.querySelectorAll('#touch .tbtn');
  for (var i = 0; i < list.length; i++) buttons[list[i].id] = rectOf(list[i]);
  document.getElementById('btnUse').classList.remove('on');

  var mm = Math.min(132, Math.max(96, Math.round(Math.min(w, h) * 0.30)));
  var regions = {
    objectives: rectOf(document.getElementById('objective')),
    minimap: { l: w - hudInsetRight() - 14 - mm, t: hudInsetTop() + 14 - 12, r: w - hudInsetRight() - 14, b: hudInsetTop() + 14 + mm },
    health: { l: 16, t: h - 18 - 14 - 16, r: 16 + 200, b: h - 18 + 7 },
    ammo: { l: w - 16 - 150, t: h - 18 - 34 - 12, r: w - 16, b: h - 18 + 4 }
  };

  var ids = Object.keys(buttons);
  for (i = 0; i < ids.length; i++) {
    var a = buttons[ids[i]];
    if (a.l < 0 || a.t < 0 || a.r > w || a.b > h) problems.push(ids[i] + ' off screen');
    for (var j = i + 1; j < ids.length; j++) if (overlap(a, buttons[ids[j]])) problems.push(ids[i] + ' overlaps ' + ids[j]);
    for (var k in regions) if (overlap(a, regions[k])) problems.push(ids[i] + ' covers the ' + k);
  }
  if (overlap(regions.objectives, regions.minimap)) problems.push('objectives run under the minimap');
  // the mission is left running so the runner can photograph the HUD
  return { ok: problems.length === 0, detail: problems.join('; ') || (ids.length + ' buttons clear at ' + w + 'x' + h) };
};
