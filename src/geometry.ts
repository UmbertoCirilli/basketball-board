import type { Line, Pt, Token } from './types';

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export function quad(p0: Pt, c: Pt, p2: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p2.y,
  };
}

/** Control point such that the quadratic curve passes through `h` at t = 0.5. */
export function ctrlThrough(p0: Pt, h: Pt, p2: Pt): Pt {
  return { x: 2 * h.x - (p0.x + p2.x) / 2, y: 2 * h.y - (p0.y + p2.y) / 2 };
}

/** Point on the curve at t = 0.5 (where the curve handle is shown). */
export function curveMid(p0: Pt, c: Pt | undefined, p2: Pt): Pt {
  if (!c) return { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
  return quad(p0, c, p2, 0.5);
}

/** Start and end of a line, following the tokens it is attached to. */
export function lineEnds(line: Line, tokens: Map<string, Token>): [Pt, Pt] {
  const a = (line.from && tokens.get(line.from)) || line.points[0];
  const b = (line.to && tokens.get(line.to)) || line.points[line.points.length - 1];
  return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
}

/** Polyline approximating the line in court units. */
export function linePolyline(line: Line, tokens: Map<string, Token>): Pt[] {
  if (line.kind === 'free') return line.points.map((p) => ({ ...p }));
  const [a, b] = lineEnds(line, tokens);
  if (!line.ctrl) return [a, b];
  const n = 48;
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) out.push(quad(a, line.ctrl, b, i / n));
  return out;
}

export function polyLength(pts: Pt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

/** Cut `d0` from the start and `d1` from the end of a polyline. */
export function trimPolyline(pts: Pt[], d0: number, d1: number): Pt[] {
  const total = polyLength(pts);
  if (pts.length < 2 || total <= d0 + d1 + 0.5) return pts.length >= 2 ? pts : pts.concat(pts);
  return slicePolyline(pts, d0, total - d1);
}

/** Portion of the polyline between distances s0 and s1 from the start. */
export function slicePolyline(pts: Pt[], s0: number, s1: number): Pt[] {
  const out: Pt[] = [];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = dist(a, b);
    const next = acc + seg;
    if (seg > 0) {
      if (out.length === 0 && next >= s0) {
        out.push(lerp(a, b, (s0 - acc) / seg));
      }
      if (out.length > 0) {
        if (next >= s1) {
          out.push(lerp(a, b, (s1 - acc) / seg));
          return out;
        }
        out.push(b);
      }
    }
    acc = next;
  }
  return out.length >= 2 ? out : [pts[0], pts[pts.length - 1]];
}

export function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Unit direction of the final segment of a polyline. */
export function endDirection(pts: Pt[]): Pt {
  for (let i = pts.length - 1; i > 0; i--) {
    const d = dist(pts[i], pts[i - 1]);
    if (d > 1e-6) return { x: (pts[i].x - pts[i - 1].x) / d, y: (pts[i].y - pts[i - 1].y) / d };
  }
  return { x: 1, y: 0 };
}

/** Polyline shifted sideways by `off` (used for the double shot line). */
export function offsetPolyline(pts: Pt[], off: number): Pt[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const d = dist(a, b) || 1;
    const nx = -(b.y - a.y) / d;
    const ny = (b.x - a.x) / d;
    return { x: p.x + nx * off, y: p.y + ny * off };
  });
}

/** Zig-zag (dribble) along a polyline, leaving a straight tail for the arrow. */
export function zigzag(pts: Pt[], amp: number, wave: number, tail: number): Pt[] {
  const total = polyLength(pts);
  const body = Math.max(0, total - tail);
  const out: Pt[] = [];
  const step = wave / 8;
  for (let s = 0; s <= body; s += step) {
    const p = pointAt(pts, s);
    const o = amp * Math.sin((s / wave) * Math.PI * 2);
    out.push({ x: p.p.x + p.n.x * o, y: p.p.y + p.n.y * o });
  }
  out.push(pointAt(pts, body).p);
  out.push(pts[pts.length - 1]);
  return out;
}

function pointAt(pts: Pt[], s: number): { p: Pt; n: Pt } {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = dist(a, b);
    if (seg > 0 && acc + seg >= s) {
      const t = (s - acc) / seg;
      return { p: lerp(a, b, t), n: { x: -(b.y - a.y) / seg, y: (b.x - a.x) / seg } };
    }
    acc += seg;
  }
  const a = pts[Math.max(0, pts.length - 2)];
  const b = pts[pts.length - 1];
  const seg = dist(a, b) || 1;
  return { p: b, n: { x: -(b.y - a.y) / seg, y: (b.x - a.x) / seg } };
}

export function pathD(pts: Pt[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join('');
}

/** Distance from point p to a polyline. */
export function distToPolyline(p: Pt, pts: Pt[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, distToSegment(p, pts[i - 1], pts[i]));
  return best;
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
  return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

/** Drop points closer than `min` to the previous kept point (pen smoothing). */
export function simplify(pts: Pt[], min: number): Pt[] {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) if (dist(pts[i], out[out.length - 1]) >= min) out.push(pts[i]);
  out.push(pts[pts.length - 1]);
  return out;
}
