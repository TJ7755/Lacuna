import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { db } from '../db/schema';
import { createCourse, createCourseCard } from '../db/repository';
import { recordShareImport } from '../shareLinks/linkStore';
import {
  createInsightsOptInSetting,
  createInsightsLastSentDaySetting,
  createInsightsLastPublishedAtSetting,
} from '../state/insightsOptIn';
import { createInsightsOwner, openInsightEnvelope, type InsightsOwner } from './envelope';
import {
  createEnrolmentSetting,
  disconnectFromClass,
  enrolInClass,
  setReportingConsent,
} from './enrolment';
import { deliverCourseInsights, publishCourseInsights } from './delivery';
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
it.each(['opt out', 'disconnect'])(
  'aborts an upload on %s and does not record an acknowledgement',
  async (action) => {
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
    if (action === 'disconnect') await disconnectFromClass(courseId);
    else setReportingConsent(courseId, false);
    await rejected;
    expect(createInsightsLastSentDaySetting(courseId).read()).toBeNull();
  },
);
it.each([
  ['daily delivery', deliverCourseInsights, day],
  ['current publication', publishCourseInsights, '2026-10-19'],
] as const)(
  'discards the old pupil’s failed %s after disconnecting and rejoining',
  async (_name, send, isoDay) => {
    setReportingConsent(courseId, true, 'Old identifier');
    const oldPupilId = createEnrolmentSetting(courseId).read()!.pupilId;
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }));
    await expect(send(courseId, { now, fetchImpl })).rejects.toThrow();
    await disconnectFromClass(courseId);
    enrolInClass(courseId, { shareId, lineageId: 'lineage', recipient: owner.recipient });
    setReportingConsent(courseId, true, 'Fresh identifier');
    const newPupilId = createEnrolmentSetting(courseId).read()!.pupilId;
    expect(newPupilId).not.toBe(oldPupilId);
    const pupils: { id: string; label: string }[] = [];
    fetchImpl.mockImplementation(async (_url, init) => {
      const report = parseDailyEvidence(
        await openInsightEnvelope(owner, JSON.parse(String(init?.body)), { shareId, isoDay }),
        { shareId, day: isoDay },
      );
      pupils.push(report.pupil);
      return new Response(null, { status: 204 });
    });
    await send(courseId, { now, fetchImpl, retry: true });
    expect(pupils).toEqual([{ id: newPupilId, label: 'Fresh identifier' }]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  },
);
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

it('publishes today’s work, timestamps accepted updates and leaves unchanged or idle checks unmarked', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
  expect(await publishCourseInsights(courseId, { now, fetchImpl })).toBe('idle');
  expect(createInsightsLastPublishedAtSetting(courseId).read()).toBeNull();
  setReportingConsent(courseId, true, 'Pupil A');
  expect(await publishCourseInsights(courseId, { now, fetchImpl })).toBe('sent');
  const timestamp = createInsightsLastPublishedAtSetting(courseId).read();
  expect(timestamp).toBe(now());
  expect(createInsightsLastSentDaySetting(courseId).read()).toBeNull();
  expect(await publishCourseInsights(courseId, { now: () => now() + 60_000, fetchImpl })).toBe(
    'unchanged',
  );
  expect(createInsightsLastPublishedAtSetting(courseId).read()).toBe(timestamp);
  const card = await createCourseCard(courseId, 'front_back', 'Membrane', 'Water');
  await db.reviewHistory.add({
    id: 'today-review',
    cardId: card.id,
    courseId,
    timestamp: now(),
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
  expect(await publishCourseInsights(courseId, { now: () => now() + 120_000, fetchImpl })).toBe(
    'sent',
  );
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  const [url, init] = fetchImpl.mock.calls[1];
  expect(url).toContain('/2026-10-19/');
  const evidence = parseDailyEvidence(
    await openInsightEnvelope(owner, JSON.parse(String(init?.body)), {
      shareId,
      isoDay: '2026-10-19',
    }),
    { shareId, day: '2026-10-19' },
  );
  expect(evidence.events).toHaveLength(1);
  expect(createInsightsLastPublishedAtSetting(courseId).read()).toBe(now() + 120_000);
});

it('finalises yesterday’s accepted snapshot without another slot or a fresh-publication claim', async () => {
  setReportingConsent(courseId, true, 'Pupil A');
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
  await publishCourseInsights(courseId, { now, fetchImpl });
  await deliverCourseInsights(courseId, { now: () => now() + 86_400_000, fetchImpl });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(createInsightsLastSentDaySetting(courseId).read()).toBe('2026-10-19');
  expect(createInsightsLastPublishedAtSetting(courseId).read()).toBe(now());
});

it('does not timestamp failed publication and returns idle if consent is withdrawn in flight', async () => {
  setReportingConsent(courseId, true, 'Pupil A');
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }));
  await expect(publishCourseInsights(courseId, { now, fetchImpl })).rejects.toThrow();
  expect(createInsightsLastPublishedAtSetting(courseId).read()).toBeNull();
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  fetchImpl.mockImplementationOnce(async (_url, init) => {
    started();
    return new Promise((_resolve, reject) =>
      init!.signal!.addEventListener('abort', () => reject(new Error('aborted'))),
    );
  });
  const sending = publishCourseInsights(courseId, { now, fetchImpl });
  await ready;
  setReportingConsent(courseId, false);
  expect(await sending).toBe('idle');
  expect(createInsightsLastPublishedAtSetting(courseId).read()).toBeNull();
});

it('does not acknowledge a snapshot after course lineage changes or UTC midnight passes', async () => {
  setReportingConsent(courseId, true, 'Pupil A');
  let clock = now();
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    await db.courses.update(courseId, {
      distributedCopy: {
        lineageId: 'different',
        revision: 1,
        locked: true,
        autoAcceptUpdates: false,
      },
    });
    return new Response(null, { status: 204 });
  });
  expect(await publishCourseInsights(courseId, { now: () => clock, fetchImpl })).toBe('idle');
  expect(createInsightsLastPublishedAtSetting(courseId).read()).toBeNull();
  await db.courses.update(courseId, {
    distributedCopy: { lineageId: 'lineage', revision: 1, locked: true, autoAcceptUpdates: false },
  });
  fetchImpl.mockImplementationOnce(async () => {
    clock += 86_400_000;
    return new Response(null, { status: 204 });
  });
  expect(await publishCourseInsights(courseId, { now: () => clock, fetchImpl })).toBe('idle');
  expect(createInsightsLastPublishedAtSetting(courseId).read()).toBeNull();
});
