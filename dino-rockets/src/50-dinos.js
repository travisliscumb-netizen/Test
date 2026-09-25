/* ============================================================
   THE CREW — Rex, Trike, Dash, Swoop — and every baby dino.

   Drawn side-on, facing right. The stage mirrors them to face the way
   they are moving, which is what makes a dinosaur read as a dinosaur:
   a T. rex from the front is a blob, a T. rex in profile is a T. rex.

   One shared face language: a single big eye with a moving pupil, a brow,
   and a mouth along the snout. Every expressive part is a class the stage
   toggles (see 15-stage.css), never a redraw:
     .eyes (pupil group, moved to LOOK)  .eye (blinks)  .eye-happy  .brow
     .m-smile / .m-open / .m-oops  .sweat
   Rig parts carry a pivot (data-px / data-py) the stage rotates about:
     .head .jaw .tail .leg-f .leg-b .arm .wing-n .wing-f .frill .scarf .jet

   Every drawing takes a colour set and an age, so a baby is the same
   dinosaur in new colours with baby proportions (bigger head and eye) and
   his own small set of astronaut gear. Level 4 earns a gold star badge,
   level 5 a crown.
   ============================================================ */
var DINO_INK = '#14213D';
var __dinoUid = 0;

function dinoFace(ex, ey, r, stroke, mouth){
  /* mouth: { d: smile path, open: open-mouth path, tongue: [cx,cy,rx,ry] } */
  var er = r || 12;
  return '' +
    '<path class="brow" d="M' + (ex - er * 0.9) + ' ' + (ey - er - 5) + ' Q' + ex + ' ' + (ey - er - 11) + ' ' + (ex + er * 0.9) + ' ' + (ey - er - 6) +
      '" fill="none" stroke="' + stroke + '" stroke-width="4.5" stroke-linecap="round"/>' +
    '<ellipse class="eye white" cx="' + ex + '" cy="' + ey + '" rx="' + er + '" ry="' + (er * 1.1) + '" fill="#fff" stroke="' + stroke + '" stroke-width="3.5"/>' +
    '<g class="eyes"><circle class="eye pupil" cx="' + (ex + er * 0.18) + '" cy="' + (ey + 1) + '" r="' + (er * 0.52) + '" fill="' + DINO_INK + '"/>' +
      '<circle class="eye glint" cx="' + (ex + er * 0.02) + '" cy="' + (ey - er * 0.2) + '" r="' + (er * 0.2) + '" fill="#fff"/></g>' +
    '<path class="eye-happy" d="M' + (ex - er * 0.85) + ' ' + (ey + 3) + ' Q' + ex + ' ' + (ey - er) + ' ' + (ex + er * 0.85) + ' ' + (ey + 3) +
      '" fill="none" stroke="' + DINO_INK + '" stroke-width="5" stroke-linecap="round"/>' +
    '<path class="m-smile" d="' + mouth.d + '" fill="none" stroke="' + DINO_INK + '" stroke-width="3.8" stroke-linecap="round"/>' +
    '<g class="m-open"><path d="' + mouth.open + '" fill="' + DINO_INK + '"/>' +
      (mouth.tongue ? '<ellipse cx="' + mouth.tongue[0] + '" cy="' + mouth.tongue[1] + '" rx="' + mouth.tongue[2] + '" ry="' + mouth.tongue[3] + '" fill="#FF7A45"/>' : '') + '</g>' +
    '<path class="m-oops" d="' + mouth.oops + '" fill="none" stroke="' + DINO_INK + '" stroke-width="3.4" stroke-linecap="round"/>' +
    '<path class="sweat" d="M' + (ex - er - 8) + ' ' + (ey - er - 12) + ' q-6 9 0 12 q6 -3 0 -12 z" fill="#A9DCFF" stroke="#2F7FD0" stroke-width="2.4"/>';
}

function starBadge(x, y){
  return '<g class="badge"><circle cx="' + x + '" cy="' + y + '" r="9.5" fill="#FFC53D" stroke="#8A5A08" stroke-width="2.5"/>' +
    '<path d="M' + x + ' ' + (y - 6) + ' l1.9 3.9 4.3 .6 -3.1 3 .7 4.3 -3.8 -2 -3.8 2 .7 -4.3 -3.1 -3 4.3 -.6z" fill="#fff"/></g>';
}
function crown(x, y){
  return '<g class="crown"><path d="M' + (x - 14) + ' ' + y + ' l3 -16 7 9 4 -13 4 13 7 -9 3 16 z" fill="#FFC53D" stroke="#8A5A08" stroke-width="2.6" stroke-linejoin="round"/>' +
    '<circle cx="' + x + '" cy="' + (y - 5) + '" r="2.6" fill="#E53935"/></g>';
}
/* o.young: 1 for a baby, 0.5 for a kid, 0 grown. o.gear defaults on. */
function ageOf(o){ return o.young != null ? Math.max(0, Math.min(1, o.young)) : (o.baby ? 1 : 0); }

function grad(id, top, bottom){
  return '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + top + '"/><stop offset="1" stop-color="' + bottom + '"/></linearGradient>';
}
function shade(hex, k){
  var n = parseInt(hex.slice(1), 16);
  var r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  function f(v){ return Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)))); }
  return '#' + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1);
}
function paletteFrom(body, spots){
  return { body: body, light: shade(body, 0.35), dark: shade(body, -0.35), line: shade(body, -0.62), belly: shade(body, 0.62), spots: spots || shade(body, -0.25) };
}
function patternMarks(kind, pal, pattern){
  if (pattern === 'plain') return '';
  var pts = { rex: [[70, 110], [86, 98], [102, 104], [80, 124]], trike: [[70, 112], [92, 104], [112, 110], [84, 126]],
              dash: [[76, 104], [92, 100], [108, 104]], swoop: [[96, 104], [106, 112]] }[kind] || [];
  if (pattern === 'stripes') return pts.map(function(p){
    return '<path d="M' + p[0] + ' ' + (p[1] - 9) + ' q4 9 0 18" fill="none" stroke="' + pal.spots + '" stroke-width="5" stroke-linecap="round" opacity=".8"/>';
  }).join('');
  return pts.map(function(p, i){ return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (4 + (i % 2) * 2) + '" fill="' + pal.spots + '" opacity=".85"/>'; }).join('');
}

/* ---------------- REX — T. rex, jet pack, tiny arms ---------------- */
function rexArt(o){
  o = o || {};
  var pal = paletteFrom(o.body || '#3FBF4F', o.spots || '#2A8C3A');
  var u = 'rx' + (++__dinoUid), y = ageOf(o), gear = o.gear !== false, L = pal.line;
  var hs = 1 + y * 0.18;
  /* the jet pack rides high on his back like a school backpack, strapped
     across his chest; the nozzle points down and back, so the flame pushes
     him up and forward instead of shooting out of his seat */
  var jet = !gear ? '' :
    '<g class="jetpack">' +
      '<g transform="rotate(-14 86 66)">' +
        '<rect x="71" y="44" width="30" height="52" rx="12" fill="#FF8A1F" stroke="#8A3A08" stroke-width="4"/>' +
        '<rect x="77" y="51" width="18" height="11" rx="5" fill="#FFD24A" stroke="#8A3A08" stroke-width="2"/>' +
        '<path d="M75 74 h22" stroke="#C4520A" stroke-width="3" stroke-linecap="round"/>' +
      '</g>' +
      '<path d="M64 88 l-10 14 l10 5 l8 -12 z" fill="#5E6B80" stroke="#2E3440" stroke-width="3" stroke-linejoin="round"/>' +
      '<g class="jet" data-px="58" data-py="105"><path d="M58 105 q2 26 -18 40 q-4 -24 18 -40z" fill="#FF8A1F"/><path d="M57 109 q1 15 -10 24 q-2 -14 10 -24z" fill="#FFE08A"/></g>' +
    '</g>';
  var straps = !gear ? '' :
    '<path d="M94 86 Q110 104 116 134" fill="none" stroke="#8A3A08" stroke-width="8" stroke-linecap="round"/>' +
    '<path d="M94 86 Q110 104 116 134" fill="none" stroke="#FF8A1F" stroke-width="4" stroke-linecap="round"/>' +
    '<rect x="105" y="108" width="10" height="10" rx="2" fill="#FFD24A" stroke="#8A3A08" stroke-width="2.2" transform="rotate(24 110 113)"/>';
  return '<svg viewBox="0 0 200 200" aria-hidden="true"><defs>' + grad(u, pal.light, pal.body) + '</defs>' +
    '<g class="tail" data-px="76" data-py="118"><path d="M82 102 Q46 92 6 84 Q22 110 44 122 Q64 132 86 136 Z" fill="url(#' + u + ')" stroke="' + L + '" stroke-width="4.5" stroke-linejoin="round"/></g>' +
    '<g class="leg-b" data-px="104" data-py="140"><path d="M96 138 q18 -4 20 12 l2 30 q10 2 10 8 h-30 l2 -34 z" fill="' + pal.dark + '" stroke="' + L + '" stroke-width="4" stroke-linejoin="round"/></g>' +
    jet +
    '<path d="M60 116 C58 86 84 74 108 80 C134 86 138 116 128 136 C118 156 72 158 62 138 Z" fill="url(#' + u + ')" stroke="' + L + '" stroke-width="5" stroke-linejoin="round"/>' +
    '<path d="M104 96 C124 100 128 124 118 142 C106 150 92 146 94 132 C98 120 96 106 104 96 Z" fill="' + pal.belly + '" opacity=".9"/>' +
    patternMarks('rex', pal, o.pattern || 'spots') +
    straps +
    '<g class="leg-f" data-px="86" data-py="140"><path d="M76 136 q18 -6 22 10 l2 32 q12 2 12 10 h-34 l2 -36 z" fill="url(#' + u + ')" stroke="' + L + '" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M82 188 v-6 M90 188 v-6 M98 188 v-6" stroke="' + L + '" stroke-width="3" stroke-linecap="round"/></g>' +
    /* the famous tiny arm */
    '<g class="arm" data-px="122" data-py="118"><path d="M120 116 q12 2 16 12 q-2 5 -7 3 q-4 -7 -11 -7 z" fill="' + pal.dark + '" stroke="' + L + '" stroke-width="3.2" stroke-linejoin="round"/>' +
      '<path d="M135 128 l5 3 M133 131 l3 5" stroke="' + L + '" stroke-width="2.6" stroke-linecap="round"/></g>' +
    '<g class="head" data-px="118" data-py="92" transform="translate(118 92) scale(' + hs + ') translate(-118 -92)">' +
      '<g class="jaw" data-px="124" data-py="92"><path d="M118 88 Q150 94 178 92 Q182 104 168 110 Q140 114 118 106 Z" fill="' + pal.dark + '" stroke="' + L + '" stroke-width="4.2" stroke-linejoin="round"/>' +
        '<path d="M146 104 l4 -6 l4 6 M160 102 l4 -6 l4 6" fill="#fff" stroke="' + L + '" stroke-width="1.5" stroke-linejoin="round"/></g>' +
      '<path d="M108 74 C110 44 146 36 172 48 C190 56 194 76 182 88 Q150 96 118 92 Q106 88 108 74 Z" fill="url(#' + u + ')" stroke="' + L + '" stroke-width="5" stroke-linejoin="round"/>' +
      '<ellipse cx="128" cy="54" rx="11" ry="6" fill="#fff" opacity=".35" transform="rotate(-18 128 54)"/>' +
      '<circle cx="180" cy="62" r="2.8" fill="' + L + '"/>' +
      dinoFace(144, 62, 12.5 + y * 2.5, L, {
        d: 'M150 84 Q166 90 182 80', open: 'M146 82 Q166 80 184 80 Q182 100 164 104 Q148 104 146 82 Z', tongue: [164, 97, 9, 4],
        oops: 'M150 86 q4 -4 8 0 t8 0 t8 0'
      }) +
      (o.crown ? crown(146, 46) : '') +
    '</g>' +
    (o.badge ? starBadge(108, 128) : '') +
  '</svg>';
}

/* ---------------- TRIKE — triceratops: horns, frill, four stomping legs ---------------- */
function trikeArt(o){
  o = o || {};
  var pal = paletteFrom(o.body || '#2F7BF5', o.spots || '#1A4FB0');
  var u = 'tk' + (++__dinoUid), y = ageOf(o), L = pal.line;
  var hs = 1 + y * 0.2;
  function leg(cls, px, fill){
    return '<g class="' + cls + '" data-px="' + px + '" data-py="140"><path d="M' + (px - 12) + ' 136 h24 l-1 42 q10 2 10 10 h-32 q0 -8 2 -10 z" fill="' + fill + '" stroke="' + L + '" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M' + (px - 8) + ' 188 v-5 M' + px + ' 188 v-5 M' + (px + 8) + ' 188 v-5" stroke="' + L + '" stroke-width="2.6" stroke-linecap="round"/></g>';
  }
  return '<svg viewBox="0 0 200 200" aria-hidden="true"><defs>' + grad(u, pal.light, pal.body) + '</defs>' +
    '<path d="M44 116 Q20 120 6 132 Q28 136 48 132 Z" fill="' + pal.dark + '" stroke="' + L + '" stroke-width="4" stroke-linejoin="round"/>' +
    leg('leg-b', 66, pal.dark) + leg('leg-f', 138, pal.dark) +
    '<path d="M40 122 C40 90 76 76 110 78 C142 80 156 100 152 124 C148 146 116 152 90 150 C60 150 40 144 40 122 Z" fill="url(#' + u + ')" stroke="' + L + '" stroke-width="5" stroke-linejoin="round"/>' +
    '<path d="M60 136 C80 146 120 146 140 134 C136 146 112 152 90 150 C72 150 62 146 60 136 Z" fill="' + pal.belly + '" opacity=".8"/>' +
    patternMarks('trike', pal, o.pattern || 'spots') +
    /* plates along the back */
    '<path d="M62 86 l6 -10 l6 10 M82 80 l6 -11 l6 11 M102 79 l6 -10 l6 10" fill="' + pal.light + '" stroke="' + L + '" stroke-width="3" stroke-linejoin="round"/>' +
    leg('leg-b', 80, 'url(#' + u + ')') + leg('leg-f', 124, 'url(#' + u + ')') +
    '<g class="head" data-px="140" data-py="112" transform="translate(140 112) scale(' + hs + ') translate(-140 -112)">' +
      /* the frill: a fan behind the head, trimmed in orange */
      '<g class="frill" data-px="142" data-py="104"><path d="M112 118 C104 86 118 58 146 56 C172 56 180 80 170 102 Z" fill="' + pal.light + '" stroke="' + L + '" stroke-width="4.5" stroke-linejoin="round"/>' +
        '<circle cx="124" cy="80" r="4.5" fill="#FF8A1F"/><circle cx="138" cy="66" r="4.5" fill="#FF8A1F"/><circle cx="156" cy="64" r="4.5" fill="#FF8A1F"/></g>' +
      '<path d="M132 104 C132 86 152 82 170 88 C186 94 196 106 194 118 Q186 130 166 130 Q140 130 132 104 Z" fill="url(#' + u + ')" stroke="' + L + '" stroke-width="5" stroke-linejoin="round"/>' +
      '<path d="M186 108 Q198 110 196 122 Q188 124 184 118 Z" fill="#FFE8C2" stroke="' + L + '" stroke-width="3" stroke-linejoin="round"/>' +
      /* horns */
      '<path d="M156 86 Q168 66 194 58 Q180 74 170 92 Z" fill="#FFF4DC" stroke="' + L + '" stroke-width="3.4" stroke-linejoin="round"/>' +
      '<path d="M144 88 Q150 70 170 60 Q162 76 156 92 Z" fill="#FFF4DC" stroke="' + L + '" stroke-width="3.4" stroke-linejoin="round"/>' +
      '<path d="M180 98 Q184 88 192 86 Q190 96 188 102 Z" fill="#FFF4DC" stroke="' + L + '" stroke-width="3" stroke-linejoin="round"/>' +
      dinoFace(158, 104, 11.5 + y * 2, L, {
        d: 'M164 120 Q176 126 186 120', open: 'M162 118 Q176 116 188 118 Q186 132 174 134 Q164 132 162 118 Z', tongue: [175, 128, 7, 3.5],
        oops: 'M163 122 q3.5 -4 7 0 t7 0 t7 0'
      }) +
      (o.crown ? crown(150, 58) : '') +
    '</g>' +
    (o.badge ? starBadge(118, 124) : '') +
  '</svg>';
}

/* ---------------- DASH — raptor: long legs, sickle claw, speed goggles ---------------- */
function dashArt(o){
  o = o || {};
  var pal = paletteFrom(o.body || '#FF8A1F', o.spots || '#B8520A');
  var u = 'ds' + (++__dinoUid), y = ageOf(o), gear = o.gear !== false, L = pal.line;
  var hs = 1 + y * 0.22;
  function leg(cls, px, fill){
    return '<g class="' + cls + '" data-px="' + px + '" data-py="118"><path d="M' + (px - 10) + ' 114 q16 -2 16 14 l-8 28 l10 28 q12 0 14 6 h-24 l-12 -32 l6 -30 z" fill="' + fill + '" stroke="' + L + '" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M' + (px + 2) + ' 184 q-8 -4 -6 -12" fill="none" stroke="#FFF4DC" stroke-width="3.5" stroke-linecap="round"/></g>';
  }
  return '<svg viewBox="0 0 200 200" aria-hidden="true"><defs>' + grad(u, pal.light, pal.body) + '</defs>' +
    '<g class="tail" data-px="70" data-py="106"><path d="M76 98 Q40 88 4 80 Q14 96 30 104 Q52 114 78 118 Z" fill="url(#' + u + ')" stroke="' + L + '" stroke-width="4.5" stroke-linejoin="round"/>' +
      '<path d="M24 86 l4 12 M40 90 l4 12 M56 94 l3 12" stroke="' + pal.spots + '" stroke-width="5" stroke-linecap="round"/></g>' +
    leg('leg-b', 96, pal.dark) +
    '<path d="M66 104 C66 86 92 80 116 84 C134 88 140 104 132 116 C122 128 84 130 70 120 Z" fill="url(#' + u + ')" stroke="' + L + '" stroke-width="5" stroke-linejoin="round"/>' +
    '<path d="M96 116 C112 118 126 114 132 108 C130 120 114 128 98 126 Z" fill="' + pal.belly + '" opacity=".85"/>' +
    patternMarks('dash', pal, o.pattern || 'stripes') +
    leg('leg-f', 84, 'url(#' + u + ')') +
    '<g class="arm" data-px="124" data-py="108"><path d="M122 104 q14 4 16 16 l-6 2 q-4 -8 -12 -10 z" fill="' + pal.dark + '" stroke="' + L + '" stroke-width="3" stroke-linejoin="round"/></g>' +
    '<g class="head" data-px="126" data-py="92" transform="translate(126 92) scale(' + hs + ') translate(-126 -92)">' +
      '<path d="M118 96 C114 72 132 56 156 58 C176 60 196 68 196 80 C196 92 176 96 156 96 Q134 102 118 96 Z" fill="url(#' + u + ')" stroke="' + L + '" stroke-width="5" stroke-linejoin="round"/>' +
      /* head crest: little blue feathers */
      '<path d="M128 62 l-8 -12 l12 6 l0 -12 l8 12 l4 -10 l4 14" fill="#2F7BF5" stroke="' + L + '" stroke-width="3" stroke-linejoin="round"/>' +
      (!gear ? '' : '<g class="goggles"><path d="M130 58 Q148 50 166 56" fill="none" stroke="#14213D" stroke-width="5" stroke-linecap="round"/>' +
        '<ellipse cx="160" cy="54" rx="9" ry="7" fill="#5DB0FF" stroke="#14213D" stroke-width="3.5"/><ellipse cx="157" cy="52" rx="3" ry="2" fill="#fff"/></g>') +
      '<circle cx="190" cy="74" r="2.4" fill="' + L + '"/>' +
      dinoFace(150, 76, 11.5 + y * 2.5, L, {
        d: 'M158 90 Q174 94 190 88', open: 'M156 88 Q174 86 192 88 Q188 102 172 104 Q158 102 156 88 Z', tongue: [173, 98, 8, 3.5],
        oops: 'M158 91 q4 -4 8 0 t8 0 t8 0'
      }) +
      (o.crown ? crown(152, 54) : '') +
    '</g>' +
    (o.badge ? starBadge(110, 106) : '') +
  '</svg>';
}

/* ---------------- SWOOP — pterosaur: crest, big wings, aviator scarf ---------------- */
function swoopArt(o){
  o = o || {};
  var pal = paletteFrom(o.body || '#E53935', o.spots || '#A51F1C');
  var u = 'sw' + (++__dinoUid), y = ageOf(o), gear = o.gear !== false, L = pal.line;
  var hs = 1 + y * 0.2;
  function wing(cls, fill, op){
    return '<g class="' + cls + '" data-px="104" data-py="100"' + (op ? ' opacity="' + op + '"' : '') + '>' +
      '<path d="M104 98 Q86 56 44 30 Q40 54 30 74 Q56 76 70 92 Q82 108 104 112 Z" fill="' + fill + '" stroke="' + L + '" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M100 100 Q80 64 46 36" fill="none" stroke="' + L + '" stroke-width="2.5" opacity=".6"/></g>';
  }
  return '<svg viewBox="0 0 200 200" aria-hidden="true"><defs>' + grad(u, pal.light, pal.body) + '</defs>' +
    wing('wing-f', pal.dark, null) +
    (!gear ? '' : '<g class="scarf" data-px="112" data-py="94"><path d="M112 92 Q86 88 64 100 Q80 104 70 116 Q92 106 114 102 Z" fill="#FFC53D" stroke="#9A6A08" stroke-width="3" stroke-linejoin="round"/></g>') +
    '<g class="leg-b" data-px="98" data-py="124"><path d="M94 122 l-2 22 l-8 6 M92 144 l4 6 M92 144 l8 4" fill="none" stroke="' + L + '" stroke-width="4.5" stroke-linecap="round"/></g>' +
    '<g class="leg-f" data-px="108" data-py="124"><path d="M106 122 l2 22 l-8 6 M108 144 l4 6 M108 144 l8 4" fill="none" stroke="' + L + '" stroke-width="4.5" stroke-linecap="round"/></g>' +
    '<path d="M80 110 C80 92 96 84 112 88 C128 92 132 110 124 122 C116 132 90 132 84 124 Z" fill="url(#' + u + ')" stroke="' + L + '" stroke-width="5" stroke-linejoin="round"/>' +
    '<path d="M100 120 C110 124 120 120 124 114 C122 124 112 130 100 128 Z" fill="' + pal.belly + '" opacity=".85"/>' +
    patternMarks('swoop', pal, o.pattern || 'plain') +
    wing('wing-n', 'url(#' + u + ')', null) +
    '<g class="head" data-px="118" data-py="92" transform="translate(118 92) scale(' + hs + ') translate(-118 -92)">' +
      /* the crest sweeping back */
      '<path d="M122 74 Q104 56 84 50 Q108 50 132 64 Z" fill="#FFC53D" stroke="' + L + '" stroke-width="3.6" stroke-linejoin="round"/>' +
      '<path d="M112 92 C108 70 124 60 142 62 C156 64 166 72 196 84 Q170 92 150 94 Q128 100 112 92 Z" fill="url(#' + u + ')" stroke="' + L + '" stroke-width="5" stroke-linejoin="round"/>' +
      (!gear ? '' : '<g class="goggles"><path d="M118 70 Q132 62 146 66" fill="none" stroke="#5B3A1A" stroke-width="4.5" stroke-linecap="round"/>' +
        '<circle cx="124" cy="66" r="6.5" fill="#FFC53D" stroke="#5B3A1A" stroke-width="3"/><circle cx="123" cy="64.5" r="2" fill="#fff"/></g>') +
      dinoFace(138, 76, 11 + y * 2, L, {
        d: 'M150 88 Q166 90 184 86', open: 'M148 86 Q166 84 186 86 Q180 98 164 100 Q152 98 148 86 Z', tongue: [165, 94, 7, 3],
        oops: 'M150 89 q4 -4 8 0 t8 0 t8 0'
      }) +
      (o.crown ? crown(140, 60) : '') +
    '</g>' +
    (o.badge ? starBadge(108, 110) : '') +
  '</svg>';
}

var DINO_ART = { rex: rexArt, trike: trikeArt, dash: dashArt, swoop: swoopArt };
/* A freshly hatched baby: the same dinosaur, new colours, baby proportions. */
function babyArt(b){
  var f = DINO_ART[b.kind] || rexArt;
  return f({ body: b.body, spots: b.spots, pattern: b.pattern, young: 1 });
}
/* Any crew member as he is now: colours, age, and what his level has earned. */
var YOUNG = { baby: 1, kid: 0.5, grown: 0 };
function memberArt(m){
  var f = DINO_ART[m.kind] || rexArt;
  return f({ body: m.body || null, spots: m.spots || null, pattern: m.pattern || null,
             young: YOUNG[m.grow] != null ? YOUNG[m.grow] : 0, badge: (m.level || 1) >= 4, crown: (m.level || 1) >= 5 });
}

if (typeof module !== 'undefined' && module.exports){
  module.exports = { DINO_ART: DINO_ART, babyArt: babyArt, memberArt: memberArt, rexArt: rexArt, trikeArt: trikeArt, dashArt: dashArt, swoopArt: swoopArt, shade: shade, DINO_INK: DINO_INK };
}
