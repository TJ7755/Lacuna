// Plain, offline search over already-loaded Course/Lesson content and cards.
// It needs no index server and is trivially testable. Card matching is a
// case- and diacritic-insensitive substring over the card front/back, its
// Course or Lesson context, and the card's tags.

import type { Card, Course, Lesson, Note, Occlusion } from '@lacuna/core/db/types';
import { isLeech } from '@lacuna/core/fsrs/leech';
import type { QuestionDefinition } from '@lacuna/core/questions/types';

export interface ScopedCardSearchResult {
  kind: 'card';
  card: Card;
  course: Course;
  lesson?: Lesson;
  /** User-facing ownership label: Lesson name for lesson cards, Course name for bank cards. */
  contextName: string;
}

export interface ScopedQuestionSearchResult {
  kind: 'question';
  question: QuestionDefinition;
  course: Course;
  lesson?: Lesson;
  /** User-facing ownership label: primary Lesson name, or Course name when unassigned. */
  contextName: string;
}

export type ScopedSearchResult = ScopedCardSearchResult | ScopedQuestionSearchResult;

export interface SearchScope {
  cards: Card[];
  courses: Course[];
  lessons: Lesson[];
  /** Optional authored answers behind generated image-occlusion cards. */
  occlusions?: Occlusion[];
}

export interface QuestionSearchScope {
  questions: QuestionDefinition[];
  courses: Course[];
  lessons: Lesson[];
}

/** A course/lesson/note match, ranked alongside card results in the unified search UI. */
export type CourseContentHit =
  | { kind: 'course'; course: Course }
  | { kind: 'lesson'; lesson: Lesson; course: Course }
  | { kind: 'note'; note: Note; lesson: Lesson; course: Course };

/** Structured, content-independent filters that turn search into deck management. */
export type CardFilter = 'due' | 'new' | 'leech' | 'flagged' | 'suspended';

export interface SearchOptions {
  /** All listed filters must match (logical AND). */
  filters?: CardFilter[];
  /** Reference time for the "due" filter; defaults to now. */
  now?: number;
  /** When true, the query string itself is parsed for inline operators (tag:, deck:, is:). */
  parseQuery?: boolean;
}

export interface SessionCardPoolOptions {
  /** Exact tag match, compared case- and diacritic-insensitively. */
  tag?: string | null;
  /** A card must match every selected filter (logical AND). */
  filters?: readonly CardFilter[];
  /** Reference time for the "due" filter; defaults to now. */
  now?: number;
  /** The owning Course's leech threshold, so the leech filter agrees with its settings. */
  leechThreshold?: number;
}

interface ParsedQuery {
  text: string;
  tags: string[];
  decks: string[];
  filters: CardFilter[];
}

/**
 * Extract inline search operators from a query string.
 * Supported operators:
 *   tag:foo       -> cards tagged "foo"
 *   deck:bar      -> cards in deck named "bar" (global search)
 *   is:due|new|leech|flagged|suspended -> structured filter
 * The remaining text is treated as a plain substring query.
 */
function parseAdvancedQuery(query: string): ParsedQuery {
  const tags: string[] = [];
  const decks: string[] = [];
  const filters: CardFilter[] = [];
  const textParts: string[] = [];

  // A quoted value belongs to its operator; apostrophes inside words stay literal.
  const tokens = query.match(/(?:[a-z]+:)?(?:"[^"]*"|'[^']*')|[^\s]+/gi) ?? [];
  const unquote = (value: string) => (/^(".*"|'.*')$/s.test(value) ? value.slice(1, -1) : value);
  for (const token of tokens) {
    const clean = unquote(token).trim();
    if (!clean) continue;

    const tagMatch = clean.match(/^tag:(.+)$/i);
    if (tagMatch) {
      tags.push(normalise(unquote(tagMatch[1]!).trim()));
      continue;
    }

    const deckMatch = clean.match(/^deck:(.+)$/i);
    if (deckMatch) {
      decks.push(normalise(unquote(deckMatch[1]!).trim()));
      continue;
    }

    const isMatch = clean.match(/^is:(.+)$/i);
    if (isMatch) {
      const filter = isMatch[1]!.toLowerCase();
      if (
        filter === 'due' ||
        filter === 'new' ||
        filter === 'leech' ||
        filter === 'flagged' ||
        filter === 'suspended'
      ) {
        filters.push(filter as CardFilter);
        continue;
      }
    }

    textParts.push(clean);
  }

  return { text: textParts.join(' '), tags, decks, filters };
}

/** Whether a single card satisfies one structured filter. */
function matchesFilter(
  card: Card,
  filter: CardFilter,
  now: number,
  leechThreshold?: number,
): boolean {
  switch (filter) {
    case 'due':
      return card.due !== null && card.due <= now;
    case 'new':
      return card.lastReviewed === null;
    case 'leech':
      return isLeech(card, leechThreshold);
    case 'flagged':
      return card.flagged === true;
    case 'suspended':
      return card.suspended === true;
  }
}

/** Lower-case and strip accents so "résumé" matches "resume". */
function normalise(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Build the card scope requested by a filtered Learn session. A tag narrows the
 * scope, and every structured filter must also match (logical AND).
 *
 * This function deliberately does not apply generic study availability. In
 * particular, `suspended` must be able to select suspended cards so the caller
 * can distinguish an empty filter result from a matching but unavailable pool.
 */
export function filterSessionCardPool(cards: Card[], options: SessionCardPoolOptions = {}): Card[] {
  const now = options.now ?? Date.now();
  const filters = options.filters ?? [];
  const tag = options.tag?.trim() ? normalise(options.tag.trim()) : null;

  return cards.filter((card) => {
    if (tag) {
      const cardTags = (card.tags ?? []).map(normalise);
      if (!cardTags.includes(tag)) return false;
    }
    return filters.every((filter) => matchesFilter(card, filter, now, options.leechThreshold));
  });
}

const FRONT_ORDER = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const EMBEDDED_IMAGE_URL = String.raw`data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+`;
const HTML_ATTRIBUTE = String.raw`[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>\x60=]+))?`;
const EMBEDDED_IMAGE_DESTINATION = new RegExp(
  [
    // Consume code examples before trying to match any images within them.
    String.raw`^ {0,3}(\x60{3,}|~{3,})[^\r\n]*(?:\r?\n|$)[\s\S]*?(?:^ {0,3}\1[\x60~]*[ \t]*(?=\r?$)|(?![\s\S]))`,
    String.raw`^(?: {4}| {0,3}\t)[^\r\n]*`,
    String.raw`(?<![\\\x60])(\x60+)(?!\x60)[\s\S]*?(?<!\x60)\2(?!\x60)`,
    String.raw`((?<!\\)!\[(?:\\.|[^\[\]\\\r\n]|\[[^\[\]\r\n]*\])*\]\([ \t]*)(?:<${EMBEDDED_IMAGE_URL}>|${EMBEDDED_IMAGE_URL})(?=[ \t\r\n)])`,
    String.raw`(<img(?:\s+${HTML_ATTRIBUTE})*?\s+src\s*=\s*)(?:(["'])${EMBEDDED_IMAGE_URL}\5|${EMBEDDED_IMAGE_URL})(?=[\s/>])(?=[^<>]*>)`,
  ].join('|'),
  'gim',
);

/** Keep authored text, including image labels, while omitting the encoded pixels. */
export function stripEmbeddedImageUrls(text: string): string {
  if (!/data:image\//i.test(text)) return text;
  return text.replace(
    EMBEDDED_IMAGE_DESTINATION,
    (
      match,
      _fence,
      _code,
      markdown: string | undefined,
      html: string | undefined,
      quote: string | undefined,
    ) => (html === undefined ? (markdown ?? match) : html + (quote?.repeat(2) ?? '')),
  );
}

const normalisedCardContent = new WeakMap<
  Card,
  {
    front: string;
    back: string;
    searchableFront: string;
    normalisedText: string;
    frontLength: number;
  }
>();

/** Keep image labels and surrounding text, without indexing the encoded pixels.
 * Weak keys release these derived strings with the loaded records. */
function cardContent(card: Card) {
  let cached = normalisedCardContent.get(card);
  if (!cached || cached.front !== card.front || cached.back !== card.back) {
    const searchableFront = stripEmbeddedImageUrls(card.front);
    const front = normalise(searchableFront);
    cached = {
      front: card.front,
      back: card.back,
      searchableFront,
      normalisedText: [front, normalise(stripEmbeddedImageUrls(card.back))].join('  '),
      frontLength: front.length,
    };
    normalisedCardContent.set(card, cached);
  }
  return cached;
}

/** Warm sizeable image imports in idle slices. Very large fields wait for a query. */
export function warmCardSearchContent(card: Card): void {
  const length = card.front.length + card.back.length;
  if (
    length >= 4096 &&
    length <= 512_000 &&
    (/data:image\//i.test(card.front) || /data:image\//i.test(card.back))
  ) {
    cardContent(card);
  }
}

function indexOutsideContent(query: string, content: string, fields: string[]): number {
  // Queries spanning fields contain their two-space separator, or start/end
  // inside it (normalising accents can expose edge spaces after trimming).
  // Preserve those matches without copying embedded images for ordinary typing.
  if (query.includes('  ') || query.startsWith(' ') || query.endsWith(' '))
    return [content, ...fields].join('  ').indexOf(query);
  let offset = content.length + 2;
  for (const field of fields) {
    const index = field.indexOf(query);
    if (index !== -1) return offset + index;
    offset += field.length + 2;
  }
  return -1;
}

/**
 * Find cards in a Course/Lesson-aware scope.
 */
export function searchCardsInScope(
  query: string,
  scope: SearchScope,
  options: SearchOptions = {},
): ScopedCardSearchResult[] {
  const search = rankCardsInScope(query, scope, options, false);
  let step = search.next();
  while (!step.done) step = search.next();
  return step.value;
}

/** Let the browser paint and accept newer input during a cold, image-heavy search. */
export async function searchCardsInScopeInBatches(
  query: string,
  scope: SearchScope,
  options: SearchOptions,
  signal: AbortSignal,
): Promise<ScopedCardSearchResult[] | null> {
  if (signal.aborted) return null;
  const search = rankCardsInScope(query, scope, options, true);
  const channel = new MessageChannel();
  try {
    while (!signal.aborted) {
      // A posted message yields a browser task without the nested timer delay.
      await new Promise<void>((resolve) => {
        channel.port1.onmessage = () => resolve();
        channel.port2.postMessage(null);
      });
      if (signal.aborted) break;
      const step = search.next();
      if (step.done) return step.value;
    }
    return null;
  } finally {
    channel.port1.close();
    channel.port2.close();
  }
}

function* rankCardsInScope(
  query: string,
  { cards, courses, lessons, occlusions }: SearchScope,
  options: SearchOptions,
  cooperative: boolean,
): Generator<void, ScopedCardSearchResult[], void> {
  let sliceEnd = cooperative ? performance.now() + 8 : 0;
  const now = options.now ?? Date.now();
  const parsed = options.parseQuery ? parseAdvancedQuery(query) : null;
  const filters = [...(options.filters ?? []), ...(parsed?.filters ?? [])];
  const q = normalise(parsed ? parsed.text : query.trim());
  // Nothing to do without either a text query or an active filter.
  if (!q && filters.length === 0 && !parsed?.tags.length && !parsed?.decks.length) return [];

  const courseById = new Map(courses.map((course) => [course.id, course]));
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const occlusionTextByRegion = new Map<string, { courseId: string; text: string }>();
  if (q) {
    for (const occlusion of occlusions ?? []) {
      const regions = new Map(occlusion.regions.map((region) => [region.id, region]));
      for (const region of occlusion.regions) {
        const answer =
          region.role === 'feature' && region.pairedRegionId
            ? regions.get(region.pairedRegionId)?.answerText
            : region.answerText;
        occlusionTextByRegion.set(region.id, {
          courseId: occlusion.courseId,
          text: normalise([occlusion.name, answer ?? '', region.backNote ?? ''].join('  ')),
        });
      }
    }
  }
  const ranked: { result: ScopedCardSearchResult; score: number; front: string }[] = [];

  let scanned = 0;
  for (const card of cards) {
    if (cooperative && ++scanned % 8 === 0 && performance.now() >= sliceEnd) {
      yield;
      sliceEnd = performance.now() + 8;
    }
    const course = card.courseId ? courseById.get(card.courseId) : undefined;
    if (!course) continue;
    const lesson = card.primaryLessonId ? lessonById.get(card.primaryLessonId) : undefined;
    if (lesson && lesson.courseId !== course.id) continue;
    const contextName = lesson?.name ?? course.name;

    // Every active filter must match (AND), narrowing the set before text ranking.
    if (filters.length && !filters.every((f) => matchesFilter(card, f, now, course.leechThreshold)))
      continue;

    // Inline tag operators (AND between multiple tag: tokens).
    if (parsed?.tags.length) {
      const cardTags = (card.tags ?? []).map(normalise);
      if (!parsed.tags.every((t) => cardTags.includes(t))) continue;
    }

    // The historical deck: operator now searches Course and Lesson ownership labels.
    if (parsed?.decks.length) {
      const searchableContexts = [course.name, lesson?.name]
        .filter((name): name is string => Boolean(name))
        .map(normalise);
      if (!parsed.decks.some((d) => searchableContexts.some((name) => name.includes(d)))) continue;
    }

    let score = 0;
    let front = card.front;
    if (q) {
      const content = cardContent(card);
      front = content.searchableFront;
      const contentIdx = content.normalisedText.indexOf(q);
      // Front matches always rank above non-front matches, regardless of how
      // far into the front text they appear. Ties are broken by earliest
      // overall match position (idx).
      if (contentIdx !== -1)
        score =
          contentIdx + q.length <= content.frontLength
            ? contentIdx
            : Number.MAX_SAFE_INTEGER / 2 + contentIdx;
      else {
        const generated = card.occlusionRegionId
          ? occlusionTextByRegion.get(card.occlusionRegionId)
          : undefined;
        const idx = indexOutsideContent(q, content.normalisedText, [
          normalise(course.name),
          normalise(lesson?.name ?? ''),
          ...(card.tags ?? []).map(normalise),
          ...(generated?.courseId === course.id ? [generated.text] : []),
        ]);
        if (idx === -1) continue;
        score = Number.MAX_SAFE_INTEGER / 2 + idx;
      }
    }
    ranked.push({ result: { kind: 'card', card, course, lesson, contextName }, score, front });
  }

  // Rank by match quality, then by front text so equal matches read in a stable, natural
  // order ("Item 9" before "Item 10") rather than the storage order of random ids.
  ranked.sort((a, b) => a.score - b.score || FRONT_ORDER.compare(a.front, b.front));
  return ranked.map(({ result }) => result);
}

/**
 * Find Questions by their authored or generated-family metadata. Card-only
 * filters deliberately do not enter this function: due/new/leech/flagged are
 * Card-management meanings, not aliases for Question exposure or scheduling.
 */
export function searchQuestionsInScope(
  query: string,
  { questions, courses, lessons }: QuestionSearchScope,
): ScopedQuestionSearchResult[] {
  const q = normalise(query.trim());
  if (!q) return [];

  const courseById = new Map(courses.map((course) => [course.id, course]));
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const ranked: { result: ScopedQuestionSearchResult; score: number }[] = [];

  for (const question of questions) {
    const course = courseById.get(question.courseId);
    if (!course) continue;
    const lesson = question.primaryLessonId ? lessonById.get(question.primaryLessonId) : undefined;
    if (question.primaryLessonId && (!lesson || lesson.courseId !== course.id)) continue;

    const additionalLessonNames = question.additionalLessonIds.flatMap((lessonId) => {
      const additionalLesson = lessonById.get(lessonId);
      return additionalLesson?.courseId === course.id ? [additionalLesson.name] : [];
    });
    const questionContent =
      question.kind === 'fixed' ? [question.prompt, question.explanation] : [question.generatorKey];
    const haystack = normalise(
      [
        question.name,
        ...questionContent,
        course.name,
        lesson?.name ?? '',
        ...additionalLessonNames,
        ...question.tags,
      ].join('  '),
    );
    const index = haystack.indexOf(q);
    if (index === -1) continue;

    const nameIndex = normalise(question.name).indexOf(q);
    const promptIndex = question.kind === 'fixed' ? normalise(question.prompt).indexOf(q) : -1;
    const primaryIndex = nameIndex === -1 ? promptIndex : nameIndex;
    const score = primaryIndex === -1 ? Number.MAX_SAFE_INTEGER / 2 + index : primaryIndex;
    ranked.push({
      result: {
        kind: 'question',
        question,
        course,
        lesson,
        contextName: lesson?.name ?? course.name,
      },
      score,
    });
  }

  ranked.sort((left, right) => left.score - right.score);
  return ranked.map(({ result }) => result);
}

/**
 * Find courses, lessons and notes matching `query` by name/description/content.
 * A plain substring search over normalised text, ranked by match position the
 * same way {@link searchCards} ranks its front/back matches — earlier matches
 * (and matches in the item's own name over its ancestors') rank first.
 */
export function searchCourseContent(
  query: string,
  courses: Course[],
  lessons: Lesson[],
  notes: Note[],
): CourseContentHit[] {
  const q = normalise(query.trim());
  if (!q) return [];

  const courseById = new Map(courses.map((c) => [c.id, c]));
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const ranked: { hit: CourseContentHit; score: number }[] = [];

  for (const course of courses) {
    const nameIdx = normalise(course.name).indexOf(q);
    const haystack = normalise([course.name, course.description].join('  '));
    const idx = haystack.indexOf(q);
    if (idx === -1) continue;
    const score = nameIdx === -1 ? Number.MAX_SAFE_INTEGER / 2 + idx : nameIdx;
    ranked.push({ hit: { kind: 'course', course }, score });
  }

  for (const lesson of lessons) {
    const course = courseById.get(lesson.courseId);
    if (!course) continue;
    const nameIdx = normalise(lesson.name).indexOf(q);
    const haystack = normalise([lesson.name, lesson.description ?? ''].join('  '));
    const idx = haystack.indexOf(q);
    if (idx === -1) continue;
    const score = nameIdx === -1 ? Number.MAX_SAFE_INTEGER / 2 + idx : nameIdx;
    ranked.push({ hit: { kind: 'lesson', lesson, course }, score });
  }

  for (const note of notes) {
    const lesson = lessonById.get(note.lessonId);
    if (!lesson) continue;
    const course = courseById.get(lesson.courseId);
    if (!course) continue;
    const nameIdx = normalise(note.name).indexOf(q);
    const haystack = normalise([note.name, note.content].join('  '));
    const idx = haystack.indexOf(q);
    if (idx === -1) continue;
    const score = nameIdx === -1 ? Number.MAX_SAFE_INTEGER / 2 + idx : nameIdx;
    ranked.push({ hit: { kind: 'note', note, lesson, course }, score });
  }

  ranked.sort((a, b) => a.score - b.score);
  return ranked.map((r) => r.hit);
}

/**
 * Where a card result should deep-link to: the lesson-scoped editor when the card
 * belongs to a lesson, or the course question bank otherwise. Every card carries a
 * courseId (the schema v9 migration stamps one onto every legacy deck's cards), so
 * this is the only edit route left.
 */
export function cardEditPath(card: Card): string {
  // Orphaned cards (deckId matched no deck at the v9 migration) keep courseId
  // undefined; deep-linking to /course/undefined/... would 404, so fall back home.
  if (!card.courseId) return '/';
  return card.primaryLessonId
    ? `/course/${card.courseId}/lesson/${card.primaryLessonId}/cards/${card.id}/edit`
    : `/course/${card.courseId}/cards/${card.id}/edit`;
}

/** The canonical course-scoped editor route for a fixed Question or generated family. */
export function questionEditPath(question: QuestionDefinition): string {
  return `/course/${question.courseId}/questions/${question.id}/edit`;
}

/** A short, plain-text preview of a card's markdown for result lists. */
export function plainPreview(md: string, max = 120): string {
  const text = md
    .replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/gs, '$1') // cloze -> the answer text, including multiline deletions
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]*)\]\((?:\\.|[^\\)])*\)/g, '$1') // links -> their readable labels
    .replace(/[#*_`>~$]/g, '') // markdown punctuation
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
