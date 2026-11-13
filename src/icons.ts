import { drawLine, drawToken } from './render';
import { s } from './svg';
import type { LineKind, TokenKind } from './types';

export function tokenIcon(kind: TokenKind): SVGSVGElement {
  const label = kind === 'offense' || kind === 'defense' ? '1' : kind === 'coach' ? 'C' : kind === 'text' ? 'Aa' : '';
  const svg = s('svg', { viewBox: '-6.5 -6.5 13 13', class: 'tool-icon' });
  svg.appendChild(drawToken({ id: 'i', kind, x: 0, y: 0, label, hasBall: false }, false));
  return svg;
}

export function lineIcon(kind: LineKind): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 26 14', class: 'tool-icon' });
  const points =
    kind === 'free'
      ? [
          { x: 2, y: 10 },
          { x: 6, y: 4 },
          { x: 11, y: 9 },
          { x: 16, y: 3 },
          { x: 20, y: 8 },
          { x: 24, y: 5 },
        ]
      : [
          { x: 2, y: 11 },
          { x: 23, y: 4 },
        ];
  svg.appendChild(drawLine({ id: 'i', kind, points }, new Map()));
  return svg;
}

export function selectIcon(): SVGSVGElement {
  return s('svg', { viewBox: '0 0 24 24', class: 'tool-icon' }, [
    s('path', {
      d: 'M6 3 L6 19 L10 15 L13 21 L15.5 20 L12.6 14 L18 14 Z',
      fill: '#1b1f24',
      stroke: '#1b1f24',
      'stroke-width': 1,
      'stroke-linejoin': 'round',
    }),
  ]);
}
