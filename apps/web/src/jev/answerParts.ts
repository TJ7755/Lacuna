export interface JevExpectedAnswerPart {
  start: number;
  end: number;
}

function groupedEnds(expected: string): Map<number, number> {
  const groups = new Map<number, number>();
  const dollars = [...expected.matchAll(/(?<!\\)\$\$?/g)];
  const next = new Map<string, number>();
  for (let index = dollars.length - 1; index >= 0; index--) {
    const token = dollars[index];
    const end = next.get(token[0]);
    if (end !== undefined) groups.set(token.index, end + token[0].length - 1);
    next.set(token[0], token.index);
  }
  const brackets: { close: string; start: number }[] = [];
  for (let index = 0; index < expected.length; index++) {
    const character = expected[index];
    // Only a paired maths delimiter shields punctuation and brackets.
    const end = groups.get(index);
    if (end !== undefined) {
      index = end;
      continue;
    }
    if (character === '(' || character === '{' || character === '[') {
      brackets.push({ close: { '(': ')', '{': '}', '[': ']' }[character], start: index });
    } else if (')}]'.includes(character)) {
      if (brackets.at(-1)?.close === character) {
        groups.set(brackets.pop()!.start, index);
      } else {
        // A mismatched closer invalidates the still-open nesting, not later groups.
        brackets.length = 0;
      }
    }
  }
  return groups;
}

/** Offsets refer to the original string, using the same UTF-16 indices as String.slice. */
export function splitJevExpectedAnswer(expected: string): JevExpectedAnswerPart[] {
  const separators: JevExpectedAnswerPart[] = [];
  const conjunctions: JevExpectedAnswerPart[] = [];
  const groups = groupedEnds(expected);
  for (let index = 0; index < expected.length; index++) {
    const character = expected[index];
    const end = groups.get(index);
    if (end !== undefined) {
      index = end;
      continue;
    }
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
