import { db } from '../db/schema';
import { listShareImports, getCourseIdForShare } from '../shareLinks/linkStore';
import { DEFAULT_RELAY_URL } from '../shareLinks/client';
import {
  createInsightsLastSentDaySetting,
  createInsightsLastPublishedAtSetting,
  createInsightsOptInSetting,
} from '../state/insightsOptIn';
import { completedIsoDayLabel } from '../../../relay/shared/insights/index';
import { collectDailyEvidence } from './collectEvidence';
import { createEnrolmentSetting, reportingEnabled } from './enrolment';
import { createInsightsOutbox, type InsightsPublicationResult } from './outbox';
export type { InsightsPublicationResult } from './outbox';

type DeliveryOptions = { retry?: boolean; fetchImpl?: typeof fetch; now?: () => number };
const publications = new Map<
  string,
  { promise: Promise<InsightsPublicationResult>; controller: AbortController }
>();

export function publishCourseInsights(
  courseId: string,
  options: DeliveryOptions = {},
): Promise<InsightsPublicationResult> {
  if (!reportingEnabled()) return Promise.resolve('idle');
  const running = publications.get(courseId);
  if (running) return running.promise;
  const controller = new AbortController();
  const promise = deliver(courseId, controller, options, true).finally(() =>
    publications.delete(courseId),
  );
  publications.set(courseId, { promise, controller });
  return promise;
}

const active = new Map<string, { promise: Promise<void>; controller: AbortController }>();

/** One attempt per hour on failure; accepted reports are deduplicated by the durable outbox. */
export function deliverCourseInsights(
  courseId: string,
  options: {
    retry?: boolean;
    fetchImpl?: typeof fetch;
    now?: () => number;
  } = {},
): Promise<void> {
  if (!reportingEnabled()) return Promise.resolve();
  const running = active.get(courseId);
  if (running) return running.promise;
  const controller = new AbortController();
  const promise = deliver(courseId, controller, options)
    .then(() => {})
    .finally(() => active.delete(courseId));
  active.set(courseId, { promise, controller });
  return promise;
}

async function deliver(
  courseId: string,
  controller: AbortController,
  options: {
    retry?: boolean;
    fetchImpl?: typeof fetch;
    now?: () => number;
  },
  publish = false,
): Promise<InsightsPublicationResult> {
  const now = options.now ?? Date.now,
    dayAt = (at: number) =>
      publish ? new Date(at).toISOString().slice(0, 10) : completedIsoDayLabel(at),
    day = dayAt(now());
  const setting = createEnrolmentSetting(courseId),
    enrolment = setting.read();
  if (!enrolment || enrolment.consentedAt === null || !enrolment.pupilLabel.trim()) return 'idle';
  const optIn = createInsightsOptInSetting(courseId);
  const allowed = () =>
    !controller.signal.aborted &&
    reportingEnabled() &&
    dayAt(now()) === day &&
    optIn.read() &&
    JSON.stringify(setting.read()) === JSON.stringify(enrolment) &&
    getCourseIdForShare(enrolment.shareId) === courseId;
  if (!allowed()) return 'idle';
  const abortIfChanged = () => {
    if (!allowed()) controller.abort();
  };
  const unsubscribe = [setting.subscribe(abortIfChanged), optIn.subscribe(abortIfChanged)];
  const outbox = createInsightsOutbox(undefined, now);
  try {
    const isCurrent = async () => {
      const course = await db.courses.get(courseId);
      return Boolean(
        course &&
        !course.archived &&
        course.distributedCopy?.lineageId === enrolment.lineageId &&
        allowed(),
      );
    };
    if (!(await isCurrent())) return 'idle';
    if (!publish) {
      if (createInsightsLastSentDaySetting(courseId).read() === day) return 'idle';
      const attemptKey = `lacuna.insights.attempt.${courseId}`;
      const previous = Number(localStorage.getItem(attemptKey));
      if (!options.retry && previous > now() - 3_600_000 && previous <= now()) return 'idle';
      localStorage.setItem(attemptKey, String(now()));
    }
    const result = await outbox[publish ? 'publish' : 'send']({
      shareId: enrolment.shareId,
      relayUrl: DEFAULT_RELAY_URL,
      recipient: enrolment.recipient,
      isOptedIn: allowed,
      isCurrent,
      signal: controller.signal,
      fetchImpl: options.fetchImpl,
      evidence: async () => {
        const current = await db.courses.get(courseId);
        if (
          !current ||
          current.archived ||
          current.distributedCopy?.lineageId !== enrolment.lineageId ||
          !allowed()
        )
          throw new Error('Reporting permission or course changed.');
        return collectDailyEvidence({
          courseId,
          shareId: enrolment.shareId,
          day,
          pupil: { id: enrolment.pupilId, label: enrolment.pupilLabel },
        });
      },
    });
    if (!(await isCurrent())) return 'idle';
    if (!publish && result === 'unchanged') createInsightsLastSentDaySetting(courseId).write(day);
    if (result === 'sent') {
      if (publish) {
        const published = createInsightsLastPublishedAtSetting(courseId);
        published.write(Math.max(published.read() ?? 0, now()));
      } else createInsightsLastSentDaySetting(courseId).write(day);
    }
    return result;
  } finally {
    unsubscribe.forEach((off) => off());
    outbox.close();
  }
}

export function installInsightsDelivery(): () => void {
  if (!reportingEnabled()) return () => {};
  const run = () => {
    if (document.visibilityState === 'hidden' || !navigator.onLine) return;
    for (const { courseId } of listShareImports())
      void deliverCourseInsights(courseId).catch(() => {
        /* Settings offers an explicit retry. */
      });
  };
  const timer = setInterval(run, 60_000);
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', run);
  run();
  return () => {
    clearInterval(timer);
    window.removeEventListener('online', run);
    document.removeEventListener('visibilitychange', run);
    for (const request of [...active.values(), ...publications.values()])
      request.controller.abort();
  };
}
