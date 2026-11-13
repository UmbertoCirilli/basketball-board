import type { CourtStyle } from './court';
import { phaseSvgString } from './render';
import type { Phase, Play } from './types';

/** Renders a phase to a PNG data URL (`widthPx` wide). */
export async function phaseToPng(play: Play, phase: Phase, style: CourtStyle, widthPx: number): Promise<{ url: string; w: number; h: number }> {
  const svg = phaseSvgString(play, phase, style, widthPx);
  const img = new Image();
  const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Impossibile disegnare la fase.'));
    img.src = src;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return { url: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
}

export function dataUrlToBlob(url: string): Blob {
  const [head, b64] = url.split(',');
  const mime = head.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
