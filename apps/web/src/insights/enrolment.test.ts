import { beforeEach, expect, it } from 'vitest';
import { createEnrolmentSetting, enrolInClass, setReportingConsent } from './enrolment';
import { createInsightsOptInSetting } from '../state/insightsOptIn';

const recipient = { keyId: 'a'.repeat(64), publicKey: 'public' };
beforeEach(() => localStorage.clear());
it('does not turn an old experimental toggle into consent, or replace a pinned teacher', () => {
  createInsightsOptInSetting('course').write(true);
  enrolInClass('course', { shareId: 'b'.repeat(32), lineageId: 'lineage', recipient });
  const saved = createEnrolmentSetting('course').read()!;
  expect(saved.consentedAt).toBeNull();
  expect(createInsightsOptInSetting('course').read()).toBe(false);
  setReportingConsent('course', true, 'Pupil A');
  enrolInClass('course', { shareId: 'b'.repeat(32), lineageId: 'lineage', recipient });
  expect(createEnrolmentSetting('course').read()).toMatchObject({
    pupilId: saved.pupilId,
    pupilLabel: 'Pupil A',
    consentedAt: expect.any(Number),
  });
  expect(() =>
    enrolInClass('course', {
      shareId: 'b'.repeat(32),
      lineageId: 'lineage',
      recipient: { ...recipient, keyId: 'c'.repeat(64) },
    }),
  ).toThrow(/different teacher/);
});
it('requires a label and an enrolment, and revokes consent on opt-out', () => {
  expect(() => setReportingConsent('course', true, 'Pupil A')).toThrow();
  enrolInClass('course', { shareId: 'b'.repeat(32), lineageId: 'lineage', recipient });
  expect(() => setReportingConsent('course', true, ' ')).toThrow();
  setReportingConsent('course', true, ' Pupil A ');
  expect(createInsightsOptInSetting('course').read()).toBe(true);
  setReportingConsent('course', false);
  expect(createInsightsOptInSetting('course').read()).toBe(false);
  expect(createEnrolmentSetting('course').read()!.consentedAt).toBeNull();
});
