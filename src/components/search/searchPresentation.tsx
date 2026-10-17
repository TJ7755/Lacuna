import type { HelpTopic } from '../../pages/help/helpTopics';
import {
  plainPreview,
  cardEditPath,
  questionEditPath,
  type CourseContentHit,
  type ScopedSearchResult,
} from '../../db/search';

export type SearchHit = CourseContentHit | ScopedSearchResult | { kind: 'help'; topic: HelpTopic };

export function hitPath(hit: SearchHit): string {
  switch (hit.kind) {
    case 'help':
      return `/help#${hit.topic.id}`;
    case 'card':
      return cardEditPath(hit.card);
    case 'question':
      return questionEditPath(hit.question);
    case 'course':
      return `/course/${hit.course.id}`;
    case 'lesson':
    case 'note':
      return `/course/${hit.course.id}/lesson/${hit.lesson.id}`;
  }
}

export function hitKey(hit: SearchHit): string {
  if (hit.kind === 'help') return `help-${hit.topic.id}`;
  const id =
    hit.kind === 'card'
      ? hit.card.id
      : hit.kind === 'question'
        ? hit.question.id
        : hit.kind === 'course'
          ? hit.course.id
          : hit.kind === 'lesson'
            ? hit.lesson.id
            : hit.note.id;
  return `${hit.kind}-${id}`;
}

/** Keep highlight matching aligned with the offline search's accent folding. */
function folded(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function matchRanges(text: string, query: string): [number, number][] {
  const needle = folded(query.trim());
  if (!needle) return [];
  let haystack = '';
  const offsets: number[] = [];
  let offset = 0;
  for (const character of text) {
    const value = folded(character);
    for (let i = 0; i < value.length; i++) offsets.push(offset);
    haystack += value;
    offset += character.length;
  }
  offsets.push(text.length);
  const ranges: [number, number][] = [];
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    ranges.push([offsets[index]!, offsets[index + needle.length]!]);
    index = haystack.indexOf(needle, index + needle.length);
  }
  return ranges;
}

export function hasTextMatch(text: string, query: string): boolean {
  return query.trim() !== '' && folded(text).includes(folded(query.trim()));
}

/** Centre a bounded plain-text excerpt on its first match, including long answers. */
export function matchPreview(text: string, query: string, max = 140): string {
  const plain = plainPreview(text, Infinity);
  if (plain.length <= max) return plain;
  const match = matchRanges(plain, query)[0];
  const start = match ? Math.max(0, match[0] - Math.floor(max / 3)) : 0;
  const end = Math.min(plain.length, Math.max(start + max, match?.[1] ?? 0));
  return `${start > 0 ? '…' : ''}${plain.slice(start, end)}${end < plain.length ? '…' : ''}`;
}

export function HighlightedText({ text, query }: { text: string; query: string }) {
  const ranges = matchRanges(text, query);
  if (!ranges.length) return <>{text}</>;
  const parts = [];
  let end = 0;
  for (const [start, next] of ranges) {
    parts.push(<span key={`text-${start}`}>{text.slice(end, start)}</span>);
    // No padding: a partly matched word must remain joined up.
    parts.push(
      <mark key={`match-${start}`} className="rounded-sm bg-accent/15 text-accent-ink">
        {text.slice(start, next)}
      </mark>,
    );
    end = next;
  }
  parts.push(<span key="tail">{text.slice(end)}</span>);
  return <>{parts}</>;
}
