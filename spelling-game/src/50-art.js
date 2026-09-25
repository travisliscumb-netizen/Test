/* ============================================================
   CHARACTER ART — Blip, Zip, Trip, Flip

   One shared body, one shared face, four silhouettes. The face is
   deliberately identical on all four: it is the strongest signal that they
   belong to the same cast, so none of them gets its own eyes. Personality
   comes from colour, silhouette, gear and — mostly — movement.

   GEAR: jet rig and skateboard only. v4/v5 gave Blip a sword and Zip a
   shield; two of four carrying weapons read as identity rather than
   equipment, and the notes are explicit that gear is a removable layer.

   RIG HOOKS: every part the stage animates carries a class and a pivot
   (data-px / data-py, in this SVG's own coordinates). The stage rotates
   groups about those pivots every frame, which is what separates a
   character who is running from a sprite being slid across the screen.
   ============================================================ */
var __uid = 0;

/* The shared body. `halfW` sets how wide, `top`/`bot` how tall, so Trip can
   be stretched and Flip made oval without either leaving the family. */
function blobTorso(top, bot, halfW){
  var h = bot - top, L = 100 - halfW, R = 100 + halfW;
  return 'M100 ' + top +
    ' C' + (100 + halfW * 0.80) + ' ' + top + ' ' + R + ' ' + (top + h * 0.28) + ' ' + R + ' ' + (top + h * 0.58) +
    ' C' + R + ' ' + (bot - h * 0.08) + ' ' + (100 + halfW * 0.60) + ' ' + bot + ' 100 ' + bot +
    ' C' + (100 - halfW * 0.60) + ' ' + bot + ' ' + L + ' ' + (bot - h * 0.08) + ' ' + L + ' ' + (top + h * 0.58) +
    ' C' + L + ' ' + (top + h * 0.28) + ' ' + (100 - halfW * 0.80) + ' ' + top + ' 100 ' + top + ' Z';
}

/*
  THE SHARED FACE — identical on all four, so they read as one cast.

  Big white eyes with dark pupils, brows and a mouth, sitting right on the
  body. The earlier dark visor looked cool full-size but at phone size it
  read as sunglasses: the eyes shrank to two glowing dots and every
  reaction the stage plays (happy, surprised, oops, looking at the letter
  he just tapped) was close to invisible. A face a five-year-old can read
  from arm's length is the whole point of having characters react.

  Everything expressive is a class the stage toggles, never a redraw:
    .eyes          pupils only — translated so he visibly LOOKS at things
    .eye           whites, pupils, glints — they blink (CSS)
    .eye-happy     ^ ^ arcs for a cheer
    .brow          raised for wow, worried for oops
    .m-smile / .m-open / .m-oops   one mouth visible at a time
    .sweat         the oops drop
*/
var FACE_INK = '#14213D';
function faceOf(vt, stroke){
  var cy = vt + 14, lx = 81, rx = 119, my = vt + 37;
  function white(x){
    return '<ellipse class="eye white" cx="' + x + '" cy="' + cy + '" rx="13.5" ry="15.5" fill="#fff" stroke="' + stroke + '" stroke-width="3.5"/>';
  }
  function pupil(x){
    return '<circle class="eye pupil" cx="' + x + '" cy="' + (cy + 1) + '" r="7.5" fill="' + FACE_INK + '"/>' +
      '<circle class="eye glint" cx="' + (x - 2.6) + '" cy="' + (cy - 2.4) + '" r="2.6" fill="#fff"/>';
  }
  function happy(x){
    return '<path class="eye-happy" d="M' + (x - 11) + ' ' + (cy + 5) + ' Q' + x + ' ' + (cy - 11) + ' ' + (x + 11) + ' ' + (cy + 5) +
      '" fill="none" stroke="' + FACE_INK + '" stroke-width="5.5" stroke-linecap="round"/>';
  }
  function brow(x, cls){
    return '<path class="brow ' + cls + '" d="M' + (x - 10) + ' ' + (vt - 7) + ' Q' + x + ' ' + (vt - 12) + ' ' + (x + 10) + ' ' + (vt - 7) +
      '" fill="none" stroke="' + stroke + '" stroke-width="4.5" stroke-linecap="round"/>';
  }
  return '<g class="head" data-px="100" data-py="' + (vt + 20) + '">' +
    brow(lx, 'brow-l') + brow(rx, 'brow-r') +
    white(lx) + white(rx) +
    '<g class="eyes">' + pupil(lx) + pupil(rx) + '</g>' +
    happy(lx) + happy(rx) +
    '<path class="m-smile" d="M88 ' + my + ' Q100 ' + (my + 10) + ' 112 ' + my + '" fill="none" stroke="' + FACE_INK + '" stroke-width="4" stroke-linecap="round"/>' +
    '<g class="m-open"><path d="M87 ' + (my - 2) + ' Q100 ' + (my - 3) + ' 113 ' + (my - 2) + ' Q112 ' + (my + 14) + ' 100 ' + (my + 14) + ' Q88 ' + (my + 14) + ' 87 ' + (my - 2) + ' Z" fill="' + FACE_INK + '"/>' +
      '<ellipse cx="100" cy="' + (my + 9) + '" rx="6" ry="3.5" fill="#FF7A45"/></g>' +
    '<path class="m-oops" d="M88 ' + (my + 3) + ' q4 -5 8 0 t8 0 t8 0" fill="none" stroke="' + FACE_INK + '" stroke-width="3.5" stroke-linecap="round"/>' +
    '<path class="sweat" d="M' + 140 + ' ' + (vt - 16) + ' q-7 10 0 14 q7 -4 0 -14 z" fill="#A9DCFF" stroke="#2F7FD0" stroke-width="2.5" stroke-linejoin="round"/>' +
  '</g>';
}

/* A soft highlight on the upper-left of the body: the toy-like plastic sheen. */
function shine(top, halfW){
  var cx = 100 - halfW * 0.48, cy = top + 22;
  return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + (halfW * 0.26) + '" ry="11" fill="#fff" opacity=".28" transform="rotate(-24 ' + cx + ' ' + cy + ')"/>';
}

function antenna(bent, ballFill, stroke){
  var d = bent ? 'M100 40 Q110 20 92 13' : 'M100 34 Q100 20 100 16';
  var cx = bent ? 90 : 100, cy = bent ? 11 : 12;
  return '<g class="antenna" data-px="100" data-py="40">' +
    '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="5" stroke-linecap="round"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="' + ballFill + '" stroke="' + stroke + '" stroke-width="4"/>' +
  '</g>';
}

/* ---------- BLIP — orange, antenna, jet rig. Never tumbles. ---------- */
function blipArt(){
  var u = 'bl' + (++__uid);
  return '<svg viewBox="-16 0 232 214" aria-hidden="true">' +
    '<defs><linearGradient id="' + u + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#F9A055"/><stop offset="1" stop-color="#C24A0E"/>' +
    '</linearGradient></defs>' +

    '<g class="jetrig">' +
      '<rect x="26" y="88" width="26" height="52" rx="12" fill="#8F3A0B" stroke="#5E2206" stroke-width="4"/>' +
      '<rect x="148" y="88" width="26" height="52" rx="12" fill="#8F3A0B" stroke="#5E2206" stroke-width="4"/>' +
      '<g class="jet" data-px="39" data-py="140">' +
        '<path d="M39 140 q12 22 0 42 q-12 -20 0 -42 z" fill="#FF8A3D"/>' +
        '<path d="M39 144 q6 15 0 28 q-6 -13 0 -28 z" fill="#FFD24A"/>' +
      '</g>' +
      '<g class="jet2" data-px="161" data-py="140">' +
        '<path d="M161 140 q12 22 0 42 q-12 -20 0 -42 z" fill="#FF8A3D"/>' +
        '<path d="M161 144 q6 15 0 28 q-6 -13 0 -28 z" fill="#FFD24A"/>' +
      '</g>' +
    '</g>' +

    antenna(false, '#FFD24A', '#5E2206') +
    '<g class="arm-l" data-px="74" data-py="104">' +
      '<path d="M74 100 L30 92 L26 110 L72 120 Z" fill="#C24A0E" stroke="#5E2206" stroke-width="4" stroke-linejoin="round"/>' +
      '<circle cx="28" cy="101" r="12" fill="#8F3A0B" stroke="#5E2206" stroke-width="3.5"/>' +
    '</g>' +
    '<g class="arm-r" data-px="126" data-py="104">' +
      '<path d="M126 100 L170 92 L174 110 L128 120 Z" fill="#C24A0E" stroke="#5E2206" stroke-width="4" stroke-linejoin="round"/>' +
      '<circle cx="172" cy="101" r="12" fill="#8F3A0B" stroke="#5E2206" stroke-width="3.5"/>' +
    '</g>' +
    '<g class="leg-l" data-px="82" data-py="152">' +
      '<path d="M74 152 L94 152 L92 180 L70 180 Z" fill="#8F3A0B" stroke="#5E2206" stroke-width="4" stroke-linejoin="round"/>' +
    '</g>' +
    '<g class="leg-r" data-px="118" data-py="152">' +
      '<path d="M126 152 L106 152 L108 180 L130 180 Z" fill="#8F3A0B" stroke="#5E2206" stroke-width="4" stroke-linejoin="round"/>' +
    '</g>' +
    '<path d="' + blobTorso(36, 160, 52) + '" fill="url(#' + u + ')" stroke="#5E2206" stroke-width="5" stroke-linejoin="round"/>' + shine(36, 52) +
    faceOf(80, '#5E2206') +
  '</svg>';
}

/* ---------- ZIP — blue, ear nubs + lightning, skateboard. ---------- */
function zipArt(){
  var u = 'zp' + (++__uid);
  return '<svg viewBox="-16 0 232 214" aria-hidden="true">' +
    '<defs><linearGradient id="' + u + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#5D96FF"/><stop offset="1" stop-color="#15318F"/>' +
    '</linearGradient></defs>' +

    '<path d="M62 48 Q52 24 74 34 Z" fill="#1E4FCC" stroke="#0A1F5E" stroke-width="4" stroke-linejoin="round"/>' +
    '<path d="M138 48 Q148 24 126 34 Z" fill="#1E4FCC" stroke="#0A1F5E" stroke-width="4" stroke-linejoin="round"/>' +

    /* gear: the board, before the legs so his feet land on it */
    '<g class="board" data-px="100" data-py="184">' +
      '<rect x="50" y="182" width="14" height="9" rx="3" fill="#B7C3D6" stroke="#5A6779" stroke-width="2.5"/>' +
      '<rect x="136" y="182" width="14" height="9" rx="3" fill="#B7C3D6" stroke="#5A6779" stroke-width="2.5"/>' +
      '<path d="M18 168 Q26 182 44 184 L156 184 Q174 182 182 168 L182 176 Q174 192 156 194 L44 194 Q26 192 18 176 Z" ' +
        'fill="#1E4FCC" stroke="#0A1F5E" stroke-width="4.5" stroke-linejoin="round"/>' +
      '<path d="M30 174 Q44 184 100 185 Q156 184 170 174 Q156 189 100 190 Q44 189 30 174 Z" fill="#0B1424" opacity=".55"/>' +
      '<circle class="wheel" cx="57" cy="199" r="8" fill="#FFD24A" stroke="#8A6A10" stroke-width="3"/>' +
      '<circle class="wheel" cx="143" cy="199" r="8" fill="#FFD24A" stroke="#8A6A10" stroke-width="3"/>' +
    '</g>' +

    '<g class="arm-l" data-px="74" data-py="106">' +
      '<path d="M74 102 L30 94 L26 112 L72 122 Z" fill="#1E4FCC" stroke="#0A1F5E" stroke-width="4" stroke-linejoin="round"/>' +
      '<circle cx="28" cy="103" r="12" fill="#122E7A" stroke="#0A1F5E" stroke-width="3.5"/>' +
    '</g>' +
    '<g class="arm-r" data-px="126" data-py="106">' +
      '<path d="M126 102 L170 94 L174 112 L128 122 Z" fill="#1E4FCC" stroke="#0A1F5E" stroke-width="4" stroke-linejoin="round"/>' +
      '<circle cx="172" cy="103" r="12" fill="#122E7A" stroke="#0A1F5E" stroke-width="3.5"/>' +
    '</g>' +
    '<g class="leg-l" data-px="80" data-py="146">' +
      '<path d="M72 146 L92 146 L90 184 L66 184 Z" fill="#122E7A" stroke="#0A1F5E" stroke-width="4" stroke-linejoin="round"/>' +
    '</g>' +
    '<g class="leg-r" data-px="120" data-py="146">' +
      '<path d="M128 146 L108 146 L110 184 L134 184 Z" fill="#122E7A" stroke="#0A1F5E" stroke-width="4" stroke-linejoin="round"/>' +
    '</g>' +
    /* rounder and bouncier than Blip: same family, wider and shorter */
    '<path d="' + blobTorso(38, 158, 56) + '" fill="url(#' + u + ')" stroke="#0A1F5E" stroke-width="5" stroke-linejoin="round"/>' + shine(38, 56) +
    faceOf(82, '#0A1F5E') +
    '<path d="M104 128 l-10 16 h8 l-7 14 16 -18 h-8 z" fill="#FFD24A" stroke="#C99A12" stroke-width="2" stroke-linejoin="round"/>' +
  '</svg>';
}

/* ---------- TRIP — green, taller, oversized boots. On foot, no gear. ----------
   The notes are explicit that his face must NOT be permanently clumsy: the
   comedy is the animation's job. So he gets the same neutral friendly face
   as everyone else and his silhouette does the telegraphing — a stretched
   body on big boots, which looks top-heavy and tippable standing still. */
function tripArt(){
  var u = 'tr' + (++__uid);
  return '<svg viewBox="-16 0 232 214" aria-hidden="true">' +
    '<defs><linearGradient id="' + u + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#5BDD8C"/><stop offset="1" stop-color="#1E7A46"/>' +
    '</linearGradient></defs>' +

    antenna(true, '#FFD24A', '#14532D') +

    '<g class="arm-l" data-px="74" data-py="108">' +
      '<path d="M74 104 L30 96 L26 114 L72 124 Z" fill="#1E7A46" stroke="#14532D" stroke-width="4" stroke-linejoin="round"/>' +
      '<circle cx="28" cy="105" r="12" fill="#14532D" stroke="#0B3A1F" stroke-width="3.5"/>' +
    '</g>' +
    '<g class="arm-r" data-px="126" data-py="108">' +
      '<path d="M126 104 L170 96 L174 114 L128 124 Z" fill="#1E7A46" stroke="#14532D" stroke-width="4" stroke-linejoin="round"/>' +
      '<circle cx="172" cy="105" r="12" fill="#14532D" stroke="#0B3A1F" stroke-width="3.5"/>' +
    '</g>' +

    /* oversized boots — the whole point of his silhouette */
    '<g class="leg-l" data-px="80" data-py="156">' +
      '<path d="M66 156 L92 156 L94 178 Q94 188 82 188 L42 188 Q32 188 36 177 L58 162 Z" fill="#14532D" stroke="#0B3A1F" stroke-width="4" stroke-linejoin="round"/>' +
    '</g>' +
    '<g class="leg-r" data-px="120" data-py="156">' +
      '<path d="M108 156 L134 156 L156 177 Q160 188 150 188 L110 188 Q98 188 98 178 Z" fill="#14532D" stroke="#0B3A1F" stroke-width="4" stroke-linejoin="round"/>' +
    '</g>' +

    /* taller and narrower than the others — stretched, not caricatured */
    '<path d="' + blobTorso(30, 162, 46) + '" fill="url(#' + u + ')" stroke="#14532D" stroke-width="5" stroke-linejoin="round"/>' + shine(30, 46) +
    faceOf(76, '#14532D') +
  '</svg>';
}

/* ---------- FLIP — red, oval and long-limbed. Acrobatics, no gear. ----------
   Colour note: the visual-direction file proposes purple, which collides
   with the standing "no purple/pink" instruction; v5 chose teal, which sits
   too close to Zip's blue once both are 74px on a phone. Red is the
   remaining primary that clears blue, green and the no-purple rule, and the
   suite holds all four hues at least 25 degrees apart. */
function flipArt(){
  var u = 'fl' + (++__uid);
  return '<svg viewBox="-16 0 232 214" aria-hidden="true">' +
    '<defs><linearGradient id="' + u + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#FF7A6B"/><stop offset="1" stop-color="#A3121F"/>' +
    '</linearGradient></defs>' +

    /* longer, more flexible limbs on a diagonal — his acrobatic tell, so a
       cartwheel looks like the obvious next frame even standing still */
    '<g class="arm-l" data-px="86" data-py="96">' +
      '<path d="M86 94 L34 46 L20 62 L76 112 Z" fill="#C42030" stroke="#630A12" stroke-width="4" stroke-linejoin="round"/>' +
      '<circle cx="26" cy="53" r="13" fill="#FFE8E4" stroke="#630A12" stroke-width="3.5"/>' +
    '</g>' +
    '<g class="arm-r" data-px="114" data-py="100">' +
      '<path d="M114 100 L172 140 L158 156 L104 116 Z" fill="#C42030" stroke="#630A12" stroke-width="4" stroke-linejoin="round"/>' +
      '<circle cx="165" cy="148" r="13" fill="#FFE8E4" stroke="#630A12" stroke-width="3.5"/>' +
    '</g>' +

    '<g class="leg-l" data-px="84" data-py="150">' +
      '<path d="M82 150 L100 150 L94 186 L68 192 L62 172 Z" fill="#C42030" stroke="#630A12" stroke-width="4" stroke-linejoin="round"/>' +
    '</g>' +
    '<g class="leg-r" data-px="116" data-py="150">' +
      '<path d="M104 150 L122 150 L142 178 L128 192 L108 172 Z" fill="#C42030" stroke="#630A12" stroke-width="4" stroke-linejoin="round"/>' +
    '</g>' +

    /* oval and athletic: the same blob, narrowed and lengthened */
    '<path d="' + blobTorso(34, 156, 44) + '" fill="url(#' + u + ')" stroke="#630A12" stroke-width="5" stroke-linejoin="round"/>' + shine(34, 44) +
    /* headband with a trailing tail — the streamer is what sells the spin.
       Worn high, clear of the brows, so it never hides the face */
    '<path d="M68 50 L132 50 L134 61 L66 61 Z" fill="#FFD24A" stroke="#630A12" stroke-width="3.5" stroke-linejoin="round"/>' +
    '<g class="tail" data-px="132" data-py="55">' +
      '<path d="M132 51 Q162 43 178 27 L170 55 Q150 65 133 61 Z" fill="#FFD24A" stroke="#630A12" stroke-width="3" stroke-linejoin="round"/>' +
    '</g>' +
    faceOf(80, '#630A12') +
  '</svg>';
}

var CHAR_ART = { blip: blipArt, zip: zipArt, trip: tripArt, flip: flipArt };

if (typeof module !== 'undefined' && module.exports){
  module.exports = { faceOf:faceOf, FACE_INK:FACE_INK, blipArt:blipArt, zipArt:zipArt, tripArt:tripArt, flipArt:flipArt, CHAR_ART:CHAR_ART };
}
