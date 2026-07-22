/** The symbol set under test.
 *
 *  Scoped to 11+ rather than GCSE: nineteen classes, no roots, no `pi`, no trigonometry.
 *  Arc 11 §11.9 parks the wider key-stage question, and a template recogniser's error
 *  rate grows with the class count, so a bloated set would depress the measured accuracy
 *  for symbols the target user never writes.
 *
 *  `*` and `/` stand in for the multiplication and division signs a child actually
 *  writes; mapping the drawn glyph onto the character the expression parser expects is
 *  the point of `output`. */

export interface SymbolSpec {
  /** Class label used by the recogniser and the confusion matrix. */
  label: string;
  /** What this symbol contributes to the parsed expression string. */
  output: string;
  /** Shown during template calibration. */
  prompt: string;
}

export const SYMBOLS: readonly SymbolSpec[] = [
  ...Array.from({ length: 10 }, (_, digit) => ({
    label: String(digit),
    output: String(digit),
    prompt: String(digit),
  })),
  { label: 'x', output: 'x', prompt: 'x (the letter)' },
  { label: 'y', output: 'y', prompt: 'y (the letter)' },
  { label: 'plus', output: '+', prompt: '+' },
  { label: 'minus', output: '-', prompt: '− (minus)' },
  { label: 'times', output: '*', prompt: '× (times)' },
  { label: 'divide', output: '/', prompt: '÷ (divide)' },
  { label: 'equals', output: '=', prompt: '=' },
  { label: 'lparen', output: '(', prompt: '(' },
  { label: 'rparen', output: ')', prompt: ')' },
  { label: 'point', output: '.', prompt: '. (decimal point)' },
];

/** Target expressions for the three-arm timing comparison.
 *
 *  Chosen so each arm is exercised on the same difficulty ladder: a bare number, an
 *  expression needing a symbol that is awkward on a keyboard, and one needing the
 *  superscript relation that motivates the whole prototype. */
export const TARGET_EXPRESSIONS: readonly string[] = [
  '42',
  '3+7=10',
  '2x+6=14',
  '(3+4)*2',
  '12/4=3',
  'x^2+3',
  '5.5-1.25',
  'y=2x^2',
];

/** Keys on the palette arm of the trial, laid out as a five-column keypad: digits in
 *  calculator order on the left, operators down the right, variables last.
 *
 *  Canonical here rather than in the harness because the first session shipped a palette
 *  with no `x` or `y`, making three of the eight targets unenterable and invalidating
 *  those trials. `palette covers every target` below is the guard against a repeat. */
export const PALETTE_KEYS: readonly string[] = [
  '7', '8', '9', '+', '(',
  '4', '5', '6', '-', ')',
  '1', '2', '3', '*', '^',
  '0', '.', '=', '/', 'x',
  'y',
];

const byLabel = new Map(SYMBOLS.map((symbol) => [symbol.label, symbol]));

/** What a recognised label contributes to the expression string. Unknown labels
 *  contribute nothing rather than throwing: the layout stage must survive a recogniser
 *  that has been given templates this table does not know about. */
export const labelToOutput = (label: string): string => byLabel.get(label)?.output ?? '';

/** Map a sequence of recognised labels onto an expression string. Layout (stage 4)
 *  handles superscripts separately; this is the flat case. */
export const labelsToExpression = (labels: readonly string[]): string =>
  labels.map((label) => byLabel.get(label)?.output ?? '').join('');
