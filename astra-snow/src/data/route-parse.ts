// Parser for the dispatcher's route list.
//
// Contract: the raw row text is the canonical record and is never modified.
// Parsing only ADDS structure (house number, the City's street key, the note
// text that followed the address, and advisory flags read from that note).
// Anything the parser cannot read with certainty is reported, not guessed.
//
// Streets are matched against the City of Barrie's own street list (from its
// address-point layer), not a hand-written table: any route, any street.

export interface CityStreet {
  /** SSTRNAME, e.g. "OAKLEY PARK" */
  name: string;
  /** SSTRSUFF, e.g. "SQ" */
  suffix: string;
  /** SSTRDIR or null, e.g. "E" */
  dir: string | null;
}

const SUFFIX_WORDS: Record<string, string> = {
  STREET: 'ST', ST: 'ST', CRESCENT: 'CRES', CRES: 'CRES', ROAD: 'RD', RD: 'RD', AVENUE: 'AVE', AVE: 'AVE', AV: 'AVE',
  COURT: 'CRT', CT: 'CRT', CRT: 'CRT', SQUARE: 'SQ', SQ: 'SQ', DRIVE: 'DR', DR: 'DR', LANE: 'LANE', LN: 'LANE',
  PLACE: 'PL', PL: 'PL', BOULEVARD: 'BLVD', BLVD: 'BLVD', TRAIL: 'TRAIL', TRL: 'TRAIL', WAY: 'WAY', GATE: 'GATE',
  CIRCLE: 'CIR', CIR: 'CIR', TERRACE: 'TERR', TERR: 'TERR', PARKWAY: 'PKWY', PKWY: 'PKWY', HEIGHTS: 'HTS', HTS: 'HTS',
};
const DIR_WORDS: Record<string, string> = { E: 'E', EAST: 'E', W: 'W', WEST: 'W', N: 'N', NORTH: 'N', S: 'S', SOUTH: 'S' };
const SUFFIX_DISPLAY: Record<string, string> = { ST: 'St', CRES: 'Cres', RD: 'Rd', AVE: 'Ave', CRT: 'Crt', SQ: 'Sq', DR: 'Dr', LANE: 'Lane', PL: 'Pl', BLVD: 'Blvd', TRAIL: 'Trail', WAY: 'Way', GATE: 'Gate', CIR: 'Cir', TERR: 'Terr', PKWY: 'Pkwy', HTS: 'Hts' };

export interface ParsedRow {
  /** 1-based position in the dispatcher's list. */
  seq: number;
  /** Verbatim row text. Canonical. */
  raw: string;
  number: string;
  /** City street key, e.g. "GROVE ST E". */
  streetKey: string;
  streetName: string;
  streetSuffix: string;
  streetDir: string | null;
  /** Display address, e.g. "9001 Grove St E". */
  address: string;
  /** Verbatim note text that followed the address (empty if none). */
  note: string;
  flags: NoteFlags;
  /** Parser warnings; an empty list means the row read cleanly. */
  warnings: string[];
}

export interface NoteFlags {
  /** Driveway count stated in the note ("x2 Driveways"). */
  driveways: number;
  /** City street keys the note says a driveway is on. */
  drivewayStreets: string[];
  /** Hazard words, normalised. Advisory only — the note text is authoritative. */
  hazards: string[];
  /** The note constrains where snow may be thrown. */
  throwRule: boolean;
  /** The note makes service conditional (e.g. gravel: only once frozen). */
  conditional: boolean;
}

const HAZARD_WORDS: [RegExp, string][] = [
  [/\bAC\b/, 'AC unit'],
  [/window well/i, 'window well'],
  [/retaining wall|ret\. ?wall/i, 'retaining wall'],
  [/\bmetal\b|\bhook\b/i, 'protruding metal'],
  [/\blight\b/i, 'light'],
  [/\bstep\b/i, 'step'],
  [/\brocks?\b/i, 'rocks'],
  [/\bgravel\b/i, 'gravel surface'],
  [/\bpad\b/i, 'fragile pad'],
];

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

export function streetKey(s: CityStreet): string {
  return [s.name, s.suffix, s.dir].filter(Boolean).join(' ');
}

export function displayStreet(s: CityStreet): string {
  return [titleCase(s.name), SUFFIX_DISPLAY[s.suffix] ?? titleCase(s.suffix), s.dir].filter(Boolean).join(' ');
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Regex source matching a City street name with optional spaces between letters ("NORTHPARK" ~ "North Park"). */
function nameRegexSource(name: string): string {
  return name
    .split(' ')
    .map((w) => w.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s?'))
    .join('\\.?\\s+');
}

export interface StreetIndex {
  streets: CityStreet[];
  byName: Map<string, CityStreet[]>;
  /** names sorted longest first, with compiled patterns */
  patterns: { name: string; re: RegExp }[];
}

export function indexStreets(streets: CityStreet[]): StreetIndex {
  const byName = new Map<string, CityStreet[]>();
  for (const s of streets) {
    const l = byName.get(s.name);
    if (l) {
      if (!l.some((x) => x.suffix === s.suffix && x.dir === s.dir)) l.push(s);
    } else byName.set(s.name, [s]);
  }
  const names = [...byName.keys()].sort((a, b) => b.replace(/\s/g, '').length - a.replace(/\s/g, '').length);
  return { streets, byName, patterns: names.map((name) => ({ name, re: new RegExp(`^${nameRegexSource(name)}(?![A-Za-z])`, 'i') })) };
}

/** Resolve a street word written inside a note ("BENNETT", "Gunn") to City keys. */
export function resolveNoteStreet(word: string, idx: StreetIndex): string[] {
  const w = word.toUpperCase().replace(/[^A-Z ]/g, '').trim();
  if (w.length < 4) return [];
  const exact = idx.byName.get(w);
  const cands = exact ?? [...idx.byName.entries()].filter(([n]) => n.length >= 4 && levenshtein(n, w) <= 1).flatMap(([, v]) => v);
  return [...new Set(cands.map(streetKey))];
}

export function parseNote(note: string, idx?: StreetIndex): NoteFlags {
  const flags: NoteFlags = { driveways: 1, drivewayStreets: [], hazards: [], throwRule: false, conditional: false };
  const m = note.match(/\bx\s?(\d)\s*driveways?\b/i);
  if (m) flags.driveways = Number(m[1]);
  if (idx) {
    const words: string[] = [];
    for (const mm of note.matchAll(/\b(?:driveway|drvwy|drwy)\s+on\s+([A-Za-z][A-Za-z ]{2,20}?)(?=\s*(?:$|[-,.;@]|\s(?:st|rd|ave|cres)\b))/gi)) words.push(mm[1]);
    for (const mm of note.matchAll(/@\s*([A-Za-z]{3,20})\s+(?:drvwy|drwy|driveway)/gi)) words.push(mm[1]);
    for (const w of words) for (const k of resolveNoteStreet(w, idx)) if (!flags.drivewayStreets.includes(k)) flags.drivewayStreets.push(k);
  }
  for (const [re, label] of HAZARD_WORDS) if (re.test(note) && !flags.hazards.includes(label)) flags.hazards.push(label);
  flags.throwRule = /\bblow\b|don.t blow|no snow on/i.test(note);
  flags.conditional = /\bonly once\b|\bonce base\b/i.test(note);
  return flags;
}

/**
 * Parse one dispatcher row against the City street index. `seq` is 1-based.
 * Throws on rows with no house number, an unknown street, or a street whose
 * suffix is unwritten AND ambiguous in the City list — never a silent guess.
 */
export function parseRow(raw: string, seq: number, idx: StreetIndex): ParsedRow {
  const warnings: string[] = [];
  const text = raw.replace(/\s+/g, ' ').trim();
  const num = text.match(/^(\d+[A-Z]?)\s+(.*)$/i);
  if (!num) throw new Error(`Row ${seq}: no house number in ${JSON.stringify(raw)}`);
  const number = num[1].toUpperCase();
  let rest = num[2];
  const hit = idx.patterns.find((p) => p.re.test(rest));
  if (!hit) throw new Error(`Row ${seq}: no City street matches ${JSON.stringify(raw)}`);
  rest = rest.slice(rest.match(hit.re)![0].length);
  const options = idx.byName.get(hit.name)!;
  // Optional suffix and direction words.
  let suffix: string | null = null;
  let dir: string | null = null;
  const sm = rest.match(/^\.?\s*([A-Za-z]+)\.?(?![A-Za-z])/);
  if (sm && SUFFIX_WORDS[sm[1].toUpperCase()] && options.some((o) => o.suffix === SUFFIX_WORDS[sm[1].toUpperCase()])) {
    suffix = SUFFIX_WORDS[sm[1].toUpperCase()];
    rest = rest.slice(sm[0].length);
  }
  const dm = rest.match(/^\s+([A-Za-z]+)(?![A-Za-z])/);
  if (dm && DIR_WORDS[dm[1].toUpperCase()] && options.some((o) => o.dir === DIR_WORDS[dm[1].toUpperCase()])) {
    dir = DIR_WORDS[dm[1].toUpperCase()];
    rest = rest.slice(dm[0].length);
  }
  let pool = options.filter((o) => (suffix === null || o.suffix === suffix) && (dir === null || o.dir === dir));
  if (dir === null && pool.length > 1 && pool.some((o) => o.dir === null)) pool = pool.filter((o) => o.dir === null);
  if (pool.length !== 1) {
    throw new Error(`Row ${seq}: street "${titleCase(hit.name)}" is ambiguous (${pool.map(streetKey).join(' / ') || 'no match'}) in ${JSON.stringify(raw)}`);
  }
  const street = pool[0];
  if (suffix === null) warnings.push('street suffix not written; inferred from the City street list');
  // Strip the ", Barrie" locality and the separator before the note.
  const note = rest.replace(/^\s*,\s*Barrie\b/i, '').replace(/^\s*[-–—]?\s*/, '').trim();
  const flags = parseNote(note, idx);
  return {
    seq,
    raw,
    number,
    streetKey: streetKey(street),
    streetName: street.name,
    streetSuffix: street.suffix,
    streetDir: street.dir,
    address: `${number} ${displayStreet(street)}`,
    note,
    flags,
    warnings,
  };
}

export function parseRoute(rows: string[], idx: StreetIndex): ParsedRow[] {
  return rows.map((r, i) => parseRow(r, i + 1, idx));
}
