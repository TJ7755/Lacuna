export interface JevExpectedAnswerPart {
  start: number;
  end: number;
}

/** Offsets refer to the original string, using the same UTF-16 indices as String.slice. */
export function splitJevExpectedAnswer(expected: string): JevExpectedAnswerPart[] {
  const separators: JevExpectedAnswerPart[] = [];
  const conjunctions: JevExpectedAnswerPart[] = [];
  const brackets: string[] = [];
  let maths: '$' | '$$' | null = null;
  for (let index = 0; index < expected.length; index++) {
    const character = expected[index];
    if (character === '$' && expected[index - 1] !== '\\') {
      const delimiter = expected.startsWith('$$', index) ? '$$' : '$';
      if (maths === null) maths = delimiter;
      else if (maths === delimiter) maths = null;
      index += delimiter.length - 1;
      continue;
    }
    if (maths !== null) continue;
    if (character === '(' || character === '{' || character === '[') {
      brackets.push({ '(': ')', '{': '}', '[': ']' }[character]);
      continue;
    }
    if (brackets.length && character === brackets[brackets.length - 1]) {
      brackets.pop();
      continue;
    }
    if (brackets.length) continue;
    if (',;\n\r•'.includes(character)) {
      separators.push({ start: index, end: index + 1 });
      continue;
    }
    if (/[\t ]/.test(character) && !/[\t ]/.test(expected[index - 1] ?? '')) {
      const match = /^[\t ]+(?:and|or)[\t ]+/i.exec(expected.slice(index));
      if (match) {
        conjunctions.push({ start: index, end: index + match[0].length });
        index += match[0].length - 1;
      }
    }
  }
  // Only the final item's conjunction is a separator; earlier compound phrases stay together.
  const last = conjunctions.at(-1);
  if (last && last.start >= (separators.at(-1)?.end ?? 0)) separators.push(last);
  separators.sort((left, right) => left.start - right.start);
  const parts: JevExpectedAnswerPart[] = [];
  const add = (from: number, to: number) => {
    let start = from;
    let end = to;
    while (start < end && /\s/.test(expected[start])) start++;
    const bullet = /^(?:[-+*•–]|\d+[.)])[\t ]+/.exec(expected.slice(start, end));
    if (bullet) start += bullet[0].length;
    while (start < end && /\s/.test(expected[start])) start++;
    while (end > start && /[\s.,;:!?]/.test(expected[end - 1])) end--;
    if (start < end) parts.push({ start, end });
  };
  let start = 0;
  for (const separator of separators) {
    add(start, separator.start);
    start = separator.end;
  }
  add(start, expected.length);
  return parts;
}
