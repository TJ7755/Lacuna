/** Canvas harness: calibrate a per-user template set, then recognise single symbols.
 *
 *  Deliberately limited to stages 1 and 3 of the pipeline (see README). Stroke grouping
 *  and layout parsing are not built, so this recognises one symbol at a time — enough to
 *  answer whether per-user templates are viable before the harder stages are worth
 *  writing. */

import { attachCapture } from './canvas';
import { makeTemplate, recognise, type Template } from './dollarP';
import { SYMBOLS } from './symbols';
import type { Point } from './strokes';

const STORAGE_KEY = 'handwriting-maths.templates.v1';

const element = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element: ${id}`);
  return found as T;
};

const pad = element<HTMLCanvasElement>('pad');
const promptText = element('prompt');
const status = element('status');
const ranking = element<HTMLOListElement>('ranking');
const acceptButton = element<HTMLButtonElement>('accept');

const capture = attachCapture(pad);

const load = (): Template[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as Template[];
  } catch {
    // A corrupt store is not worth recovering in a prototype; start over rather than
    // failing to load the page.
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
};

let templates = load();
/** Index into SYMBOLS while calibrating; null when recognising. */
let calibrating: number | null = null;

const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));

const render = () => {
  acceptButton.hidden = calibrating === null;
  if (calibrating !== null) {
    const symbol = SYMBOLS[calibrating];
    promptText.textContent = `Write:  ${symbol.prompt}`;
    status.textContent = `Template ${calibrating + 1} of ${SYMBOLS.length}`;
    ranking.replaceChildren();
    return;
  }
  promptText.textContent = 'Write a symbol';
  status.textContent = templates.length
    ? `${templates.length} template${templates.length === 1 ? '' : 's'} stored`
    : 'No templates yet — calibrate first.';
};

const showRanking = (points: Point[]) => {
  const matches = recognise(points, templates);
  ranking.replaceChildren(
    ...matches.slice(0, 5).map((match) => {
      const item = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = match.label;
      const score = document.createElement('span');
      score.textContent = `${match.score.toFixed(3)}  (d ${match.distance.toFixed(3)})`;
      item.append(label, score);
      return item;
    }),
  );
};

capture.onStrokeEnd(() => {
  if (calibrating !== null || templates.length === 0) return;
  // Multi-stroke symbols mean we cannot recognise on pen-up alone; re-ranking after
  // every stroke shows the candidate settling as the symbol is completed, which is
  // itself informative about where a stroke-grouping heuristic would have to cut.
  showRanking(capture.points());
});

element('clear').addEventListener('click', () => {
  capture.clear();
  ranking.replaceChildren();
});

element('calibrate').addEventListener('click', () => {
  calibrating = 0;
  capture.clear();
  render();
});

acceptButton.addEventListener('click', () => {
  if (calibrating === null) return;
  const points = capture.points();
  if (points.length === 0) {
    status.textContent = 'Nothing drawn yet.';
    return;
  }
  const symbol = SYMBOLS[calibrating];
  templates = [
    ...templates.filter((template) => template.label !== symbol.label),
    makeTemplate(symbol.label, points, 'user'),
  ];
  save();
  capture.clear();
  calibrating = calibrating + 1 < SYMBOLS.length ? calibrating + 1 : null;
  render();
});

element('reset').addEventListener('click', () => {
  templates = [];
  localStorage.removeItem(STORAGE_KEY);
  capture.clear();
  calibrating = null;
  render();
});

render();
