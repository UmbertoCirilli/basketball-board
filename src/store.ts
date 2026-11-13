import type { CourtStyle } from './court';
import { uid } from './model';
import type { Play } from './types';

const PLAYS_KEY = 'bb.plays.v1';
const SETTINGS_KEY = 'bb.settings.v1';
const LAST_KEY = 'bb.lastPlay';

export interface AppSettings {
  teamName: string;
  courtStyle: CourtStyle;
}

const DEFAULT_SETTINGS: AppSettings = { teamName: '', courtStyle: 'wood' };

export function loadPlays(): Play[] {
  try {
    const raw = localStorage.getItem(PLAYS_KEY);
    const list = raw ? (JSON.parse(raw) as Play[]) : [];
    return Array.isArray(list) ? list.filter(isPlay) : [];
  } catch {
    return [];
  }
}

export function savePlays(plays: Play[]): void {
  localStorage.setItem(PLAYS_KEY, JSON.stringify(plays));
}

export function upsertPlay(play: Play): void {
  const plays = loadPlays();
  const i = plays.findIndex((p) => p.id === play.id);
  if (i >= 0) plays[i] = play;
  else plays.unshift(play);
  savePlays(plays);
  localStorage.setItem(LAST_KEY, play.id);
}

export function deletePlay(id: string): void {
  savePlays(loadPlays().filter((p) => p.id !== id));
}

export function lastPlayId(): string | null {
  return localStorage.getItem(LAST_KEY);
}

export function loadSettings(): AppSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// ------------------------------------------------------------ import / export

interface ExportFile {
  app: 'basketball-board';
  version: 1;
  exportedAt: string;
  plays: Play[];
}

export function exportJson(plays: Play[]): Blob {
  const data: ExportFile = { app: 'basketball-board', version: 1, exportedAt: new Date().toISOString(), plays };
  return new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
}

/**
 * Imports plays from a file. Plays with an id that already exists are kept
 * as copies unless `overwrite` is true. Returns the number of plays imported.
 */
export function importJson(text: string, overwrite: boolean): number {
  const data = JSON.parse(text) as Partial<ExportFile> | Play;
  const incoming: Play[] = 'plays' in data && Array.isArray(data.plays) ? data.plays : isPlay(data) ? [data as Play] : [];
  const valid = incoming.filter(isPlay);
  if (!valid.length) throw new Error('Nessuno schema valido nel file.');
  const plays = loadPlays();
  for (const p of valid) {
    const i = plays.findIndex((x) => x.id === p.id);
    if (i >= 0 && overwrite) plays[i] = p;
    else if (i >= 0) plays.unshift({ ...p, id: uid(), title: `${p.title} (importato)` });
    else plays.unshift(p);
  }
  savePlays(plays);
  return valid.length;
}

function isPlay(p: unknown): boolean {
  const x = p as Play;
  return !!x && typeof x.id === 'string' && Array.isArray(x.phases) && x.phases.length > 0 && (x.court === 'half' || x.court === 'full');
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeFilename(name: string): string {
  return (name || 'schema').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 60) || 'schema';
}
