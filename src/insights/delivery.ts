import { db } from '../db/schema';
import { listShareImports, getCourseIdForShare } from '../shareLinks/linkStore';
import { DEFAULT_RELAY_URL } from '../shareLinks/client';
import {
  createInsightsLastSentDaySetting,
  createInsightsOptInSetting,
} from '../state/insightsOptIn';
import { completedIsoDayLabel } from '../../relay/src/insightsDay';
import { collectDailyEvidence } from './collectEvidence';
import { createEnrolmentSetting, reportingEnabled } from './enrolment';
import { createInsightsOutbox } from './outbox';

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
  const promise = deliver(courseId, controller, options).finally(() => active.delete(courseId));
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
): Promise<void> {
  const now = options.now ?? Date.now,
    day = completedIsoDayLabel(now());
  const setting = createEnrolmentSetting(courseId),
    enrolment = setting.read();
  if (!enrolment || enrolment.consentedAt === null || !enrolment.pupilLabel.trim()) return;
  const optIn = createInsightsOptInSetting(courseId);
  const allowed = () =>
    !controller.signal.aborted &&
    completedIsoDayLabel(now()) === day &&
    optIn.read() &&
    JSON.stringify(setting.read()) === JSON.stringify(enrolment) &&
    getCourseIdForShare(enrolment.shareId) === courseId;
  if (!allowed()) return;
  const abortIfChanged = () => {
    if (!allowed()) controller.abort();
  };
  const unsubscribe = [setting.subscribe(abortIfChanged), optIn.subscribe(abortIfChanged)];
  const outbox = createInsightsOutbox(undefined, now);
  try {
    const course = await db.courses.get(courseId);
    if (
      !course ||
      course.archived ||
      course.distributedCopy?.lineageId !== enrolment.lineageId ||
      !allowed()
    )
      return;
    if (createInsightsLastSentDaySetting(courseId).read() === day) return;
    const attemptKey = `lacuna.insights.attempt.${courseId}`;
    const previous = Number(localStorage.getItem(attemptKey));
    if (!options.retry && previous > now() - 3_600_000 && previous <= now()) return;
    localStorage.setItem(attemptKey, String(now()));
    const result = await outbox.send({
      shareId: enrolment.shareId,
      relayUrl: DEFAULT_RELAY_URL,
      recipient: enrolment.recipient,
      isOptedIn: allowed,
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
    if (result === 'sent') createInsightsLastSentDaySetting(courseId).write(day);
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
    for (const request of active.values()) request.controller.abort();
  };
}
