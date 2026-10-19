import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { db } from '../db/schema';
import { createCourse, createCourseCard } from '../db/repository';
import { recordShareImport } from '../shareLinks/linkStore';
import {
  createInsightsOptInSetting,
  createInsightsLastSentDaySetting,
} from '../state/insightsOptIn';
import { createInsightsOwner, openInsightEnvelope, type InsightsOwner } from './envelope';
import { enrolInClass, setReportingConsent } from './enrolment';
import { deliverCourseInsights } from './delivery';
import { parseDailyEvidence } from './evidence';

const shareId = 'a'.repeat(32),
  day = '2026-10-18',
  now = () => Date.parse('2026-10-19T12:00:00Z');
let owner: InsightsOwner, courseId: string;
beforeAll(async () => {
  owner = await createInsightsOwner('a separate long teacher recovery phrase', shareId);
}, 30_000);
beforeEach(async () => {
  localStorage.clear();
  vi.stubEnv('VITE_GAPS_REPORTING_ENABLED', 'true');
  await Dexie.delete('lacuna.insights.outbox');
  await db.delete();
  await db.open();
  const course = await createCourse('Biology');
  courseId = course.id;
  await db.courses.update(courseId, {
    distributedCopy: { lineageId: 'lineage', revision: 1, locked: true, autoAcceptUpdates: false },
  });
  recordShareImport(shareId, courseId);
  enrolInClass(courseId, { shareId, lineageId: 'lineage', recipient: owner.recipient });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('sends no evidence for an old toggle, a disabled build or a different imported course', async () => {
  const fetchImpl = vi.fn<typeof fetch>();
  createInsightsOptInSetting(courseId).write(true);
  await deliverCourseInsights(courseId, { now, fetchImpl });
  expect(fetchImpl).not.toHaveBeenCalled();
  setReportingConsent(courseId, true, 'Pupil A');
  vi.stubEnv('VITE_GAPS_REPORTING_ENABLED', 'false');
  await deliverCourseInsights(courseId, { now, fetchImpl });
  vi.stubEnv('VITE_GAPS_REPORTING_ENABLED', 'true');
  recordShareImport(shareId, 'another-course');
  await deliverCourseInsights(courseId, { now, fetchImpl });
  expect(fetchImpl).not.toHaveBeenCalled();
});
it('delivers yesterday’s encrypted recall once and records only an accepted report', async () => {
  setReportingConsent(courseId, true, 'Pupil A');
  const card = await createCourseCard(courseId, 'front_back', 'Membrane', 'Water');
  await db.reviewHistory.add({
    id: 'review',
    cardId: card.id,
    courseId,
    timestamp: Date.parse(`${day}T12:00:00Z`),
    grade: 3,
    correct: true,
    responseTimeSec: 2,
    distracted: false,
    stabilityBefore: null,
    stabilityAfter: 2,
    difficultyBefore: null,
    difficultyAfter: 3,
    retrievabilityAtReview: null,
  });
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
    const raw = String(init?.body);
    expect(raw).not.toContain('Pupil A');
    const evidence = parseDailyEvidence(
      await openInsightEnvelope(owner, JSON.parse(raw), { shareId, isoDay: day }),
      { shareId, day },
    );
    expect(evidence.pupil.label).toBe('Pupil A');
    expect(evidence.events[0]).toMatchObject({ retained: true, conceptIds: [card.conceptId] });
    return new Response(null, { status: 204 });
  });
  await Promise.all([
    deliverCourseInsights(courseId, { now, fetchImpl }),
    deliverCourseInsights(courseId, { now, fetchImpl }),
  ]);
  await deliverCourseInsights(courseId, { now, fetchImpl, retry: true });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(createInsightsLastSentDaySetting(courseId).read()).toBe(day);
});
it('aborts an upload when consent is revoked and does not record an acknowledgement', async () => {
  setReportingConsent(courseId, true, 'Pupil A');
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
    started();
    return new Promise((_resolve, reject) =>
      init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }),
    );
  });
  const sending = deliverCourseInsights(courseId, { now, fetchImpl });
  const rejected = expect(sending).rejects.toThrow();
  await ready;
  setReportingConsent(courseId, false);
  await rejected;
  expect(createInsightsLastSentDaySetting(courseId).read()).toBeNull();
});
it('backs off failed automatic attempts for an hour but permits an explicit retry', async () => {
  setReportingConsent(courseId, true, 'Pupil A');
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }));
  await expect(deliverCourseInsights(courseId, { now, fetchImpl })).rejects.toThrow();
  await deliverCourseInsights(courseId, { now, fetchImpl });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  await expect(deliverCourseInsights(courseId, { now, fetchImpl, retry: true })).rejects.toThrow();
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(createInsightsLastSentDaySetting(courseId).read()).toBeNull();
});

it('abandons an attempt crossing UTC midnight before collecting and sends the new day next time', async () => {
  setReportingConsent(courseId, true, 'Pupil A');
  let clock = Date.parse('2026-10-19T23:59:59.999Z');
  const getCourse = db.courses.get.bind(db.courses);
  vi.spyOn(db.courses, 'get').mockImplementationOnce((key) =>
    getCourse(key).then((course) => {
      clock = Date.parse('2026-10-20T00:00:00.001Z');
      return course;
    }),
  );
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));

  await deliverCourseInsights(courseId, { now: () => clock, fetchImpl });
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(createInsightsLastSentDaySetting(courseId).read()).toBeNull();

  await deliverCourseInsights(courseId, { now: () => clock, fetchImpl });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const envelope = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
  expect(envelope.d).toBe('2026-10-19');
  const report = parseDailyEvidence(
    await openInsightEnvelope(owner, envelope, { shareId, isoDay: envelope.d }),
    { shareId, day: envelope.d },
  );
  expect(report.day).toBe(envelope.d);
  expect(createInsightsLastSentDaySetting(courseId).read()).toBe('2026-10-19');
});
