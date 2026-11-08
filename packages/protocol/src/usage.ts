import { z } from 'zod';

// Route patterns are static. Route params, query strings, titles and URLs never enter a metric.
export const USAGE_PAGES = {
  '/': 'today',
  settings: 'settings',
  search: 'search',
  share: 'share',
  's/:code': 'shared-course',
  'gaps/:courseId': 'class-progress',
  analytics: 'progress',
  archived: 'archived',
  help: 'help',
  'course/:courseId': 'course',
  'course/:courseId/lesson/:lessonId': 'lesson',
  'course/:courseId/cards': 'cards',
  'course/:courseId/questions': 'questions',
  'course/:courseId/question-sets/:setId/edit': 'question-set-editor',
  'course/:courseId/question-sets/:setId/attempts/:attemptId': 'question-set-practice',
  'course/:courseId/question-sets/:setId': 'question-set',
  'course/:courseId/questions/new': 'new-question',
  'course/:courseId/questions/:questionId/edit': 'question-editor',
  'course/:courseId/cards/new': 'new-card',
  'course/:courseId/cards/:cardId/edit': 'card-editor',
  'course/:courseId/settings': 'course-settings',
  'course/:courseId/analytics': 'course-progress',
  'course/:courseId/updates': 'course-updates',
  'course/:courseId/lesson/:lessonId/cards/new': 'new-lesson-card',
  'course/:courseId/lesson/:lessonId/cards/:cardId/edit': 'lesson-card-editor',
  'course/:courseId/sequence/new': 'new-sequence',
  'course/:courseId/sequence/:sequenceId/edit': 'sequence-editor',
  'course/:courseId/lesson/:lessonId/sequence/new': 'new-lesson-sequence',
  'course/:courseId/occlusion/new': 'new-occlusion',
  'course/:courseId/occlusion/:occlusionId/edit': 'occlusion-editor',
  'course/:courseId/lesson/:lessonId/occlusion/new': 'new-lesson-occlusion',
  '*': 'not-found',
  '/start': 'onboarding',
  '/course/:courseId/questions/learn': 'question-practice',
  '/course/:courseId/study': 'course-study',
  '/learn': 'practice',
  '/course/:courseId/learn': 'course-practice',
  '/lesson/:lessonId/learn': 'lesson-practice',
} as const;

export type UsagePage = (typeof USAGE_PAGES)[keyof typeof USAGE_PAGES];

export function usagePageForRoute(path: string | undefined, index = false): UsagePage | undefined {
  const pattern = index ? '/' : path;
  if (pattern && Object.hasOwn(USAGE_PAGES, pattern)) {
    return USAGE_PAGES[pattern as keyof typeof USAGE_PAGES];
  }
}

export const USAGE_WORKFLOW_ACTIONS = [
  'search-opened',
  'search-used',
  'search-result-opened',
  'import-opened',
  'import-started',
  'import-completed',
  'import-cancelled',
  'edit-opened',
  'edit-saved',
  'edit-cancelled',
  'study-started',
  'study-completed',
  'study-exited',
  'create-started',
  'create-completed',
  'share-opened',
  'share-completed',
  'export-completed',
] as const;

export const USAGE_ACTIONS = [
  'button',
  'link',
  'menu',
  'tab',
  'switch',
  'disclosure',
  'form',
  'dialog',
  'select',
  'checkbox',
  'radio',
  'shortcut',
  ...USAGE_WORKFLOW_ACTIONS,
] as const;

export type UsageAction = (typeof USAGE_ACTIONS)[number];
export type UsageKey = string;

export const USAGE_TIME_BANDS = [
  'under-one',
  'one-to-five',
  'five-to-thirty',
  'thirty-plus',
] as const;
export const USAGE_SCROLL_BANDS = ['quarter', 'half', 'three-quarters', 'end'] as const;
export const USAGE_MAX_ROWS = 96;
export const USAGE_MAX_BODY_BYTES = 16 * 1024;
export const USAGE_RETENTION_DAYS = 90;

const pages = new Set<string>(Object.values(USAGE_PAGES));
const actions = new Set<string>(USAGE_ACTIONS);
const workflowActions = new Set<string>(USAGE_WORKFLOW_ACTIONS);
const timeBands = new Set<string>(USAGE_TIME_BANDS);
const scrollBands = new Set<string>(USAGE_SCROLL_BANDS);

function isReturnWindow(value: string): boolean {
  return value === 'week' || value === 'month';
}

/** Only approved dimension combinations cross the transport boundary. */
export function isUsageMetricKey(key: string): boolean {
  const parts = key.split('/');
  const [kind, page, detail, extra] = parts;
  if (kind === 'breadth') {
    return parts.length === 2 && ['one', 'two-to-four', 'five-plus'].includes(page);
  }
  if (kind === 'pair') {
    return (
      parts.length === 3 &&
      page < detail &&
      workflowActions.has(page) &&
      workflowActions.has(detail)
    );
  }
  if (!pages.has(page)) return false;
  if (kind === 'source') {
    return (
      parts.length === 4 &&
      actions.has(detail) &&
      ['button', 'menu', 'shortcut', 'link', 'form', 'other'].includes(extra)
    );
  }
  if (kind === 'return') {
    return (
      (parts.length === 3 && isReturnWindow(detail)) ||
      (parts.length === 4 && workflowActions.has(detail) && isReturnWindow(extra))
    );
  }
  if (kind === 'view' || kind === 'entry') return parts.length === 2;
  if (parts.length !== 3) return false;
  switch (kind) {
    case 'action':
    case 'exposure':
    case 'offline':
    case 'online':
      return actions.has(detail);
    case 'transition':
      return pages.has(detail);
    case 'foreground':
    case 'first-action':
    case 'render':
      return timeBands.has(detail);
    case 'scroll':
      return scrollBands.has(detail);
    case 'input':
      return ['pointer', 'touch', 'keyboard'].includes(detail);
    case 'screen':
      return ['small', 'medium', 'large'].includes(detail);
    case 'mode':
      return detail === 'touch' || detail === 'keyboard';
    case 'release':
      return /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(detail);
    default:
      return false;
  }
}

const usageDay = z.iso.date();
const usageRow = z.tuple([
  z.string().max(120).refine(isUsageMetricKey),
  z.number().int().min(1).max(10_000),
  z.union([z.literal(0), z.literal(1)]),
]);

export const usageBatchSchema = z.strictObject({
  day: usageDay,
  id: z.uuidv4(),
  rows: z
    .array(usageRow)
    .min(1)
    .max(USAGE_MAX_ROWS)
    .refine((rows) => new Set(rows.map(([key]) => key)).size === rows.length),
});

export type UsageBatch = z.infer<typeof usageBatchSchema>;
