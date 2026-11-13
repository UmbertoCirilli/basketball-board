import { s } from './svg';
import type { CourtType, Pt } from './types';

// FIBA measurements in decimetres (1 unit = 10 cm).
const BASKET_Y = 15.75; // basket centre from the baseline
const RING_R = 2.25;
const BOARD_Y = 12;
const BOARD_HALF = 9;
const KEY_HALF = 24.5; // key is 4.90 m wide
const KEY_LEN = 58; // free-throw line at 5.80 m
const FT_R = 18;
const NC_R = 12.5; // no-charge semicircle
const THREE_R = 67.5;
const THREE_SIDE = 9; // straight part 0.90 m from the sideline
const CENTER_R = 18;

export const MARGIN = 12;

export const COURT_SIZE: Record<CourtType, { w: number; h: number }> = {
  half: { w: 150, h: 140 },
  full: { w: 280, h: 150 },
};

export type CourtStyle = 'wood' | 'white';

const STYLES: Record<CourtStyle, { floor: string; paint: string; line: string; out: string }> = {
  wood: { floor: '#f4e2c1', paint: '#e9c99a', line: '#5b4636', out: '#ffffff' },
  white: { floor: '#ffffff', paint: '#f1f3f6', line: '#2b2f36', out: '#ffffff' },
};

export function viewBox(court: CourtType): string {
  const { w, h } = COURT_SIZE[court];
  return `${-MARGIN} ${-MARGIN} ${w + 2 * MARGIN} ${h + 2 * MARGIN}`;
}

/** Basket centres, used to aim shot lines. */
export function basketPositions(court: CourtType): Pt[] {
  if (court === 'half') return [{ x: 75, y: BASKET_Y }];
  return [
    { x: BASKET_Y, y: 75 },
    { x: 280 - BASKET_Y, y: 75 },
  ];
}

/**
 * One basket end, drawn in "half-court" coordinates (x across the court 0..150,
 * y distance from the baseline).
 */
function basketEnd(st: (typeof STYLES)[CourtStyle]): SVGGElement {
  const cx = 75;
  const line = { stroke: st.line, 'stroke-width': 0.5, fill: 'none' };
  const threeY = BASKET_Y + Math.sqrt(THREE_R ** 2 - (cx - THREE_SIDE) ** 2);
  return s('g', {}, [
    s('rect', { x: cx - KEY_HALF, y: 0, width: KEY_HALF * 2, height: KEY_LEN, ...line, fill: st.paint }),
    // free-throw circle: solid outside the key, dashed inside
    s('path', { d: `M${cx - FT_R} ${KEY_LEN} A${FT_R} ${FT_R} 0 0 0 ${cx + FT_R} ${KEY_LEN}`, ...line }),
    s('path', {
      d: `M${cx - FT_R} ${KEY_LEN} A${FT_R} ${FT_R} 0 0 1 ${cx + FT_R} ${KEY_LEN}`,
      ...line,
      'stroke-dasharray': '2 1.6',
    }),
    // three-point line
    s('path', {
      d: `M${THREE_SIDE} 0 L${THREE_SIDE} ${threeY} A${THREE_R} ${THREE_R} 0 0 0 ${150 - THREE_SIDE} ${threeY} L${150 - THREE_SIDE} 0`,
      ...line,
    }),
    // no-charge semicircle
    s('path', {
      d: `M${cx - NC_R} ${BOARD_Y} L${cx - NC_R} ${BASKET_Y} A${NC_R} ${NC_R} 0 0 0 ${cx + NC_R} ${BASKET_Y} L${cx + NC_R} ${BOARD_Y}`,
      ...line,
      'stroke-width': 0.35,
    }),
    // backboard and ring
    s('line', { x1: cx - BOARD_HALF, y1: BOARD_Y, x2: cx + BOARD_HALF, y2: BOARD_Y, stroke: st.line, 'stroke-width': 1 }),
    s('line', { x1: cx, y1: BOARD_Y, x2: cx, y2: BASKET_Y - RING_R, stroke: st.line, 'stroke-width': 0.5 }),
    s('circle', { cx, cy: BASKET_Y, r: RING_R, fill: 'none', stroke: '#d9531e', 'stroke-width': 0.6 }),
  ]);
}

export function drawCourt(court: CourtType, style: CourtStyle = 'wood'): SVGGElement {
  const st = STYLES[style];
  const { w, h } = COURT_SIZE[court];
  const line = { stroke: st.line, 'stroke-width': 0.5, fill: 'none' };
  const g = s('g', { class: 'court' });
  g.appendChild(
    s('rect', { x: -MARGIN, y: -MARGIN, width: w + 2 * MARGIN, height: h + 2 * MARGIN, fill: st.out }),
  );
  g.appendChild(s('rect', { x: 0, y: 0, width: w, height: h, fill: st.floor }));

  if (court === 'half') {
    g.appendChild(basketEnd(st));
    g.appendChild(
      s('path', { d: `M${75 - CENTER_R} ${h} A${CENTER_R} ${CENTER_R} 0 0 1 ${75 + CENTER_R} ${h}`, ...line }),
    );
  } else {
    const left = basketEnd(st);
    left.setAttribute('transform', 'matrix(0 -1 1 0 0 150)');
    const right = basketEnd(st);
    right.setAttribute('transform', 'matrix(0 1 -1 0 280 0)');
    g.appendChild(left);
    g.appendChild(right);
    g.appendChild(s('line', { x1: 140, y1: 0, x2: 140, y2: h, ...line }));
    g.appendChild(s('circle', { cx: 140, cy: 75, r: CENTER_R, ...line }));
  }
  g.appendChild(s('rect', { x: 0, y: 0, width: w, height: h, ...line, 'stroke-width': 0.8 }));
  return g;
}
