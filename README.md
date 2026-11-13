# basketball-board

Lavagna digitale per disegnare schemi ed esercizi di basket e produrre PDF da condividere con la squadra.

**App online:** https://umbertocirilli.github.io/basketball-board/

## Cosa fa

- **Campo FIBA** a metà campo o campo intero (misure ufficiali: area 4,90 × 5,80 m, linea da 3 a 6,75 m).
- **Elementi**: attaccanti (1–5, numerazione automatica), difensori (X1–X5), palla, coni, allenatore, testo libero.
  I pulsanti **5 att.** e **5 dif.** mettono subito in campo i quintetti.
- **Movimenti** con la notazione classica: taglio (freccia continua), passaggio (tratteggiata), palleggio
  (zig-zag), blocco (T), tiro (doppia linea), consegnato/DHO (||), penna libera.
  Tutte le linee si possono curvare trascinando il punto centrale.
- **Fasi**: ogni schema è una sequenza di fasi. **+ Fase** crea la fase successiva spostando i giocatori
  alla fine dei loro movimenti; la palla segue passaggi e consegnati. Le posizioni della fase precedente
  si vedono in trasparenza.
- **Alternative (letture)**: da una fase della linea principale, **+ Alternativa** crea un percorso
  diverso (es. "Se X2 anticipa") con le sue fasi, numerate 3A, 4A… Nel PDF la fase di partenza rimanda
  alle alternative, che hanno poi ciascuna la sua sezione.
- **Note** per ogni fase, più titolo, categoria, obiettivo e descrizione dello schema.
- **Libreria**: gli schemi si salvano automaticamente nel browser. Ricerca, filtri per categoria,
  duplica/elimina. **Esporta file / Importa file** (JSON) per fare backup o passare gli schemi da un
  dispositivo all'altro.
- **PDF**: un PDF per schema (diagramma di ogni fase con la sua nota) oppure un **playbook** con più
  schemi, copertina e indice cliccabile. Anche l'esportazione di una singola fase come **immagine PNG**.
  Su smartphone si apre direttamente la condivisione (WhatsApp, email…).
- Funziona **offline** e si può installare sul telefono ("Aggiungi a schermata Home").

> Gli schemi restano sul dispositivo (localStorage del browser): non vengono caricati su GitHub né su
> nessun server. Usa *Esporta file* per tenerne una copia.

## Sviluppo

Requisiti: Node.js 20+.

```bash
npm install
npm run dev      # http://localhost:5173 (anche dal telefono sulla stessa rete Wi-Fi)
npm run build    # type-check + build in dist/
```

Ogni push su `main` pubblica l'app su GitHub Pages tramite `.github/workflows/deploy.yml`.

### Struttura

| File | Ruolo |
| --- | --- |
| `src/types.ts` | Modello dati (Play → Phase → Token / Line) |
| `src/court.ts` | Disegno del campo FIBA in SVG (1 unità = 10 cm) |
| `src/render.ts` | Disegno di giocatori e linee (riusato da editor, miniature e PDF) |
| `src/geometry.ts` | Curve, zig-zag, accorciamento linee, hit-test |
| `src/editor.ts` | Interazione sulla lavagna (strumenti, trascinamento, undo/redo, fasi) |
| `src/model.ts` | Creazione schemi, quintetti, logica "fase successiva", conversione campo |
| `src/store.ts` | Salvataggio locale, import/export JSON |
| `src/pdf.ts` · `src/raster.ts` | Export PDF (jsPDF) e PNG |
| `src/main.ts` | Interfaccia: toolbar, pannello, fasi, libreria |
