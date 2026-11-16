/* Captures of the new districts round the grid (CITY_SPREAD.md §10): node underworld/tools/district-shots.mjs <out dir> [name prefixes…] */
process.env.ISLE_LIB = '1';
const { view, b, errors } = await import('./isle-shots.mjs');
await view('d1-villa-valen', -600, -840, [-560, 34, -800, -612, 24, -930], { clear: 0.0004 });
await view('d2-villa-court', -600, -870, [-584, 8, -858, -610, 25, -910]);
await view('d3-vault-portal', -563, -985, [-556, 26, -970, -563, 23, -1000]);
await view('d4-vault-gallery', -563, -1000, [-582, 26.5, -996.5, -540, 22.5, -1004]);
await view('d5-vault-lounge', -564, -1016, [-564, 26.5, -1014, -564, 22, -1045]);
await view('d6-bayview', -480, -260, [-300, 120, -60, -560, 0, -300], { clear: 0.0004 });
await view('d7-marsh-hollow', -460, 1480, [-200, 140, 1760, -480, 0, 1440], { clear: 0.0004 });
await view('d8-blackgate-landing', -1120, 1430, [-950, 90, 1600, -1150, 0, 1380], { clear: 0.0004 });
await view('d9-overview', -300, 600, [-300, 2200, 1900, -300, 0, 300], { clear: 0.00008, settle: 50, near: 30 });
console.log('errors', errors.length, errors.slice(0, 3).join(' | '));
await Promise.race([b.close().catch(() => {}), new Promise(r => setTimeout(r, 5000))]);
process.exit(0);
