import { addFive, newPlay, nextPhaseFrom, uid } from './model';
import type { Play } from './types';

/** Example play shown on first launch. */
export function samplePlay(): Play {
  const play = newPlay('half', 'Attacco');
  play.title = 'Esempio · Pick and roll centrale';
  play.objective = 'Creare un vantaggio con il blocco sulla palla e il taglio a canestro del bloccante.';
  play.description =
    'Schema di esempio: puoi modificarlo o eliminarlo dalla Libreria. Ogni fase mostra i movimenti; con "+ Fase" i giocatori si spostano automaticamente alla fine delle loro frecce.';
  const ph = play.phases[0];
  addFive(ph, 'half', 'offense');
  const t = (label: string) => ph.tokens.find((x) => x.label === label)!;
  ph.note = '4 sale a portare il blocco per 1. 5 si apre sul lato debole.';
  ph.lines.push(
    { id: uid(), kind: 'screen', from: t('4').id, points: [{ x: t('4').x, y: t('4').y }, { x: 84, y: 85 }], ctrl: { x: 96, y: 75 } },
    { id: uid(), kind: 'cut', from: t('5').id, points: [{ x: t('5').x, y: t('5').y }, { x: 30, y: 14 }] },
  );

  const ph2 = nextPhaseFrom(ph);
  const t2 = (label: string) => ph2.tokens.find((x) => x.label === label)!;
  ph2.note = '1 attacca il blocco palleggiando verso sinistra. 4 rolla a canestro.';
  ph2.lines.push(
    { id: uid(), kind: 'dribble', from: t2('1').id, points: [{ x: t2('1').x, y: t2('1').y }, { x: 50, y: 70 }], ctrl: { x: 66, y: 72 } },
    { id: uid(), kind: 'cut', from: t2('4').id, points: [{ x: t2('4').x, y: t2('4').y }, { x: 84, y: 42 }], ctrl: { x: 94, y: 62 } },
  );

  const ph3 = nextPhaseFrom(ph2);
  const t3 = (label: string) => ph3.tokens.find((x) => x.label === label)!;
  ph3.note = 'Passaggio a 4 che rolla; in alternativa scarico a 3 o a 2 sul perimetro.';
  ph3.lines.push(
    { id: uid(), kind: 'pass', from: t3('1').id, to: t3('4').id, points: [{ x: t3('1').x, y: t3('1').y }, { x: t3('4').x, y: t3('4').y }] },
    { id: uid(), kind: 'shot', from: t3('4').id, points: [{ x: t3('4').x, y: t3('4').y }, { x: 77.5, y: 20.5 }] },
  );
  play.phases.push(ph2, ph3);
  return play;
}
