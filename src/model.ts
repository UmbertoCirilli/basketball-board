import { basketPositions, COURT_SIZE, MARGIN } from './court';
import { lineEnds } from './geometry';
import type { Branch, CourtType, Line, Phase, Play, Pt, Token, TokenKind } from './types';

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export const courtLabel = (p: Play) => (p.court === 'half' ? 'Metà campo' : 'Campo intero');

// ------------------------------------------------------------ alternatives

/** Index in the main line where a branch starts (-1 if its phase is gone). */
export const branchStart = (play: Play, b: Branch) => play.phases.findIndex((p) => p.id === b.fromPhase);

/** Branches ordered by their starting phase (this order defines the letters A, B, C…). */
export function sortedBranches(play: Play): Branch[] {
  const list = (play.branches ?? []).filter((b) => branchStart(play, b) >= 0);
  return list
    .map((b, i) => ({ b, i, s: branchStart(play, b) }))
    .sort((x, y) => x.s - y.s || x.i - y.i)
    .map((x) => x.b);
}

export function branchLetter(play: Play, branchId: string): string {
  const i = sortedBranches(play).findIndex((b) => b.id === branchId);
  let n = Math.max(0, i);
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export const branchesFrom = (play: Play, phaseId: string) => sortedBranches(play).filter((b) => b.fromPhase === phaseId);

/** "3" for the main line, "3A" for the first phase of alternative A starting at phase 2. */
export function phaseLabel(play: Play, branch: Branch | null, index: number): string {
  if (!branch) return String(index + 1);
  return `${branchStart(play, branch) + 2 + index}${branchLetter(play, branch.id)}`;
}

export function branchTitle(play: Play, b: Branch): string {
  return `Alternativa ${branchLetter(play, b.id)}${b.name.trim() ? ' · ' + b.name.trim() : ''}`;
}

/** Every phase of the play, main line and alternatives. */
export const allPhases = (play: Play): Phase[] => [...play.phases, ...(play.branches ?? []).flatMap((b) => b.phases)];

export function emptyPhase(): Phase {
  return { id: uid(), note: '', tokens: [], lines: [] };
}

export function newPlay(court: CourtType = 'half', category = 'Attacco'): Play {
  const now = Date.now();
  return {
    id: uid(),
    title: 'Nuovo schema',
    category,
    court,
    objective: '',
    description: '',
    phases: [emptyPhase()],
    createdAt: now,
    updatedAt: now,
  };
}

/** Lowest free number for a player kind ("1", "2", ...). */
export function nextLabel(phase: Phase, kind: TokenKind): string {
  const used = new Set(phase.tokens.filter((t) => t.kind === kind).map((t) => t.label));
  for (let i = 1; ; i++) if (!used.has(String(i))) return String(i);
}

export function makeToken(kind: TokenKind, p: Pt, phase: Phase): Token {
  const label =
    kind === 'offense' || kind === 'defense' ? nextLabel(phase, kind) : kind === 'coach' ? 'C' : kind === 'text' ? 'Testo' : '';
  return { id: uid(), kind, x: p.x, y: p.y, label };
}

// Standard half-court spots (basket at the top): 1 top, 2/3 wings, 4 elbow, 5 low post.
const HALF_SPOTS: Pt[] = [
  { x: 75, y: 92 },
  { x: 126, y: 62 },
  { x: 24, y: 62 },
  { x: 99, y: 56 },
  { x: 52, y: 24 },
];

const halfToFull = (p: Pt): Pt => ({ x: 280 - p.y, y: p.x });
const fullToHalf = (p: Pt): Pt => ({ x: p.y, y: 280 - p.x });

/** Adds a full offensive or defensive five (replacing existing players of that kind). */
export function addFive(phase: Phase, court: CourtType, kind: 'offense' | 'defense'): void {
  const toCourt = (p: Pt) => (court === 'half' ? p : halfToFull(p));
  phase.tokens = phase.tokens.filter((t) => t.kind !== kind);
  const basket = basketPositions(court)[court === 'half' ? 0 : 1];
  const offense = new Map(phase.tokens.filter((t) => t.kind === 'offense').map((t) => [t.label, t]));
  HALF_SPOTS.forEach((spot, i) => {
    const label = String(i + 1);
    let p = toCourt(spot);
    if (kind === 'defense') {
      // stand between the matching attacker (if any) and the basket
      const att = offense.get(label) ?? p;
      const dx = basket.x - att.x;
      const dy = basket.y - att.y;
      const d = Math.hypot(dx, dy) || 1;
      p = { x: att.x + (dx / d) * 9, y: att.y + (dy / d) * 9 };
    }
    phase.tokens.push({ id: uid(), kind, x: p.x, y: p.y, label, hasBall: kind === 'offense' && i === 0 });
  });
}

const MOVES = new Set<Line['kind']>(['cut', 'dribble', 'screen']);

/**
 * Builds the next phase: players move to the end of their movement lines and the
 * ball follows passes and handoffs. Lines are cleared.
 */
export function nextPhaseFrom(phase: Phase): Phase {
  const tokens = clone(phase.tokens);
  const byId = new Map(tokens.map((t) => [t.id, t]));
  const original = new Map(phase.tokens.map((t) => [t.id, t]));
  for (const line of phase.lines) {
    if (!line.from || !MOVES.has(line.kind)) continue;
    const t = byId.get(line.from);
    if (!t) continue;
    const [, end] = lineEnds(line, original);
    t.x = end.x;
    t.y = end.y;
  }
  for (const line of phase.lines) {
    if ((line.kind !== 'pass' && line.kind !== 'handoff') || !line.from || !line.to) continue;
    const a = byId.get(line.from);
    const b = byId.get(line.to);
    if (!a || !b || !a.hasBall) continue;
    a.hasBall = false;
    if (b.kind === 'offense') b.hasBall = true;
  }
  return { id: uid(), note: '', tokens, lines: [] };
}

/** Converts a play between half and full court, keeping positions on the same basket. */
export function convertCourt(play: Play, to: CourtType): void {
  if (play.court === to) return;
  const f = to === 'full' ? halfToFull : fullToHalf;
  const { w, h } = COURT_SIZE[to];
  const clamp = (p: Pt): Pt => ({
    x: Math.max(-MARGIN + 2, Math.min(w + MARGIN - 2, p.x)),
    y: Math.max(-MARGIN + 2, Math.min(h + MARGIN - 2, p.y)),
  });
  const map = (p: Pt) => clamp(f(p));
  for (const ph of allPhases(play)) {
    for (const t of ph.tokens) Object.assign(t, map(t));
    for (const l of ph.lines) {
      l.points = l.points.map(map);
      if (l.ctrl) l.ctrl = f(l.ctrl);
    }
  }
  play.court = to;
}
