import { drawCourt, viewBox, type CourtStyle } from './court';
import {
  curveMid,
  endDirection,
  lineEnds,
  linePolyline,
  offsetPolyline,
  pathD,
  trimPolyline,
  zigzag,
} from './geometry';
import { s, svgText } from './svg';
import type { Line, Phase, Play, Pt, Token } from './types';

export const TOKEN_R = 4.2;
export const COLORS = {
  offense: '#1d3a6e',
  defense: '#c62828',
  ink: '#1b1f24',
  ball: '#f08a24',
  cone: '#f26b1d',
  select: '#1e88e5',
};

const SW = 0.6; // line stroke width
const FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface RenderOptions {
  style?: CourtStyle;
  selectedId?: string | null;
  /** Adds hit areas and data-* attributes for the editor. */
  interactive?: boolean;
  /** Tokens of the previous phase, drawn faded for reference. */
  ghost?: Token[];
}

export function tokenMap(phase: Phase): Map<string, Token> {
  return new Map(phase.tokens.map((t) => [t.id, t]));
}

export function renderPhase(play: Play, phase: Phase, opts: RenderOptions = {}): SVGSVGElement {
  const svg = s('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: viewBox(play.court),
    class: 'board-svg',
    'font-family': FONT,
  });
  svg.appendChild(drawCourt(play.court, opts.style));

  if (opts.ghost) {
    const g = s('g', { opacity: 0.22, 'pointer-events': 'none' });
    for (const t of opts.ghost) if (t.kind === 'offense' || t.kind === 'defense') g.appendChild(drawToken(t, false));
    svg.appendChild(g);
  }

  const tokens = tokenMap(phase);
  const linesG = s('g', { class: 'lines' });
  for (const line of phase.lines) linesG.appendChild(drawLine(line, tokens, opts));
  svg.appendChild(linesG);

  const tokG = s('g', { class: 'tokens' });
  for (const t of phase.tokens) {
    const g = drawToken(t, opts.selectedId === t.id);
    if (opts.interactive) {
      g.setAttribute('data-token', t.id);
      g.classList.add('hit');
    }
    tokG.appendChild(g);
  }
  svg.appendChild(tokG);

  if (opts.interactive && opts.selectedId) {
    const sel = phase.lines.find((l) => l.id === opts.selectedId);
    if (sel) svg.appendChild(lineHandles(sel, tokens));
  }
  return svg;
}

// ---------------------------------------------------------------- tokens

export function drawToken(t: Token, selected: boolean): SVGGElement {
  const g = s('g', { transform: `translate(${t.x.toFixed(2)} ${t.y.toFixed(2)})` });
  if (selected) {
    g.appendChild(
      s('circle', { r: TOKEN_R + 2, fill: 'none', stroke: COLORS.select, 'stroke-width': 0.7, 'stroke-dasharray': '1.5 1' }),
    );
  }
  // generous invisible hit area (fingers on phones)
  g.appendChild(s('circle', { r: TOKEN_R + 2.5, fill: 'transparent' }));

  switch (t.kind) {
    case 'offense':
      g.appendChild(s('circle', { r: TOKEN_R, fill: '#fff', stroke: COLORS.offense, 'stroke-width': 0.8 }));
      g.appendChild(
        svgText(t.label, {
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-size': 5,
          'font-weight': 700,
          fill: COLORS.offense,
          y: 0.2,
        }),
      );
      if (t.hasBall) g.appendChild(ballShape({ x: TOKEN_R * 0.85, y: -TOKEN_R * 0.85 }, 1.9));
      break;
    case 'defense': {
      const txt = svgText('X', {
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': 7.5,
        'font-weight': 700,
        fill: COLORS.defense,
        x: -0.9,
        y: 0.2,
      });
      g.appendChild(txt);
      if (t.label) {
        g.appendChild(
          svgText(t.label, { 'font-size': 3.8, 'font-weight': 700, fill: COLORS.defense, x: 1.9, y: 3.6 }),
        );
      }
      break;
    }
    case 'ball':
      g.appendChild(ballShape({ x: 0, y: 0 }, 2.6));
      break;
    case 'cone':
      g.appendChild(
        s('path', {
          d: 'M0 -3.6 L3.1 2.6 L-3.1 2.6 Z',
          fill: COLORS.cone,
          stroke: '#9a3c0b',
          'stroke-width': 0.4,
          'stroke-linejoin': 'round',
        }),
      );
      g.appendChild(s('line', { x1: -3.6, y1: 2.6, x2: 3.6, y2: 2.6, stroke: '#9a3c0b', 'stroke-width': 0.6 }));
      break;
    case 'coach':
      g.appendChild(
        s('rect', { x: -TOKEN_R, y: -TOKEN_R, width: TOKEN_R * 2, height: TOKEN_R * 2, rx: 1, fill: '#263238' }),
      );
      g.appendChild(
        svgText(t.label || 'C', {
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-size': 4.8,
          'font-weight': 700,
          fill: '#fff',
          y: 0.2,
        }),
      );
      break;
    case 'text': {
      const lines = (t.label || 'Testo').split('\n');
      const txt = s('text', {
        'text-anchor': 'middle',
        'font-size': 4,
        'font-weight': 600,
        fill: COLORS.ink,
        stroke: '#fff',
        'stroke-width': 1.1,
        'paint-order': 'stroke',
        'stroke-linejoin': 'round',
      });
      lines.forEach((l, i) => {
        const span = s('tspan', { x: 0, y: (i - (lines.length - 1) / 2) * 4.8 + 1.4 });
        span.textContent = l || ' ';
        txt.appendChild(span);
      });
      g.appendChild(txt);
      break;
    }
  }
  return g;
}

function ballShape(c: Pt, r: number): SVGGElement {
  return s('g', { transform: `translate(${c.x} ${c.y})` }, [
    s('circle', { r, fill: COLORS.ball, stroke: '#7a3b06', 'stroke-width': 0.35 }),
    s('path', {
      d: `M${-r} 0 L${r} 0 M0 ${-r} L0 ${r} M${-r * 0.7} ${-r * 0.7} Q0 0 ${-r * 0.7} ${r * 0.7} M${r * 0.7} ${-r * 0.7} Q0 0 ${r * 0.7} ${r * 0.7}`,
      fill: 'none',
      stroke: '#7a3b06',
      'stroke-width': 0.25,
    }),
  ]);
}

// ---------------------------------------------------------------- lines

function arrowHead(tip: Pt, dir: Pt, color: string, len = 3.6, half = 1.7): SVGPathElement {
  const bx = tip.x - dir.x * len;
  const by = tip.y - dir.y * len;
  const nx = -dir.y;
  const ny = dir.x;
  return s('path', {
    d: `M${tip.x} ${tip.y} L${bx + nx * half} ${by + ny * half} L${bx - nx * half} ${by - ny * half} Z`,
    fill: color,
  });
}

function bar(at: Pt, dir: Pt, half: number, color: string, width = 0.9): SVGLineElement {
  const nx = -dir.y;
  const ny = dir.x;
  return s('line', {
    x1: at.x + nx * half,
    y1: at.y + ny * half,
    x2: at.x - nx * half,
    y2: at.y - ny * half,
    stroke: color,
    'stroke-width': width,
    'stroke-linecap': 'round',
  });
}

export function drawLine(line: Line, tokens: Map<string, Token>, opts: RenderOptions = {}): SVGGElement {
  const selected = opts.selectedId === line.id;
  const color = selected ? COLORS.select : COLORS.ink;
  const g = s('g', { class: 'line' });
  const raw = linePolyline(line, tokens);
  const startTrim = line.from ? TOKEN_R + 0.9 : 0;
  const endTrim = line.to ? TOKEN_R + 0.9 : 0;
  const pts = line.kind === 'free' ? raw : trimPolyline(raw, startTrim, endTrim);
  const dir = endDirection(pts);
  const tip = pts[pts.length - 1];
  const stroke = { stroke: color, 'stroke-width': SW, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  // shorten the drawn line under the arrow head so the tip stays sharp
  const body = (d: number) => (pts.length >= 2 ? trimPolyline(pts, 0, d) : pts);

  switch (line.kind) {
    case 'cut':
      g.appendChild(s('path', { d: pathD(body(2)), ...stroke }));
      g.appendChild(arrowHead(tip, dir, color));
      break;
    case 'pass':
      g.appendChild(s('path', { d: pathD(body(2)), ...stroke, 'stroke-dasharray': '2.2 1.5', 'stroke-linecap': 'butt' }));
      g.appendChild(arrowHead(tip, dir, color));
      break;
    case 'dribble':
      g.appendChild(s('path', { d: pathD(zigzag(body(2), 1.3, 4, 3)), ...stroke }));
      g.appendChild(arrowHead(tip, dir, color));
      break;
    case 'screen':
      g.appendChild(s('path', { d: pathD(pts), ...stroke }));
      g.appendChild(bar(tip, dir, 3.2, color, 1));
      break;
    case 'shot': {
      const b = body(2.5);
      g.appendChild(s('path', { d: pathD(offsetPolyline(b, 0.8)), ...stroke, 'stroke-width': 0.45 }));
      g.appendChild(s('path', { d: pathD(offsetPolyline(b, -0.8)), ...stroke, 'stroke-width': 0.45 }));
      g.appendChild(arrowHead(tip, dir, color, 4, 2.4));
      break;
    }
    case 'handoff': {
      g.appendChild(s('path', { d: pathD(pts), ...stroke }));
      const back = (d: number) => ({ x: tip.x - dir.x * d, y: tip.y - dir.y * d });
      g.appendChild(bar(back(0.6), dir, 2.6, color, 0.7));
      g.appendChild(bar(back(2.2), dir, 2.6, color, 0.7));
      break;
    }
    case 'free':
      g.appendChild(s('path', { d: pathD(pts), ...stroke }));
      break;
  }

  if (opts.interactive) {
    g.setAttribute('data-line', line.id);
    g.classList.add('hit');
    // wide invisible stroke to make thin lines easy to tap
    g.insertBefore(
      s('path', { d: pathD(raw), stroke: 'transparent', 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' }),
      g.firstChild,
    );
  }
  return g;
}

/** Drag handles of the selected line (drawn above tokens). */
function lineHandles(line: Line, tokens: Map<string, Token>): SVGGElement {
  const g = s('g', { class: 'handles' });
  if (line.kind === 'free') return g;
  const [a, b] = lineEnds(line, tokens);
  const m = curveMid(a, line.ctrl, b);
  if (!line.from) g.appendChild(handle(a, 'start', line.id));
  g.appendChild(handle(m, 'ctrl', line.id));
  g.appendChild(handle(b, 'end', line.id));
  return g;
}

function handle(p: Pt, which: string, lineId: string): SVGGElement {
  return s('g', { 'data-handle': which, 'data-line': lineId, class: 'handle' }, [
    s('circle', { cx: p.x, cy: p.y, r: 4, fill: 'transparent' }),
    s('circle', {
      cx: p.x,
      cy: p.y,
      r: which === 'ctrl' ? 1.6 : 1.9,
      fill: which === 'ctrl' ? '#fff' : COLORS.select,
      stroke: COLORS.select,
      'stroke-width': 0.6,
    }),
  ]);
}

/** Standalone SVG string (used for thumbnails and PDF rasterisation). */
export function phaseSvgString(play: Play, phase: Phase, style: CourtStyle, widthPx: number): string {
  const svg = renderPhase(play, phase, { style });
  const [, , w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
  svg.setAttribute('width', String(widthPx));
  svg.setAttribute('height', String(Math.round((widthPx * h) / w)));
  return new XMLSerializer().serializeToString(svg);
}
