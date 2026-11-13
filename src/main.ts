import './style.css';
import { Editor, LINE_TOOLS, TOKEN_TOOLS, type Tool } from './editor';
import { lineIcon, selectIcon, tokenIcon } from './icons';
import {
  addFive,
  branchesFrom,
  branchLetter,
  branchStart,
  branchTitle,
  clone,
  convertCourt,
  courtLabel,
  newPlay,
  phaseLabel,
  sortedBranches,
  uid,
} from './model';
import { dataUrlToBlob, phaseToPng } from './raster';
import { renderPhase } from './render';
import { samplePlay } from './sample';
import {
  deletePlay,
  download,
  exportJson,
  importJson,
  lastPlayId,
  loadPlays,
  loadSettings,
  safeFilename,
  saveSettings,
  upsertPlay,
  type AppSettings,
} from './store';
import { CATEGORIES, type CourtType, type LineKind, type Phase, type Play, type TokenKind } from './types';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string; dataset?: Record<string, string> } = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: cls, dataset, ...rest } = props;
  if (cls) el.className = cls;
  if (dataset) Object.assign(el.dataset, dataset);
  Object.assign(el, rest);
  el.append(...children);
  return el;
}

const TOOL_NAMES: Record<Tool, string> = {
  select: 'Seleziona / sposta',
  offense: 'Attaccante',
  defense: 'Difensore',
  ball: 'Palla',
  cone: 'Cono',
  coach: 'Allenatore',
  text: 'Testo',
  cut: 'Taglio / movimento',
  pass: 'Passaggio',
  dribble: 'Palleggio',
  screen: 'Blocco',
  shot: 'Tiro',
  handoff: 'Consegnato (DHO)',
  free: 'Penna libera',
};

const TOOL_HINTS: Partial<Record<Tool, string>> = {
  select: 'Trascina giocatori e linee. Tocca una linea per curvarla con il punto centrale.',
  offense: 'Tocca il campo per aggiungere un attaccante (numerazione automatica).',
  defense: 'Tocca il campo per aggiungere un difensore.',
  cut: 'Trascina partendo da un giocatore: a fine fase si sposterà lì.',
  pass: 'Trascina dal portatore di palla al compagno: la palla passa a lui nella fase successiva.',
  dribble: 'Trascina dal portatore di palla.',
  screen: 'Trascina dal bloccante fino al punto del blocco.',
  shot: 'Tocca un giocatore per tirare verso il canestro, o trascina.',
  handoff: 'Trascina dal portatore al compagno che riceve il consegnato.',
  free: 'Disegna a mano libera.',
};

// ------------------------------------------------------------------ boot

let settings: AppSettings = loadSettings();

function initialPlay(): Play {
  const plays = loadPlays();
  if (!plays.length) {
    const sample = samplePlay();
    upsertPlay(sample);
    return sample;
  }
  const last = lastPlayId();
  return plays.find((p) => p.id === last) ?? plays[0];
}

const editor = new Editor($('#board'), initialPlay(), () => settings);

let saveTimer = 0;
function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      upsertPlay(editor.play);
    } catch {
      toast('Salvataggio non riuscito: memoria del browser piena?');
    }
  }, 300);
}

editor.onChange = (structural) => {
  if (structural) {
    scheduleSave();
    renderPhases();
  }
  refreshUI();
};
editor.onTextPlaced = () => {
  renderToolbar();
  refreshUI();
  openPanel();
  const input = document.querySelector<HTMLTextAreaElement>('#sel-label');
  input?.focus();
  input?.select();
};

// ------------------------------------------------------------------ toolbar

function renderToolbar(): void {
  const bar = $('#toolbar');
  bar.replaceChildren();
  const btn = (tool: Tool, icon: SVGSVGElement) =>
    h('button', { class: 'tool' + (editor.tool === tool ? ' active' : ''), title: TOOL_NAMES[tool], onclick: () => pickTool(tool) }, [
      icon,
      h('span', { class: 'tool-lbl' }, [TOOL_NAMES[tool].split(' ')[0]]),
    ]);
  bar.append(btn('select', selectIcon()));
  bar.append(h('div', { class: 'tool-sep' }));
  for (const k of TOKEN_TOOLS) bar.append(btn(k, tokenIcon(k as TokenKind)));
  bar.append(h('div', { class: 'tool-sep' }));
  for (const k of LINE_TOOLS) bar.append(btn(k, lineIcon(k as LineKind)));
  bar.append(h('div', { class: 'tool-sep' }));
  bar.append(
    h('button', { class: 'tool quick', title: 'Metti i 5 attaccanti in posizione', onclick: () => five('offense') }, ['5 att.']),
    h('button', { class: 'tool quick', title: 'Metti i 5 difensori sui rispettivi attaccanti', onclick: () => five('defense') }, ['5 dif.']),
    h('button', { class: 'tool quick', title: 'Cancella tutte le linee di questa fase', onclick: () => editor.clearLines() }, ['Pulisci']),
  );
}

function pickTool(tool: Tool): void {
  editor.setTool(tool);
  renderToolbar();
  const hint = TOOL_HINTS[tool];
  if (hint) toast(hint, 2600);
}

function five(kind: 'offense' | 'defense'): void {
  addFive(editor.phase, editor.play.court, kind);
  editor.commit();
}

// ------------------------------------------------------------------ panel

function buildPanel(): void {
  const panel = $('#panel');
  const catList = h('datalist', { id: 'cat-list' }, CATEGORIES.map((c) => h('option', { value: c })));
  panel.append(
    h('div', { class: 'panel-head only-mobile' }, [
      h('strong', {}, ['Dettagli']),
      h('button', { class: 'btn icon', onclick: closePanel, title: 'Chiudi' }, ['✕']),
    ]),
    h('section', { id: 'sel-section', class: 'card' }),
    h('section', { id: 'branch-card', class: 'card branch-card' }, [
      h('h3', { id: 'branch-title' }, ['Alternativa']),
      h('p', { id: 'branch-info', class: 'hint' }),
      h('label', {}, ['Nome / quando si usa', h('input', { id: 'branch-name', placeholder: 'es. Se X2 anticipa il passaggio' })]),
      h('button', {
        class: 'btn danger',
        onclick: () => {
          const b = editor.branch;
          if (b && confirm(`Eliminare "${branchTitle(editor.play, b)}" e tutte le sue fasi?`)) editor.deleteBranch(b.id);
        },
      }, ['Elimina alternativa']),
    ]),
    h('section', { class: 'card' }, [
      h('h3', { id: 'note-title' }, ['Note fase']),
      h('textarea', { id: 'phase-note', rows: 4, placeholder: 'Cosa succede in questa fase? (compare nel PDF sotto il disegno)' }),
      h('label', { class: 'check' }, [h('input', { type: 'checkbox', id: 'ghost' }), ' Mostra posizioni della fase precedente']),
    ]),
    h('section', { class: 'card' }, [
      h('h3', {}, ['Schema / esercizio']),
      h('label', {}, ['Categoria', h('input', { id: 'play-cat', placeholder: 'es. Attacco' })]),
      catList,
      h('label', {}, [
        'Campo',
        h('select', { id: 'play-court' }, [h('option', { value: 'half' }, ['Metà campo']), h('option', { value: 'full' }, ['Campo intero'])]),
      ]),
      h('label', {}, ['Obiettivo', h('textarea', { id: 'play-obj', rows: 2, placeholder: 'A cosa serve?' })]),
      h('label', {}, ['Descrizione', h('textarea', { id: 'play-desc', rows: 5, placeholder: 'Spiegazione generale, regole, varianti…' })]),
    ]),
    h('section', { class: 'card legend' }, [h('h3', {}, ['Legenda']), ...legend()]),
  );
  $('#play-cat').setAttribute('list', 'cat-list');

  bindText('#phase-note', (v) => (editor.phase.note = v));
  bindText('#play-cat', (v) => (editor.play.category = v));
  bindText('#play-obj', (v) => (editor.play.objective = v));
  bindText('#play-desc', (v) => (editor.play.description = v));
  bindText('#play-title', (v) => (editor.play.title = v));
  bindText('#branch-name', (v) => {
    const b = editor.branch;
    if (b) b.name = v;
  });

  $<HTMLInputElement>('#ghost').addEventListener('change', (e) => {
    editor.showGhost = (e.target as HTMLInputElement).checked;
    editor.render();
  });
  $<HTMLSelectElement>('#play-court').addEventListener('change', (e) => {
    const to = (e.target as HTMLSelectElement).value as CourtType;
    convertCourt(editor.play, to);
    editor.commit();
  });
}

function legend(): HTMLElement[] {
  const rows: [LineKind, string][] = [
    ['cut', 'Taglio / movimento senza palla'],
    ['pass', 'Passaggio'],
    ['dribble', 'Palleggio'],
    ['screen', 'Blocco'],
    ['shot', 'Tiro'],
    ['handoff', 'Consegnato (DHO)'],
  ];
  return rows.map(([k, label]) => h('div', { class: 'legend-row' }, [lineIcon(k), h('span', {}, [label])]));
}

/** Text fields edit the model live; leaving the field records an undo step. */
function bindText(sel: string, set: (v: string) => void): void {
  const el = $<HTMLInputElement | HTMLTextAreaElement>(sel);
  el.addEventListener('input', () => {
    set(el.value);
    editor.render();
    scheduleSave();
    if (sel === '#phase-note' || sel === '#branch-name') renderPhases();
  });
  el.addEventListener('change', () => editor.commit());
}

function setValue(sel: string, v: string): void {
  const el = $<HTMLInputElement>(sel);
  if (document.activeElement !== el && el.value !== v) el.value = v;
}

let selKey = '-';
function renderSelection(): void {
  const box = $('#sel-section');
  const tok = editor.selectedToken();
  const line = editor.selectedLine();
  const key = tok ? `t:${tok.id}` : line ? `l:${line.id}:${line.kind}` : '';
  if (key === selKey) {
    if (tok) setValue('#sel-label', tok.label);
    if (tok?.kind === 'offense') $<HTMLInputElement>('#sel-ball').checked = !!tok.hasBall;
    return;
  }
  selKey = key;
  box.replaceChildren();
  box.hidden = !key;
  if (tok) {
    const names: Record<TokenKind, string> = {
      offense: 'Attaccante',
      defense: 'Difensore',
      ball: 'Palla',
      cone: 'Cono',
      coach: 'Allenatore',
      text: 'Testo',
    };
    box.append(h('h3', {}, [names[tok.kind]]));
    if (tok.kind !== 'ball' && tok.kind !== 'cone') {
      const input =
        tok.kind === 'text'
          ? h('textarea', { id: 'sel-label', rows: 2, value: tok.label })
          : h('input', { id: 'sel-label', value: tok.label, maxLength: 3 });
      input.addEventListener('input', () => {
        const t = editor.selectedToken();
        if (t) t.label = input.value;
        editor.render();
        scheduleSave();
      });
      input.addEventListener('change', () => editor.commit());
      box.append(h('label', {}, [tok.kind === 'text' ? 'Testo' : 'Etichetta', input]));
    }
    if (tok.kind === 'offense') {
      const cb = h('input', { type: 'checkbox', id: 'sel-ball', checked: !!tok.hasBall });
      cb.addEventListener('change', () => editor.setBall(tok.id, cb.checked));
      box.append(h('label', { class: 'check' }, [cb, ' Ha la palla']));
    }
  } else if (line) {
    box.append(h('h3', {}, ['Linea']));
    const sel = h(
      'select',
      { id: 'sel-kind' },
      LINE_TOOLS.filter((k) => k !== 'free' || line.kind === 'free').map((k) =>
        h('option', { value: k, selected: k === line.kind }, [TOOL_NAMES[k]]),
      ),
    );
    sel.disabled = line.kind === 'free';
    sel.addEventListener('change', () => {
      const l = editor.selectedLine();
      if (l) l.kind = sel.value as LineKind;
      editor.commit();
    });
    box.append(h('label', {}, ['Tipo', sel]));
    if (line.kind !== 'free') {
      box.append(
        h('button', {
          class: 'btn',
          onclick: () => {
            const l = editor.selectedLine();
            if (l) l.ctrl = undefined;
            editor.commit();
          },
        }, ['Raddrizza']),
      );
    }
  }
  if (key) box.append(h('button', { class: 'btn danger', onclick: () => editor.deleteSelected() }, ['Elimina']));
}

let lastPos = '';
function refreshUI(): void {
  const p = editor.play;
  setValue('#play-title', p.title);
  setValue('#phase-note', editor.phase.note);
  setValue('#play-cat', p.category);
  setValue('#play-obj', p.objective);
  setValue('#play-desc', p.description);
  $<HTMLSelectElement>('#play-court').value = p.court;
  $<HTMLInputElement>('#ghost').checked = editor.showGhost;
  const b = editor.branch;
  $('#note-title').textContent = `Note fase ${phaseLabel(p, b, editor.phaseIndex)}`;
  $<HTMLButtonElement>('#btn-undo').disabled = !editor.canUndo();
  $<HTMLButtonElement>('#btn-redo').disabled = !editor.canRedo();
  $<HTMLButtonElement>('#ph-left').disabled = editor.phaseIndex === 0;
  $<HTMLButtonElement>('#ph-right').disabled = editor.phaseIndex === editor.seq.length - 1;

  $('#branch-card').hidden = !b;
  if (b) {
    $('#branch-title').textContent = `Alternativa ${branchLetter(p, b.id)}`;
    $('#branch-info').textContent =
      `Parte dalla fase ${branchStart(p, b) + 1} della linea principale: invece di quello che succede dopo, succede questo.`;
    setValue('#branch-name', b.name);
  }

  const posKey = `${p.id}:${editor.branchId}:${editor.phaseIndex}`;
  if (posKey !== lastPos) {
    lastPos = posKey;
    renderPhases();
  }
  renderSelection();
  renderQuickBar();
}

/** Floating actions over the board for the selected item (handy on phones). */
function renderQuickBar(): void {
  let bar = document.querySelector<HTMLDivElement>('#quickbar');
  if (!bar) {
    bar = h('div', { id: 'quickbar', class: 'quickbar' });
    $('#board').append(bar);
  }
  const tok = editor.selectedToken();
  const line = editor.selectedLine();
  bar.replaceChildren();
  bar.hidden = !tok && !line;
  if (tok?.kind === 'offense') {
    bar.append(h('button', { class: 'btn', onclick: () => editor.setBall(tok.id, !tok.hasBall) }, [tok.hasBall ? 'Togli palla' : 'Dai palla']));
  }
  if (line && line.kind !== 'free' && line.ctrl) {
    bar.append(h('button', { class: 'btn', onclick: () => { line.ctrl = undefined; editor.commit(); } }, ['Raddrizza']));
  }
  if (tok || line) bar.append(h('button', { class: 'btn danger', onclick: () => editor.deleteSelected() }, ['Elimina']));
}

// ------------------------------------------------------------------ phases

/** Track tabs (main line / alternatives) and the phase thumbnails of the current track. */
function renderPhases(): void {
  const play = editor.play;
  const branches = sortedBranches(play);
  const current = editor.branch;

  const tracks = $('#tracks');
  tracks.hidden = branches.length === 0;
  tracks.replaceChildren(
    h('button', { class: 'track' + (!current ? ' active' : ''), onclick: () => editor.goToPhase(0, null) }, ['Principale']),
    ...branches.map((b) =>
      h(
        'button',
        {
          class: 'track alt' + (current?.id === b.id ? ' active' : ''),
          title: `Parte dalla fase ${branchStart(play, b) + 1}`,
          onclick: () => editor.goToPhase(0, b.id),
        },
        [h('strong', {}, [branchLetter(play, b.id)]), ` · ${b.name.trim() || 'dalla fase ' + (branchStart(play, b) + 1)}`],
      ),
    ),
  );

  const chip = (ph: Phase, label: string, opts: { active: boolean; shared?: boolean; badge?: string; onclick: () => void }) =>
    h(
      'button',
      {
        class: 'phase-chip' + (opts.active ? ' active' : '') + (opts.shared ? ' shared' : '') + (current && !opts.shared ? ' alt' : ''),
        title: ph.note || `Fase ${label}`,
        onclick: opts.onclick,
      },
      [
        renderPhase(play, ph, { style: settings.courtStyle }),
        h('span', {}, [`Fase ${label}`]),
        ...(opts.badge ? [h('em', { class: 'chip-badge' }, [opts.badge])] : []),
      ],
    );

  const list = $('#phases');
  if (!current) {
    list.replaceChildren(
      ...play.phases.map((ph, i) => {
        const n = branchesFrom(play, ph.id).length;
        return chip(ph, String(i + 1), {
          active: i === editor.phaseIndex,
          badge: n ? `+${n} alt.` : undefined,
          onclick: () => editor.goToPhase(i, null),
        });
      }),
    );
  } else {
    // shared main-line phases up to the branching point, then the alternative
    const start = branchStart(play, current);
    list.replaceChildren(
      ...play.phases.slice(0, start + 1).map((ph, i) =>
        chip(ph, String(i + 1), { active: false, shared: true, onclick: () => editor.goToPhase(i, null) }),
      ),
      h('span', { class: 'branch-arrow', title: branchTitle(play, current) }, ['↳']),
      ...current.phases.map((ph, i) =>
        chip(ph, phaseLabel(play, current, i), { active: i === editor.phaseIndex, onclick: () => editor.goToPhase(i) }),
      ),
    );
  }
  list.querySelector('.phase-chip.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

$('#ph-next').onclick = () => editor.addNextPhase();
$('#ph-alt').onclick = () => {
  editor.addAlternative();
  openPanel();
  const name = document.querySelector<HTMLInputElement>('#branch-name');
  if (name && !matchMedia('(pointer: coarse)').matches) name.focus();
  toast(`Nuova alternativa dalla fase ${editor.branchPointIndex() + 1}: dalle un nome e disegna cosa succede.`, 3500);
};
$('#ph-dup').onclick = () => editor.duplicatePhase();
$('#ph-left').onclick = () => editor.movePhase(-1);
$('#ph-right').onclick = () => editor.movePhase(1);
$('#ph-del').onclick = () => {
  const play = editor.play;
  const b = editor.branch;
  const label = phaseLabel(play, b, editor.phaseIndex);
  let msg = `Eliminare la fase ${label}?`;
  if (b && b.phases.length <= 1) msg = `È l'unica fase di "${branchTitle(play, b)}": eliminare l'alternativa?`;
  else if (!b) {
    const n = branchesFrom(play, editor.phase.id).length;
    if (n) msg = `Eliminare la fase ${label} e ${n === 1 ? "l'alternativa che parte" : `le ${n} alternative che partono`} da qui?`;
  }
  if (confirm(msg)) editor.deletePhase();
};

// ------------------------------------------------------------------ export

const isTouch = matchMedia('(pointer: coarse)').matches;

/** On phones, offer the system share sheet (WhatsApp, mail…); elsewhere download. */
async function deliver(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  if (isTouch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  download(blob, filename);
}

async function busy<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  toast(label, 60000);
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    toast('Errore: ' + (e as Error).message, 4000);
    return undefined;
  } finally {
    if ($('#toast').textContent === label) toast('');
  }
}

$('#btn-pdf').onclick = () =>
  busy('Creo il PDF…', async () => {
    upsertPlay(editor.play);
    const { playPdf } = await import('./pdf');
    const blob = await playPdf(editor.play, settings);
    await deliver(blob, safeFilename(editor.play.title) + '.pdf');
  });

$('#btn-png').onclick = () =>
  busy('Creo l’immagine…', async () => {
    const png = await phaseToPng(editor.play, editor.phase, settings.courtStyle, 1600);
    await deliver(dataUrlToBlob(png.url), `${safeFilename(editor.play.title)}_fase${phaseLabel(editor.play, editor.branch, editor.phaseIndex)}.png`);
  });

$('#btn-undo').onclick = () => editor.undo();
$('#btn-redo').onclick = () => editor.redo();

// ------------------------------------------------------------------ library

const library = $<HTMLDialogElement>('#library');
const chosen = new Set<string>();

function openLibrary(): void {
  upsertPlay(editor.play);
  renderLibrary();
  library.showModal();
}

function renderLibrary(): void {
  const plays = loadPlays();
  for (const id of [...chosen]) if (!plays.some((p) => p.id === id)) chosen.delete(id);
  const q = $<HTMLInputElement>('#lib-search').value.trim().toLowerCase();
  const catSel = $<HTMLSelectElement>('#lib-cat');
  const cats = [...new Set(plays.map((p) => p.category).filter(Boolean))].sort();
  const current = catSel.value;
  catSel.replaceChildren(h('option', { value: '' }, ['Tutte le categorie']), ...cats.map((c) => h('option', { value: c }, [c])));
  catSel.value = cats.includes(current) ? current : '';
  const visible = plays.filter(
    (p) =>
      (!catSel.value || p.category === catSel.value) &&
      (!q || `${p.title} ${p.category} ${p.description} ${p.objective}`.toLowerCase().includes(q)),
  );

  const list = $('#lib-list');
  list.replaceChildren();
  if (!visible.length) list.append(h('p', { class: 'empty' }, [plays.length ? 'Nessun risultato.' : 'Nessuno schema salvato.']));
  for (const p of visible) {
    const cb = h('input', { type: 'checkbox', checked: chosen.has(p.id), title: 'Seleziona per playbook / esportazione' });
    cb.addEventListener('change', () => {
      if (cb.checked) chosen.add(p.id);
      else chosen.delete(p.id);
      updateLibCount(plays.length);
    });
    const thumb = renderPhase(p, p.phases[0], { style: settings.courtStyle });
    const card = h('div', { class: 'lib-card' + (p.id === editor.play.id ? ' current' : '') }, [
      h('label', { class: 'lib-check' }, [cb]),
      h('button', { class: 'lib-thumb', title: 'Apri', onclick: () => openPlay(p) }, [thumb]),
      h('div', { class: 'lib-info' }, [
        h('button', { class: 'lib-title', onclick: () => openPlay(p) }, [p.title || 'Senza titolo']),
        h('div', { class: 'lib-meta' }, [
          [
            p.category,
            courtLabel(p),
            `${p.phases.length} fasi`,
            p.branches?.length ? `${p.branches.length} alternative` : '',
            new Date(p.updatedAt).toLocaleDateString('it-IT'),
          ]
            .filter(Boolean)
            .join(' · '),
        ]),
        h('div', { class: 'lib-actions' }, [
          h('button', { class: 'btn small', onclick: () => openPlay(p) }, ['Apri']),
          h('button', { class: 'btn small', onclick: () => duplicatePlay(p) }, ['Duplica']),
          h('button', { class: 'btn small danger', onclick: () => removePlay(p) }, ['Elimina']),
        ]),
      ]),
    ]);
    list.append(card);
  }
  updateLibCount(plays.length);
}

function updateLibCount(total: number): void {
  $('#lib-count').textContent = chosen.size ? `${chosen.size} selezionati` : `${total} schemi`;
  $<HTMLInputElement>('#lib-all').checked = total > 0 && chosen.size === total;
}

function openPlay(p: Play): void {
  upsertPlay(editor.play);
  editor.load(clone(p));
  upsertPlay(editor.play);
  renderPhases();
  library.close();
}

function duplicatePlay(p: Play): void {
  const copy = clone(p);
  copy.id = uid();
  copy.title = `${p.title} (copia)`;
  copy.createdAt = copy.updatedAt = Date.now();
  upsertPlay(copy);
  upsertPlay(editor.play); // keep the open play as "last opened"
  renderLibrary();
}

function removePlay(p: Play): void {
  if (!confirm(`Eliminare "${p.title}"? L'operazione non si può annullare.`)) return;
  deletePlay(p.id);
  chosen.delete(p.id);
  if (p.id === editor.play.id) {
    const next = loadPlays()[0] ?? newPlay();
    editor.load(next);
    upsertPlay(editor.play);
    renderPhases();
  }
  renderLibrary();
}

function createPlay(court: CourtType): void {
  upsertPlay(editor.play);
  const p = newPlay(court);
  editor.load(p);
  upsertPlay(p);
  renderPhases();
  library.close();
  const title = $<HTMLInputElement>('#play-title');
  title.focus();
  title.select();
}

function selectedPlays(): Play[] {
  const plays = loadPlays();
  return chosen.size ? plays.filter((p) => chosen.has(p.id)) : [];
}

$('#btn-library').onclick = openLibrary;
library.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => library.close();
library.addEventListener('click', (e) => {
  if (e.target === library) library.close(); // click on the backdrop
});
$('#new-half').onclick = () => createPlay('half');
$('#new-full').onclick = () => createPlay('full');
$('#lib-search').addEventListener('input', renderLibrary);
$('#lib-cat').addEventListener('change', renderLibrary);
$<HTMLInputElement>('#lib-all').addEventListener('change', (e) => {
  const on = (e.target as HTMLInputElement).checked;
  chosen.clear();
  if (on) for (const p of loadPlays()) chosen.add(p.id);
  renderLibrary();
});

$('#lib-playbook').onclick = () => {
  const plays = selectedPlays();
  if (!plays.length) return toast('Seleziona gli schemi da mettere nel playbook (casella a sinistra).', 3500);
  const title = prompt('Titolo del playbook', settings.teamName ? `Playbook ${settings.teamName}` : 'Playbook');
  if (title === null) return;
  busy(`Creo il playbook (${plays.length} schemi)…`, async () => {
    const { playbookPdf } = await import('./pdf');
    const blob = await playbookPdf(plays, settings, title || 'Playbook');
    await deliver(blob, safeFilename(title || 'Playbook') + '.pdf');
  });
};

$('#lib-export').onclick = () => {
  const plays = chosen.size ? selectedPlays() : loadPlays();
  const date = new Date().toISOString().slice(0, 10);
  download(exportJson(plays), `lavagna-basket_${plays.length}-schemi_${date}.json`);
  toast(`Esportati ${plays.length} schemi${chosen.size ? ' selezionati' : ''}.`);
};

$('#lib-import').onclick = () => $<HTMLInputElement>('#lib-file').click();
$<HTMLInputElement>('#lib-file').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const n = importJson(await file.text(), false);
    toast(`Importati ${n} schemi.`);
    renderLibrary();
  } catch (err) {
    toast('File non valido: ' + (err as Error).message, 4000);
  }
});

const teamInput = $<HTMLInputElement>('#set-team');
const styleSel = $<HTMLSelectElement>('#set-style');
teamInput.value = settings.teamName;
styleSel.value = settings.courtStyle;
teamInput.addEventListener('input', () => {
  settings = { ...settings, teamName: teamInput.value };
  saveSettings(settings);
});
styleSel.addEventListener('change', () => {
  settings = { ...settings, courtStyle: styleSel.value as AppSettings['courtStyle'] };
  saveSettings(settings);
  editor.render();
  renderPhases();
  renderLibrary();
});

// ------------------------------------------------------------------ mobile panel

function openPanel(): void {
  $('#panel').classList.add('open');
}
function closePanel(): void {
  $('#panel').classList.remove('open');
}
$('#btn-panel').onclick = () => $('#panel').classList.toggle('open');

// ------------------------------------------------------------------ keyboard

document.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z' && !typing) {
    e.preventDefault();
    if (e.shiftKey) editor.redo();
    else editor.undo();
  } else if (mod && e.key.toLowerCase() === 'y' && !typing) {
    e.preventDefault();
    editor.redo();
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && editor.selectedId) {
    e.preventDefault();
    editor.deleteSelected();
  } else if (e.key === 'Escape' && !typing) {
    if (editor.tool !== 'select') pickTool('select');
    else editor.select(null);
  }
});

window.addEventListener('beforeunload', () => upsertPlay(editor.play));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') upsertPlay(editor.play);
});

// ------------------------------------------------------------------ toast

let toastTimer = 0;
function toast(msg: string, ms = 2200): void {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('show', !!msg);
  clearTimeout(toastTimer);
  if (msg) toastTimer = window.setTimeout(() => el.classList.remove('show'), ms);
}

// ------------------------------------------------------------------ start

buildPanel();
renderToolbar();
renderPhases();
refreshUI();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
  // warm the cache so PDF export also works offline
  setTimeout(() => import('./pdf').then((m) => m.preloadFonts()).catch(() => {}), 3000);
}
