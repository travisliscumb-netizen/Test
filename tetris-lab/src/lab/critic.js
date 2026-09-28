/* The critic: turns simulation metrics into a design review.

   Thresholds are calibrated against Classic itself, measured by the same
   simulator (seed 3, 3 games x 200 pieces): player-bot piece ratio ~0.77,
   average stack ~50%, a clear every ~4 pieces, 1.6 near-best options per
   turn with a ~100 point spread between best and worst. Classic scores ~0.8
   here but is rejected as a Lab result for lack of novelty -- the Lab's job
   is to find designs that are as well-tuned as Classic *and* different.

   Output:
     score        0..1 overall
     components   per-axis scores for the UI's radar/bars
     weaknesses   [{ id, severity, text, data }] consumed by refine.js
     strengths    [text]
     hardFail     true when the design is technically unstable -> reject outright
     verdict      'accepted' | 'needs-work' | 'rejected'                        */

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const band = (v, lo, hi, soft) => (v < lo ? clamp01(1 - (lo - v) / soft) : v > hi ? clamp01(1 - (v - hi) / soft) : 1);

export const ACCEPT_SCORE = 0.75;
export const MIN_NOVELTY = 0.25;

export function novelty(concept) {
  let n = 0;
  if (concept.lattice === 'hex') n += 0.35;
  if (concept.clear?.rule === 'color-match') n += 0.3;
  else if (concept.clear?.rule === 'line-gap') n += 0.12;
  if (concept.gravityMode === 'cascade') n += 0.1;
  if (concept.wrap) n += 0.25;
  if (concept.specials?.bomb > 0) n += 0.15;
  if (concept.specials?.wild > 0) n += 0.05;
  if (concept.garbage?.every > 0) n += 0.08;
  const pieces = concept.pieces || [];
  const rots = new Set(pieces.map((p) => p.rotation));
  if (rots.has('morph')) n += 0.3;
  if (rots.has('flip') || rots.has('full')) n += 0.15;
  if (pieces.some((p) => p.connect === 'corner' || p.connect === 'loose')) n += 0.2;
  const nonClassic = pieces.filter((p) => !(p.tags || []).includes('classic')).length;
  n += 0.4 * (pieces.length ? nonClassic / pieces.length : 0);
  if (concept.placement?.mode === 'timed') n += 0.3;
  if (pieces.some((p) => p.fall && p.fall !== 1)) n += 0.15;
  const sizes = new Set(pieces.map((p) => p.cells.length));
  if (sizes.size >= 3) n += 0.05;
  return clamp01(n);
}

export function critique(concept, m, validation = { warnings: [] }) {
  const weaknesses = [];
  const strengths = [];
  const P = m.player, E = m.expert;
  const names = (concept.pieces || []).map((p) => p.name || p.id);

  // --- stability (hard failures) ---------------------------------------
  const hardReasons = [];
  if (m.errors.length) hardReasons.push(`crashed during simulation: ${m.errors[0]}`);
  if (m.invariantFailures) hardReasons.push(`${m.invariantFailures} state-corruption checks failed`);
  if (m.msPerPiece > 25) hardReasons.push(`too slow to simulate (${m.msPerPiece.toFixed(1)} ms per piece)`);
  if (E.games === 0) hardReasons.push('no simulated game could be started');

  // --- fairness: can perfect play survive? ------------------------------
  const fairness = clamp01(E.survival * 1.2 - 0.1) * band(E.pieceRatio, 0.9, 1, 0.6);
  if (E.survival < 0.67) {
    weaknesses.push({
      id: 'too-hard', severity: E.survival < 0.34 ? 3 : 2,
      text: `Even the expert bot topped out in ${Math.round((1 - E.survival) * 100)}% of games (average ${Math.round(E.avgPieces)} pieces). The design is unfair, not just hard.`
    });
  }

  // --- challenge: is it tuned for humans? -------------------------------
  let challenge = band(P.pieceRatio, 0.55, 0.97, 0.35) * 0.6 + band(P.avgHeight, 0.28, 0.62, 0.25) * 0.4;
  if (P.pieceRatio < 0.5 && E.survival >= 0.67) {
    weaknesses.push({
      id: 'too-hard', severity: P.pieceRatio < 0.3 ? 2 : 1,
      text: `Simulated players lasted only ${Math.round(P.avgPieces)} of ${m.cap} pieces; the stack averaged ${Math.round(P.avgHeight * 100)}% of the well.`
    });
  }
  if (P.pieceRatio >= 0.99 && P.avgHeight < 0.26) {
    challenge *= 0.6;
    weaknesses.push({
      id: 'too-easy', severity: P.avgHeight < 0.18 ? 2 : 1,
      text: `Simulated players never came close to topping out; the stack averaged only ${Math.round(P.avgHeight * 100)}% of the well. There is no tension.`
    });
  }

  // --- flow: do clears come at a satisfying rhythm? ---------------------
  const flow = band(P.piecesPerClear, 1.6, 5, 4) * 0.6 + band(P.clearRatio, 0.65, 1.4, 0.4) * 0.4;
  if (P.piecesPerClear > 6.5 || P.clearRatio < 0.5) {
    weaknesses.push({
      id: 'tedious', severity: P.piecesPerClear > 10 ? 2 : 1,
      text: `Clears are rare: one every ${P.piecesPerClear.toFixed(1)} pieces, and only ${Math.round(P.clearRatio * 100)}% of placed cells were ever cleared.`
    });
  }
  if (P.piecesPerClear < 1.3 && P.pieceRatio >= 0.99) {
    weaknesses.push({ id: 'too-easy', severity: 1, text: `Something clears almost every piece (${P.piecesPerClear.toFixed(1)} pieces per clear); clears stop feeling earned.` });
  }

  // --- decisions --------------------------------------------------------
  const hasRotation = (concept.pieces || []).some((p) => p.rotation !== 'none');
  let decisions = band(m.goodOptions, 1.3, 4.5, 2.5) * 0.5 + band(m.spread, 55, 160, 45) * 0.3 +
    (hasRotation ? band(m.rotationUse, 0.3, 0.85, 0.3) : 0.5) * 0.2;
  if (m.spread < 40) {
    weaknesses.push({ id: 'flat-decisions', severity: 2, text: `Placement choices barely matter: the best and worst options differ by only ${m.spread.toFixed(0)} points.` });
  } else if (m.goodOptions > 5) {
    weaknesses.push({ id: 'flat-decisions', severity: 1, text: `On average ${m.goodOptions.toFixed(1)} placements are equally good, so most turns have no real decision.` });
  }
  if (hasRotation && m.rotationUse < 0.15 && m.rotationSamples > 20) {
    weaknesses.push({ id: 'flat-decisions', severity: 1, text: `Rotation is almost never useful (${Math.round(m.rotationUse * 100)}% of placements).` });
  }

  // --- problem pieces ---------------------------------------------------
  const holesPer = m.pieceHoles || [];
  let worst = -1, worstH = 0;
  holesPer.forEach((h, i) => { if (h > worstH) { worstH = h; worst = i; } });
  if (worst >= 0 && worstH > 0.45) {
    weaknesses.push({
      id: 'problem-piece', severity: worstH > 0.8 ? 2 : 1, data: { index: worst },
      text: `${names[worst]} creates a new hole on ${Math.round(Math.min(1, worstH) * 100)}% of its placements, even when placed by the expert bot.`
    });
  }

  // --- mechanic engagement ---------------------------------------------
  let engagement = 1;
  const inert = [];
  if (concept.specials?.bomb > 0 && m.bombsPerPiece < 0.02) inert.push('bomb cells almost never detonate');
  if (concept.gravityMode === 'cascade' && concept.clear?.rule !== 'color-match' && m.chainRate < 0.004) inert.push('cascade gravity never produces a chain');
  if (concept.clear?.rule === 'color-match' && m.chainRate < 0.02) inert.push('colour chains are too rare');
  if (concept.wrap && m.seamRate < 0.04) inert.push('pieces rarely use the wrap-around seam');
  if (inert.length) {
    engagement = clamp01(1 - 0.35 * inert.length);
    weaknesses.push({ id: 'inert-mechanic', severity: 1, data: { which: inert }, text: `Mechanic not pulling its weight: ${inert.join('; ')}.` });
  }

  // --- readability --------------------------------------------------------
  const pieces = concept.pieces || [];
  const maxSize = Math.max(0, ...pieces.map((p) => p.cells.length));
  let readability = 1;
  if (pieces.length > 9) readability -= 0.25;
  if (maxSize > 6) readability -= 0.2;
  if ((validation.warnings || []).some((w) => /hole/.test(w))) readability -= 0.2;
  if ((validation.warnings || []).some((w) => /shares its colour/.test(w))) readability -= 0.15;
  readability = clamp01(readability);
  if (readability < 0.7) weaknesses.push({ id: 'unreadable', severity: 1, text: 'Too many or too large pieces to read quickly at speed.' });

  const nov = novelty(concept);

  const components = { challenge, fairness, flow, decisions, engagement, novelty: nov, readability };
  let score = 0.22 * challenge + 0.14 * fairness + 0.16 * flow + 0.18 * decisions + 0.1 * engagement + 0.12 * nov + 0.08 * readability;
  // Every weakness costs points, so a fix that removes one shows up as progress.
  const PENALTY = [0, 0.05, 0.12, 0.25];
  for (const w of weaknesses) score -= PENALTY[w.severity] || 0.05;
  // A design perfect play cannot survive is capped well below acceptance.
  if (E.survival < 0.67) score = Math.min(score, 0.55);
  score = clamp01(score);
  if (hardReasons.length) score = 0;

  // --- strengths (for the journal) ------------------------------------
  if (fairness > 0.9 && challenge > 0.8) strengths.push('difficulty sits in the same band as Classic');
  if (m.chainRate > 0.05) strengths.push(`chains happen on ${Math.round(m.chainRate * 100)}% of placements`);
  if (m.bombsPerPiece > 0.05) strengths.push('bombs regularly rescue buried holes');
  if (m.seamRate > 0.1) strengths.push(`${Math.round(m.seamRate * 100)}% of placements straddle the wrap seam`);
  if (decisions > 0.85) strengths.push('placements present real choices with real consequences');
  if (flow > 0.9) strengths.push('clears arrive at a satisfying rhythm');
  if (nov > 0.6) strengths.push('plays very differently from Classic');

  const major = weaknesses.some((w) => w.severity >= 2);
  let verdict = 'needs-work';
  if (hardReasons.length) verdict = 'rejected';
  else if (score >= ACCEPT_SCORE && !major && weaknesses.length <= 1 && nov >= MIN_NOVELTY) verdict = 'accepted';
  if (nov < MIN_NOVELTY && !hardReasons.length) {
    weaknesses.push({ id: 'derivative', severity: 1, text: 'Too close to Classic to count as a new design.' });
  }

  return { score, components, weaknesses, strengths, hardFail: hardReasons.length > 0, hardReasons, verdict };
}

/** Compact, human-readable metrics summary stored with a concept. */
export function summarizeMetrics(m) {
  return {
    playerPieces: Math.round(m.player.avgPieces),
    cap: m.cap,
    playerSurvival: +m.player.survival.toFixed(2),
    expertSurvival: +m.expert.survival.toFixed(2),
    avgHeight: +m.player.avgHeight.toFixed(2),
    piecesPerClear: +m.player.piecesPerClear.toFixed(1),
    clearRatio: +m.player.clearRatio.toFixed(2),
    goodOptions: +m.goodOptions.toFixed(1),
    spread: Math.round(m.spread),
    rotationUse: +m.rotationUse.toFixed(2),
    chainRate: +m.chainRate.toFixed(3),
    bombsPerPiece: +m.bombsPerPiece.toFixed(3),
    seamRate: +m.seamRate.toFixed(2),
    msPerPiece: +m.msPerPiece.toFixed(2),
    avgScore: Math.round(m.player.avgScore)
  };
}
