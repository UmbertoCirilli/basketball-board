// Data model. All coordinates are in court units: 1 unit = 10 cm (decimetres).
// Half court: 150 x 140, basket at the top (y = 0 is the baseline).
// Full court: 280 x 150, baskets on the left and right.

export type CourtType = 'half' | 'full';

export interface Pt {
  x: number;
  y: number;
}

export type TokenKind = 'offense' | 'defense' | 'ball' | 'cone' | 'coach' | 'text';

export interface Token {
  id: string;
  kind: TokenKind;
  x: number;
  y: number;
  /** Number for players ("1".."5"), free text for text tokens, letter for coach. */
  label: string;
  /** Offensive player currently holding the ball. */
  hasBall?: boolean;
}

export type LineKind = 'cut' | 'pass' | 'dribble' | 'screen' | 'shot' | 'handoff' | 'free';

export interface Line {
  id: string;
  kind: LineKind;
  /**
   * For every kind except 'free': [start, end]. For 'free': the sampled pen path.
   */
  points: Pt[];
  /** Quadratic bezier control point. Undefined = straight line. */
  ctrl?: Pt;
  /** Token the line starts from (its start follows the token). */
  from?: string;
  /** Token the line ends on (passes / handoffs). */
  to?: string;
}

export interface Phase {
  id: string;
  note: string;
  tokens: Token[];
  lines: Line[];
}

export interface Play {
  id: string;
  title: string;
  category: string;
  court: CourtType;
  objective: string;
  description: string;
  phases: Phase[];
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  teamName: string;
}

export const CATEGORIES = [
  'Attacco',
  'Difesa',
  'Rimessa',
  'Transizione',
  'Fine partita',
  'Esercizio',
  'Riscaldamento',
  'Tiro',
  'Altro',
];
