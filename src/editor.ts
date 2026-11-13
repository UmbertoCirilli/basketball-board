import { basketPositions } from './court';
import { ctrlThrough, dist, distToPolyline, lineEnds, simplify } from './geometry';
import { branchStart, clone, makeToken, nextPhaseFrom, uid } from './model';
import { renderPhase, TOKEN_R, tokenMap } from './render';
import type { AppSettings } from './store';
import type { Branch, Line, LineKind, Phase, Play, Pt, Token, TokenKind } from './types';

export type Tool = 'select' | TokenKind | LineKind;

export const LINE_TOOLS: LineKind[] = ['cut', 'pass', 'dribble', 'screen', 'shot', 'handoff', 'free'];
const TOKEN_TOOLS: TokenKind[] = ['offense', 'defense', 'ball', 'cone', 'coach', 'text'];

type Drag =
  | { type: 'token'; id: string; offset: Pt; moved: boolean }
  | { type: 'handle'; lineId: string; which: 'start' | 'ctrl' | 'end' }
  | { type: 'newLine'; line: Line; startPt: Pt }
  | { type: 'pen'; line: Line }
  | { type: 'moveLine'; lineId: string; last: Pt; moved: boolean };

const HISTORY_LIMIT = 150;

export class Editor {
  play: Play;
  phaseIndex = 0;
  tool: Tool = 'select';
  selectedId: string | null = null;
  showGhost = true;
  readonly svg: SVGSVGElement;

  /** Called after any change; `structural` = data changed (save + refresh panels). */
  onChange: (structural: boolean) => void = () => {};
  /** Called when a text token was placed (UI focuses its input). */
  onTextPlaced: (id: string) => void = () => {};

  private drag: Drag | null = null;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private snapshot: string;

  constructor(
    host: HTMLElement,
    play: Play,
    private settings: () => AppSettings,
  ) {
    this.play = play;
    this.snapshot = JSON.stringify(play);
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('board-svg');
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    host.appendChild(this.svg);
    this.svg.addEventListener('pointerdown', (e) => this.pointerDown(e));
    this.svg.addEventListener('pointermove', (e) => this.pointerMove(e));
    this.svg.addEventListener('pointerup', (e) => this.pointerUp(e));
    this.svg.addEventListener('pointercancel', (e) => this.pointerUp(e));
    this.render();
  }

  /** Alternative being edited (null = main line). */
  branchId: string | null = null;

  get branch(): Branch | null {
    return (this.branchId && this.play.branches?.find((b) => b.id === this.branchId)) || null;
  }

  /** Sequence being edited: the main line or the current alternative. */
  get seq(): Phase[] {
    return this.branch?.phases ?? this.play.phases;
  }

  get phase(): Phase {
    return this.seq[this.phaseIndex];
  }

  /** Phase that comes before the current one (for the ghost overlay). */
  private previousPhase(): Phase | undefined {
    if (this.phaseIndex > 0) return this.seq[this.phaseIndex - 1];
    const b = this.branch;
    return b ? this.play.phases[branchStart(this.play, b)] : undefined;
  }

  /** Main-line phase index where the current alternative starts (or the current index). */
  branchPointIndex(): number {
    const b = this.branch;
    return b ? branchStart(this.play, b) : this.phaseIndex;
  }

  // ------------------------------------------------------------ state

  load(play: Play): void {
    this.play = play;
    this.phaseIndex = 0;
    this.branchId = null;
    this.selectedId = null;
    this.undoStack = [];
    this.redoStack = [];
    this.snapshot = JSON.stringify(play);
    this.render();
    this.onChange(false);
  }

  /** Records an undo step if the play changed, then re-renders. */
  commit(): void {
    const now = JSON.stringify(this.play);
    if (now !== this.snapshot) {
      this.undoStack.push(this.snapshot);
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      this.redoStack = [];
      this.snapshot = now;
      this.play.updatedAt = Date.now();
    }
    this.render();
    this.onChange(true);
  }

  canUndo = () => this.undoStack.length > 0;
  canRedo = () => this.redoStack.length > 0;

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.snapshot);
    this.restore(prev);
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.snapshot);
    this.restore(next);
  }

  private restore(json: string): void {
    this.snapshot = json;
    this.play = JSON.parse(json);
    if (!this.branch) this.branchId = null;
    this.phaseIndex = Math.min(this.phaseIndex, this.seq.length - 1);
    this.selectedId = null;
    this.render();
    this.onChange(true);
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    if (tool !== 'select') this.selectedId = null;
    this.render();
    this.onChange(false);
  }

  select(id: string | null): void {
    this.selectedId = id;
    this.render();
    this.onChange(false);
  }

  /** Opens phase `i` of the main line (branchId = null) or of an alternative. */
  goToPhase(i: number, branchId: string | null = this.branchId): void {
    this.branchId = branchId;
    if (!this.branch) this.branchId = null;
    this.phaseIndex = Math.max(0, Math.min(this.seq.length - 1, i));
    this.selectedId = null;
    this.render();
    this.onChange(false);
  }

  // ------------------------------------------------------------ phases

  addNextPhase(): void {
    this.seq.splice(this.phaseIndex + 1, 0, nextPhaseFrom(this.phase));
    this.phaseIndex++;
    this.selectedId = null;
    this.commit();
  }

  duplicatePhase(): void {
    const copy = clone(this.phase);
    copy.id = uid();
    this.seq.splice(this.phaseIndex + 1, 0, copy);
    this.phaseIndex++;
    this.commit();
  }

  /**
   * Deletes the current phase. In the main line this also removes the
   * alternatives starting from it; deleting the only phase of an
   * alternative removes the alternative.
   */
  deletePhase(): void {
    const b = this.branch;
    if (b && b.phases.length <= 1) {
      this.deleteBranch(b.id);
      return;
    }
    if (!b && this.play.phases.length <= 1) {
      this.play.phases[0] = { ...this.phase, tokens: [], lines: [], note: '' };
      this.play.branches = [];
    } else {
      const removed = this.seq.splice(this.phaseIndex, 1)[0];
      if (!b) this.play.branches = (this.play.branches ?? []).filter((x) => x.fromPhase !== removed.id);
      this.phaseIndex = Math.min(this.phaseIndex, this.seq.length - 1);
    }
    this.selectedId = null;
    this.commit();
  }

  movePhase(delta: number): void {
    const j = this.phaseIndex + delta;
    const ph = this.seq;
    if (j < 0 || j >= ph.length) return;
    [ph[this.phaseIndex], ph[j]] = [ph[j], ph[this.phaseIndex]];
    this.phaseIndex = j;
    this.commit();
  }

  // ------------------------------------------------------------ alternatives

  /**
   * New alternative starting from the current main-line phase (or, inside an
   * alternative, from the same phase that alternative starts from).
   */
  addAlternative(): void {
    const from = this.play.phases[this.branchPointIndex()];
    const branch: Branch = { id: uid(), name: '', fromPhase: from.id, phases: [nextPhaseFrom(from)] };
    (this.play.branches ??= []).push(branch);
    this.branchId = branch.id;
    this.phaseIndex = 0;
    this.selectedId = null;
    this.commit();
  }

  deleteBranch(id: string): void {
    const b = this.play.branches?.find((x) => x.id === id);
    if (!b) return;
    const start = branchStart(this.play, b);
    this.play.branches = this.play.branches!.filter((x) => x.id !== id);
    if (this.branchId === id) {
      this.branchId = null;
      this.phaseIndex = Math.max(0, start);
    }
    this.selectedId = null;
    this.commit();
  }

  clearLines(): void {
    this.phase.lines = [];
    this.selectedId = null;
    this.commit();
  }

  // ------------------------------------------------------------ selection edits

  selectedToken(): Token | undefined {
    return this.phase.tokens.find((t) => t.id === this.selectedId);
  }

  selectedLine(): Line | undefined {
    return this.phase.lines.find((l) => l.id === this.selectedId);
  }

  deleteSelected(): void {
    const id = this.selectedId;
    if (!id) return;
    const ph = this.phase;
    if (ph.tokens.some((t) => t.id === id)) {
      ph.tokens = ph.tokens.filter((t) => t.id !== id);
      ph.lines = ph.lines.filter((l) => l.from !== id);
      for (const l of ph.lines) if (l.to === id) l.to = undefined;
    } else {
      ph.lines = ph.lines.filter((l) => l.id !== id);
    }
    this.selectedId = null;
    this.commit();
  }

  /** Gives the ball to `id` (removing it from any other attacker). */
  setBall(id: string, has: boolean): void {
    for (const t of this.phase.tokens) if (t.kind === 'offense') t.hasBall = t.id === id ? has : has ? false : t.hasBall;
    this.commit();
  }

  // ------------------------------------------------------------ rendering

  render(): void {
    const prev = this.showGhost ? this.previousPhase()?.tokens : undefined;
    const fresh = renderPhase(this.play, this.phase, {
      style: this.settings().courtStyle,
      selectedId: this.selectedId,
      interactive: true,
      ghost: prev,
    });
    this.svg.setAttribute('viewBox', fresh.getAttribute('viewBox')!);
    this.svg.setAttribute('font-family', fresh.getAttribute('font-family')!);
    this.svg.replaceChildren(...Array.from(fresh.childNodes));
    this.svg.dataset.tool = this.tool;
  }

  // ------------------------------------------------------------ pointer handling

  private toCourt(e: PointerEvent): Pt {
    const m = this.svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  private tokenAt(p: Pt, exclude?: string): Token | undefined {
    let best: Token | undefined;
    let bestD = TOKEN_R + 2.5;
    for (const t of this.phase.tokens) {
      if (t.id === exclude || t.kind === 'text') continue;
      const d = dist(p, t);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  private pointerDown(e: PointerEvent): void {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const p = this.toCourt(e);
    const target = e.target as Element;
    const handleEl = target.closest('[data-handle]');
    const tokenEl = target.closest('[data-token]');
    const lineEl = target.closest('[data-line]');
    try {
      this.svg.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone: keep going without capture */
    }
    e.preventDefault();

    if (handleEl) {
      this.drag = {
        type: 'handle',
        lineId: handleEl.getAttribute('data-line')!,
        which: handleEl.getAttribute('data-handle') as 'start' | 'ctrl' | 'end',
      };
      return;
    }

    const tool = this.tool;
    if ((LINE_TOOLS as string[]).includes(tool)) {
      const kind = tool as LineKind;
      if (kind === 'free') {
        const line: Line = { id: uid(), kind, points: [p] };
        this.phase.lines.push(line);
        this.drag = { type: 'pen', line };
      } else {
        const from = this.tokenAt(p);
        const start = from ? { x: from.x, y: from.y } : p;
        const line: Line = { id: uid(), kind, points: [start, { ...p }], from: from?.id };
        this.phase.lines.push(line);
        this.drag = { type: 'newLine', line, startPt: p };
      }
      this.selectedId = null;
      this.render();
      return;
    }

    if (tokenEl) {
      const id = tokenEl.getAttribute('data-token')!;
      const t = this.phase.tokens.find((x) => x.id === id)!;
      this.selectedId = id;
      this.drag = { type: 'token', id, offset: { x: t.x - p.x, y: t.y - p.y }, moved: false };
      this.render();
      this.onChange(false);
      return;
    }

    if (tool === 'select') {
      if (lineEl) {
        const id = lineEl.getAttribute('data-line')!;
        this.selectedId = id;
        this.drag = { type: 'moveLine', lineId: id, last: p, moved: false };
      } else {
        this.selectedId = null;
      }
      this.render();
      this.onChange(false);
      return;
    }

    // token tools: place a new token
    const t = makeToken(tool as TokenKind, p, this.phase);
    if (t.kind === 'offense' && !this.phase.tokens.some((x) => x.kind === 'offense')) t.hasBall = true;
    this.phase.tokens.push(t);
    this.selectedId = t.id;
    this.drag = { type: 'token', id: t.id, offset: { x: 0, y: 0 }, moved: true };
    this.render();
    if (t.kind === 'text') {
      this.tool = 'select';
      this.onTextPlaced(t.id);
    }
  }

  private pointerMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const p = this.toCourt(e);
    const ph = this.phase;
    switch (d.type) {
      case 'token': {
        const t = ph.tokens.find((x) => x.id === d.id);
        if (!t) return;
        t.x = p.x + d.offset.x;
        t.y = p.y + d.offset.y;
        d.moved = true;
        break;
      }
      case 'handle': {
        const l = ph.lines.find((x) => x.id === d.lineId);
        if (!l) return;
        const tokens = tokenMap(ph);
        if (d.which === 'ctrl') {
          const [a, b] = lineEnds(l, tokens);
          l.ctrl = ctrlThrough(a, p, b);
        } else {
          this.moveEnd(l, d.which, p, tokens);
        }
        break;
      }
      case 'newLine':
        d.line.points[1] = p;
        break;
      case 'pen':
        d.line.points.push(p);
        break;
      case 'moveLine': {
        const l = ph.lines.find((x) => x.id === d.lineId);
        if (!l) return;
        const dx = p.x - d.last.x;
        const dy = p.y - d.last.y;
        d.last = p;
        d.moved = true;
        if (l.from || l.to) return; // attached lines move with their players
        l.points = l.points.map((q) => ({ x: q.x + dx, y: q.y + dy }));
        if (l.ctrl) l.ctrl = { x: l.ctrl.x + dx, y: l.ctrl.y + dy };
        break;
      }
    }
    this.render();
  }

  /** Moves a line end, keeping an existing curve shape roughly the same. */
  private moveEnd(l: Line, which: 'start' | 'end', p: Pt, tokens: Map<string, Token>): void {
    const [a, b] = lineEnds(l, tokens);
    if (which === 'start') {
      l.from = undefined;
      l.points[0] = p;
    } else {
      l.to = undefined;
      l.points[l.points.length - 1] = p;
    }
    if (l.ctrl) {
      const old = which === 'start' ? a : b;
      l.ctrl = { x: l.ctrl.x + (p.x - old.x) / 2, y: l.ctrl.y + (p.y - old.y) / 2 };
    }
  }

  private pointerUp(e: PointerEvent): void {
    const d = this.drag;
    this.drag = null;
    if (this.svg.hasPointerCapture(e.pointerId)) this.svg.releasePointerCapture(e.pointerId);
    if (!d) return;
    const ph = this.phase;
    const p = this.toCourt(e);

    if (d.type === 'newLine') {
      const l = d.line;
      const [a] = lineEnds(l, tokenMap(ph));
      if (dist(d.startPt, p) < 3) {
        // a tap, not a drag
        ph.lines = ph.lines.filter((x) => x.id !== l.id);
        const from = l.from ? ph.tokens.find((t) => t.id === l.from) : undefined;
        if (l.kind === 'shot' && from) {
          this.addShot(from);
        } else {
          const hit = this.lineAt(p);
          this.selectedId = from?.id ?? hit?.id ?? null;
          this.render();
          this.onChange(false);
        }
        return;
      }
      if (l.kind === 'pass' || l.kind === 'handoff') {
        const target = this.tokenAt(p, l.from);
        if (target) l.to = target.id;
      }
      if (dist(a, p) < 2) ph.lines = ph.lines.filter((x) => x.id !== l.id);
      this.selectedId = l.id;
      this.commit();
      return;
    }

    if (d.type === 'pen') {
      if (d.line.points.length < 3) ph.lines = ph.lines.filter((x) => x.id !== d.line.id);
      else d.line.points = simplify(d.line.points, 0.8);
      this.commit();
      return;
    }

    if (d.type === 'handle' && d.which === 'end') {
      const l = ph.lines.find((x) => x.id === d.lineId);
      if (l && (l.kind === 'pass' || l.kind === 'handoff')) {
        const target = this.tokenAt(p, l.from);
        if (target) l.to = target.id;
      }
    }
    if (d.type === 'handle' && d.which === 'start') {
      const l = ph.lines.find((x) => x.id === d.lineId);
      const target = l && this.tokenAt(p, l.to);
      if (l && target) l.from = target.id;
    }
    this.commit();
  }

  private lineAt(p: Pt): Line | undefined {
    const tokens = tokenMap(this.phase);
    return this.phase.lines.find((l) => {
      const [a, b] = lineEnds(l, tokens);
      const pts = l.kind === 'free' ? l.points : l.ctrl ? [a, l.ctrl, b] : [a, b];
      return distToPolyline(p, pts) < 3;
    });
  }

  /** Tap with the shot tool on a player: arrow towards the nearest basket. */
  private addShot(from: Token): void {
    const baskets = basketPositions(this.play.court);
    const basket = baskets.reduce((best, b) => (dist(b, from) < dist(best, from) ? b : best));
    const dx = basket.x - from.x;
    const dy = basket.y - from.y;
    const d = Math.hypot(dx, dy) || 1;
    const len = Math.max(4, d - 3.5);
    const end = { x: from.x + (dx / d) * len, y: from.y + (dy / d) * len };
    const line: Line = { id: uid(), kind: 'shot', points: [{ x: from.x, y: from.y }, end], from: from.id };
    this.phase.lines.push(line);
    this.selectedId = line.id;
    this.commit();
  }
}

export { TOKEN_TOOLS };
