import { jsPDF } from 'jspdf';
import { courtLabel } from './model';
import { phaseToPng } from './raster';
import type { AppSettings } from './store';
import type { Play } from './types';

const PAGE_W = 210;
const PAGE_H = 297;
const M = 15; // margin
const CONTENT_W = PAGE_W - 2 * M;
const BOTTOM = PAGE_H - 16; // keep room for the footer
const ACCENT: [number, number, number] = [29, 58, 110];
const GREY: [number, number, number] = [95, 102, 112];

const lh = (pt: number) => pt * 0.3528 * 1.3; // line height in mm

class Writer {
  y = M;
  constructor(readonly doc: jsPDF) {}

  ensure(h: number): void {
    if (this.y + h > BOTTOM) {
      this.doc.addPage();
      this.y = M;
    }
  }

  /** Writes wrapped text, breaking pages as needed. */
  paragraph(text: string, size: number, opts: { bold?: boolean; color?: [number, number, number]; x?: number; width?: number } = {}): void {
    const { doc } = this;
    const x = opts.x ?? M;
    const width = opts.width ?? CONTENT_W;
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...(opts.color ?? [30, 30, 30]));
    const lines = doc.splitTextToSize(text, width) as string[];
    for (const line of lines) {
      this.ensure(lh(size));
      doc.text(line, x, this.y + size * 0.3528);
      this.y += lh(size);
    }
  }
}

async function writePlay(w: Writer, play: Play, settings: AppSettings): Promise<void> {
  const { doc } = w;
  // title band
  doc.setFillColor(...ACCENT);
  doc.rect(M, w.y, CONTENT_W, 1.2, 'F');
  w.y += 4;
  w.paragraph(play.title || 'Senza titolo', 18, { bold: true, color: ACCENT });
  const meta = [play.category, courtLabel(play), `${play.phases.length} ${play.phases.length === 1 ? 'fase' : 'fasi'}`]
    .filter(Boolean)
    .join('  ·  ');
  w.paragraph(meta, 9.5, { color: GREY });
  w.y += 3;

  if (play.objective.trim()) {
    w.paragraph('Obiettivo', 10.5, { bold: true, color: ACCENT });
    w.paragraph(play.objective.trim(), 10.5);
    w.y += 2;
  }
  if (play.description.trim()) {
    w.paragraph('Descrizione', 10.5, { bold: true, color: ACCENT });
    w.paragraph(play.description.trim(), 10.5);
    w.y += 2;
  }
  w.y += 2;

  const cols = play.court === 'half' ? 2 : 1;
  const gap = 8;
  const colW = cols === 2 ? (CONTENT_W - gap) / 2 : CONTENT_W * 0.86;
  const offsetX = cols === 2 ? M : M + (CONTENT_W - colW) / 2;
  const noteSize = 9.5;

  for (let i = 0; i < play.phases.length; i += cols) {
    const row = play.phases.slice(i, i + cols);
    const images = await Promise.all(row.map((ph) => phaseToPng(play, ph, settings.courtStyle, cols === 2 ? 1100 : 1700)));
    const imgH = Math.max(...images.map((im) => (colW * im.h) / im.w));
    doc.setFontSize(noteSize);
    const notes = row.map((ph) => (ph.note.trim() ? (doc.splitTextToSize(ph.note.trim(), colW) as string[]) : []));
    const noteH = Math.max(...notes.map((n) => n.length)) * lh(noteSize);
    const header = lh(10.5) + 1;
    // a row (title + diagram + notes) stays together when it fits on a page
    w.ensure(Math.min(header + imgH + noteH + 2, BOTTOM - M));

    const top = w.y;
    row.forEach((_, j) => {
      const x = offsetX + j * (colW + gap);
      let y = top;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...ACCENT);
      doc.text(`Fase ${i + j + 1}`, x, y + 10.5 * 0.3528);
      y += header;
      const im = images[j];
      const h = (colW * im.h) / im.w;
      doc.addImage(im.url, 'PNG', x, y, colW, h, undefined, 'FAST');
      doc.setDrawColor(210, 214, 220);
      doc.setLineWidth(0.2);
      doc.rect(x, y, colW, h);
      y += h + 2;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(noteSize);
      doc.setTextColor(30, 30, 30);
      for (const line of notes[j]) {
        doc.text(line, x, y + noteSize * 0.3528);
        y += lh(noteSize);
      }
    });
    w.y = top + header + imgH + 2 + noteH + 6;
  }
}

function footers(doc: jsPDF, settings: AppSettings, skipFirst: boolean): void {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    if (skipFirst && i === 1) continue;
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.setDrawColor(220, 223, 228);
    doc.setLineWidth(0.2);
    doc.line(M, PAGE_H - 11, PAGE_W - M, PAGE_H - 11);
    if (settings.teamName) doc.text(settings.teamName, M, PAGE_H - 7);
    doc.text(`Pagina ${i} di ${n}`, PAGE_W - M, PAGE_H - 7, { align: 'right' });
  }
}

export async function playPdf(play: Play, settings: AppSettings): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: play.title, creator: 'Basketball Board' });
  await writePlay(new Writer(doc), play, settings);
  footers(doc, settings, false);
  return doc.output('blob');
}

const INDEX_ROWS = 34;

export async function playbookPdf(plays: Play[], settings: AppSettings, title: string): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title, creator: 'Basketball Board' });

  // cover
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, PAGE_W, 110, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(34);
  doc.text(doc.splitTextToSize(title, CONTENT_W) as string[], M, 62);
  if (settings.teamName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(16);
    doc.text(settings.teamName, M, 92);
  }
  doc.setTextColor(...GREY);
  doc.setFontSize(11);
  doc.text(`${plays.length} ${plays.length === 1 ? 'schema' : 'schemi'}  ·  ${new Date().toLocaleDateString('it-IT')}`, M, 128);

  // reserve index pages, filled in once page numbers are known
  const indexPages = Math.max(1, Math.ceil(plays.length / INDEX_ROWS));
  for (let i = 0; i < indexPages; i++) doc.addPage();

  const starts: number[] = [];
  for (const play of plays) {
    doc.addPage();
    starts.push(doc.getNumberOfPages());
    await writePlay(new Writer(doc), play, settings);
  }

  plays.forEach((play, i) => {
    const page = 2 + Math.floor(i / INDEX_ROWS);
    doc.setPage(page);
    let y = M + 4;
    if (i % INDEX_ROWS === 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(...ACCENT);
      doc.text('Indice', M, y + 6);
    }
    y = M + 20 + (i % INDEX_ROWS) * 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    const label = `${i + 1}.  ${play.title || 'Senza titolo'}`;
    doc.text(doc.splitTextToSize(label, 110)[0] as string, M, y);
    doc.setTextColor(...GREY);
    doc.setFontSize(9);
    doc.text(play.category || '', M + 118, y);
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text(String(starts[i]), PAGE_W - M, y, { align: 'right' });
    doc.link(M, y - 4.5, CONTENT_W, 6.5, { pageNumber: starts[i] });
  });

  footers(doc, settings, true);
  return doc.output('blob');
}
