# CLAUDE.md

Lavagna digitale per schemi/esercizi di basket (allenatore → PDF per la squadra). UI in **italiano**.

## Comandi

- `npm run dev` — dev server Vite su :5173
- `npm run build` — `tsc --noEmit` + build in `dist/` (deve passare prima di ogni commit)
- Deploy: push su `main` → GitHub Actions → GitHub Pages (`base: './'` in `vite.config.ts`)

## Architettura

Vanilla TypeScript + SVG, nessun framework. Unica dipendenza runtime: `jspdf`.

- Coordinate in unità campo: **1 unità = 10 cm**. Metà campo 150×140 con canestro in alto (y=0 è la linea
  di fondo); campo intero 280×150 con canestri a sinistra/destra. Margine fuori campo `MARGIN` = 12.
- `render.ts#renderPhase` è l'unico renderer: lo usano editor (con `interactive: true`), miniature e PDF/PNG
  (`raster.ts` rasterizza l'SVG su canvas, `pdf.ts` impagina con jsPDF in A4).
- Le linee hanno `from`/`to` (id token): l'estremità segue il giocatore. `ctrl` = punto di controllo della
  curva quadratica (undefined = retta).
- `model.ts#nextPhaseFrom`: tagli/palleggi/blocchi spostano il giocatore alla fine della linea;
  passaggi/consegnati spostano la palla (`hasBall`) al ricevente.
- Undo/redo: snapshot JSON dell'intero `Play` in `Editor.commit()`.
- Persistenza: `localStorage` (`bb.plays.v1`, `bb.settings.v1`). Cambiare formato → nuova chiave o migrazione.

## Convenzioni

- Testi UI e PDF in italiano; jsPDF usa Helvetica standard (WinAnsi): niente emoji nel PDF.
- Mobile-first per il touch: pointer events + `touch-action: none` sulla lavagna; layout mobile sotto 860px.
- Commit con l'identità personale configurata nel repo (non quella aziendale).
