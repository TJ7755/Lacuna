import type { Card, ItemPayload, Lesson, Note, PendingMergeReview } from '../../db/types';
import type {
  CardUpdate,
  LessonUpdate,
  NoteUpdate,
  ShareCardInput,
  ShareLessonInput,
  ShareNoteInput,
} from '../../db/lineageDiff';
import type { MergeReviewItemKind } from '../../db/mergeImport';
import { renderLineAsEnglish } from '../../items/markSchemeCompiler';
import { formatDate } from '../../utils/datetime';

export interface ReviewField {
  label: string;
  before: string;
  after: string;
  markdown?: boolean;
  state: 'Added' | 'Removed' | 'Changed' | 'Unchanged';
}

export interface ReviewRowModel {
  key: string;
  kind: MergeReviewItemKind;
  entityId: string;
  title: string;
  fields: ReviewField[];
  conflictRemoval?: boolean;
}

/** The collapsed glance only; expanded Markdown keeps its original source and assets. */
export function toPlainLine(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/\$\$?([^$]*)\$\$?/g, '$1')
    .replace(/[*_~#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function field(label: string, before = '', after = '', markdown = false): ReviewField {
  return {
    label,
    before,
    after,
    markdown,
    state: before === after ? 'Unchanged' : !before ? 'Added' : !after ? 'Removed' : 'Changed',
  };
}

function answerMode(value: 'reveal' | 'type' | undefined) {
  return value === 'type' ? 'Type answer' : value === 'reveal' ? 'Reveal answer' : '';
}

function payloadText(payload: ItemPayload | undefined): string {
  if (!payload) return '';
  if (payload.kind === 'scaffold') return 'Scaffold';
  const fixtures =
    payload.fixtures
      ?.map(
        (fixture) =>
          `${Array.isArray(fixture.studentAnswer) ? fixture.studentAnswer.join('; ') : fixture.studentAnswer}: ${fixture.expectedMarks} marks${fixture.note ? ` — ${fixture.note}` : ''}`,
      )
      .join('\n') ?? '';
  const answer =
    payload.kind === 'working'
      ? payload.scheme.map(renderLineAsEnglish).join('\n')
      : payload.answer.kind === 'matches-one-of'
        ? `One of: ${payload.answer.values.join(', ')}`
        : payload.answer.kind === 'within'
          ? `${payload.answer.value} ± ${payload.answer.tolerance}`
          : payload.answer.value;
  return [answer, fixtures].filter(Boolean).join('\n\n');
}

function lessonFields(existing: Lesson | undefined, next: LessonUpdate): ReviewField[] {
  const incoming = { ...existing, ...next };
  const date = (value?: number, zone?: string) =>
    value === undefined ? '' : formatDate(value, zone);
  return [
    field('Name', existing?.name, incoming.name),
    field('Description', existing?.description, incoming.description, true),
    field(
      'Lesson',
      existing?.isExtension ? 'Extension' : 'Core',
      incoming.isExtension ? 'Extension' : 'Core',
    ),
    field(
      'Release date',
      date(existing?.releaseDate, existing?.timeZone),
      date(incoming.releaseDate, incoming.timeZone),
    ),
    field(
      'Exam date',
      date(existing?.examDate, existing?.timeZone),
      date(incoming.examDate, incoming.timeZone),
    ),
    field('Time zone', existing?.timeZone, incoming.timeZone),
    field('Study filter', existing?.sessionFilter, incoming.sessionFilter),
    field('Answer mode', answerMode(existing?.answerMode), answerMode(incoming.answerMode)),
    field(
      'Position',
      existing ? String(existing.orderIndex + 1) : '',
      incoming.orderIndex === undefined ? '' : String(incoming.orderIndex + 1),
    ),
  ];
}

function noteFields(existing: Note | undefined, next: NoteUpdate): ReviewField[] {
  const incoming = { ...existing, ...next };
  return [
    field('Name', existing?.name, incoming.name),
    field('Content', existing?.content, incoming.content, true),
    field(
      'Position',
      existing ? String(existing.orderIndex + 1) : '',
      incoming.orderIndex === undefined ? '' : String(incoming.orderIndex + 1),
    ),
  ];
}

function cardFields(existing: Card | undefined, next: CardUpdate): ReviewField[] {
  const incoming = { ...existing, ...next };
  const type = (value?: string) =>
    value === 'front_back'
      ? 'Front and back'
      : value === 'basic_reversed'
        ? 'Reversed'
        : value === 'cloze'
          ? 'Cloze'
          : (value ?? '');
  return [
    field('Front', existing?.front, incoming.front, true),
    field('Back', existing?.back, incoming.back, true),
    field('Card type', type(existing?.type), type(incoming.type)),
    field('Tags', existing?.tags?.join(', '), incoming.tags?.join(', ')),
    field('Answer mode', answerMode(existing?.answerMode), answerMode(incoming.answerMode)),
    field('Answer specification', payloadText(existing?.payload), payloadText(incoming.payload)),
  ];
}

/** Presentation only: partial updates retain omitted fields; conflicts show the full incoming version. */
export function buildMergeReviewRows(
  review: PendingMergeReview | null | undefined,
  lessons: Lesson[] = [],
  notes: Note[] = [],
  cards: Card[] = [],
) {
  const updates: ReviewRowModel[] = [];
  const removals: ReviewRowModel[] = [];
  const conflicts: ReviewRowModel[] = [];
  if (!review) return { updates, removals, conflicts };
  const lessonMap = new Map(lessons.map((item) => [item.id, item]));
  const noteMap = new Map(notes.map((item) => [item.id, item]));
  const cardMap = new Map(cards.map((item) => [item.id, item]));
  const model = (
    prefix: string,
    kind: MergeReviewItemKind,
    entityId: string,
    fields: ReviewField[],
  ): ReviewRowModel => ({
    key: `${prefix}-${kind}-${entityId}`,
    kind,
    entityId,
    fields: fields.filter((item) => item.before || item.after),
    title:
      kind === 'lesson'
        ? (lessonMap.get(entityId)?.name ?? 'Untitled lesson')
        : kind === 'note'
          ? (noteMap.get(entityId)?.name ?? 'Untitled note')
          : toPlainLine(cardMap.get(entityId)?.front ?? '') || 'Untitled card',
  });
  const fieldsFor = (kind: MergeReviewItemKind, id: string) =>
    kind === 'lesson'
      ? lessonFields(lessonMap.get(id), { id })
      : kind === 'note'
        ? noteFields(noteMap.get(id), { id })
        : cardFields(cardMap.get(id), { id });
  for (const next of review.diff.updates.lessons)
    updates.push(model('u', 'lesson', next.id, lessonFields(lessonMap.get(next.id), next)));
  for (const next of review.diff.updates.notes)
    updates.push(model('u', 'note', next.id, noteFields(noteMap.get(next.id), next)));
  for (const next of review.diff.updates.cards)
    updates.push(model('u', 'card', next.id, cardFields(cardMap.get(next.id), next)));
  for (const [kind, ids] of [
    ['lesson', review.diff.removals.lessonIds],
    ['note', review.diff.removals.noteIds],
    ['card', review.diff.removals.cardIds],
  ] as const) {
    for (const id of ids)
      removals.push(
        model(
          'r',
          kind,
          id,
          fieldsFor(kind, id).map((item) => field(item.label, item.before, '', item.markdown)),
        ),
      );
  }
  for (const conflict of review.diff.conflicts) {
    const { kind, entityId, incoming } = conflict;
    if (incoming === null) {
      conflicts.push({
        ...model(
          'c',
          kind,
          entityId,
          fieldsFor(kind, entityId).map((item) =>
            field(item.label, item.before, '', item.markdown),
          ),
        ),
        conflictRemoval: true,
      });
    } else if (kind === 'lesson') {
      const next = incoming as ShareLessonInput;
      conflicts.push(
        model(
          'c',
          kind,
          entityId,
          lessonFields(lessonMap.get(entityId), {
            id: entityId,
            name: next.n.trim() || 'Untitled lesson',
            description: next.d,
            isExtension: next.x === 1,
            releaseDate: next.rd,
            examDate: next.ed,
            timeZone: next.tz,
            sessionFilter: next.sf,
            answerMode: next.am,
          }),
        ),
      );
    } else if (kind === 'note') {
      const next = incoming as ShareNoteInput;
      conflicts.push(
        model(
          'c',
          kind,
          entityId,
          noteFields(noteMap.get(entityId), {
            id: entityId,
            name: next.n.trim() || 'Untitled note',
            content: next.c,
          }),
        ),
      );
    } else {
      const next = incoming as ShareCardInput;
      conflicts.push(
        model(
          'c',
          kind,
          entityId,
          cardFields(cardMap.get(entityId), {
            id: entityId,
            front: next.f,
            back: next.k === 1 ? '' : (next.b ?? ''),
            type: next.k === 1 ? 'cloze' : 'front_back',
            tags: next.g ?? [],
            payload: next.p,
            answerMode: next.am,
          }),
        ),
      );
    }
  }
  return { updates, removals, conflicts };
}
