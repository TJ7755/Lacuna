import { describe, expect, it } from 'vitest';
import { libraryCourses, resolveCourseShareUrl } from './catalogue';

describe('libraryCourses', () => {
  it('contains the four published courses with unique stable IDs', () => {
    expect(libraryCourses.map(({ id }) => id)).toEqual([
      'biology4bi1',
      'chemistry4ch1',
      'physics0972',
      'history0977',
    ]);
    expect(new Set(libraryCourses.map(({ id }) => id)).size).toBe(libraryCourses.length);
    expect(libraryCourses.every((course) => course.reviewStatus === 'in-progress')).toBe(true);
  });

  it('records the counts from the published cumulative draft reports', () => {
    expect(libraryCourses.map(({ stats }) => stats)).toEqual([
      { cards: 1322, notes: 164, practiceSets: 165, practiceMarks: 1289 },
      { cards: 918, notes: 147, practiceSets: 152, practiceMarks: 1272 },
      { cards: 1039, notes: 152, practiceSets: 153, practiceMarks: 1726 },
      { cards: 708, notes: 111, practiceSets: 112, practiceMarks: 1718 },
    ]);
  });

  it('keeps qualification identifiers, summaries, topics and live links together', () => {
    expect(libraryCourses).toMatchObject([
      {
        subject: 'Biology',
        qualification: 'Pearson Edexcel International GCSE',
        code: '4BI1',
        summary: expect.any(String),
        topics: expect.arrayContaining(['Reproduction and inheritance']),
        shareUrl: 'https://getlacuna.app/#/s/6fb10671c70197caeff8616f80697ac5',
      },
      {
        subject: 'Chemistry',
        qualification: 'Pearson Edexcel International GCSE',
        code: '4CH1',
        summary: expect.any(String),
        topics: expect.arrayContaining(['Organic chemistry']),
        shareUrl: 'https://getlacuna.app/#/s/daf16de2b88b97fa236948559ede6c4c',
      },
      {
        subject: 'Physics',
        qualification: 'Cambridge IGCSE (9–1)',
        code: '0972',
        summary: expect.any(String),
        topics: expect.arrayContaining(['Space physics']),
        shareUrl: 'https://getlacuna.app/#/s/52fe58acd2fcece40c1d10ffbf08276f',
      },
      {
        subject: 'History',
        qualification: 'Cambridge IGCSE (9–1)',
        code: '0977',
        summary: expect.any(String),
        topics: expect.arrayContaining(['Depth study B: Germany, 1918–45']),
        shareUrl: 'https://getlacuna.app/#/s/31178fee8489ffcf1748c1dc5c570be5',
      },
    ]);
  });
});

describe('resolveCourseShareUrl', () => {
  it.each(libraryCourses.filter(({ shareUrl }) => shareUrl !== null))(
    'accepts the published URL for $id',
    ({ shareUrl }) => {
      expect(resolveCourseShareUrl(shareUrl)).toBe(shareUrl);
    },
  );

  it.each([
    'http://getlacuna.app/#/s/0123456789abcdef0123456789abcdef',
    'https://evil.example/#/s/0123456789abcdef0123456789abcdef',
    'https://getlacuna.app.evil.example/#/s/0123456789abcdef0123456789abcdef',
    'https://user@getlacuna.app/#/s/0123456789abcdef0123456789abcdef',
    'https://getlacuna.app:8443/#/s/0123456789abcdef0123456789abcdef',
    'https://getlacuna.app:443/#/s/0123456789abcdef0123456789abcdef',
    'https://getlacuna.app/?next=elsewhere#/s/0123456789abcdef0123456789abcdef',
    'https://getlacuna.app/?#/s/0123456789abcdef0123456789abcdef',
    'https://getlacuna.app/course/#/s/0123456789abcdef0123456789abcdef',
    'https://getlacuna.app/#/course/0123456789abcdef0123456789abcdef',
    'https://getlacuna.app/#/s/0123456789abcdef0123456789abcde',
    'https://getlacuna.app/#/s/0123456789abcdef0123456789ABCDEF',
    'https://getlacuna.app/#/s/0123456789abcdef0123456789abcdef/extra',
    'https://getlacuna.app/#/s/0123456789abcdef0123456789abcdef?next=elsewhere',
    ' https://getlacuna.app/#/s/0123456789abcdef0123456789abcdef',
  ])('rejects an untrusted or malformed URL: %s', (value) => {
    expect(resolveCourseShareUrl(value)).toBeNull();
  });

  it('returns null when a course has no published share URL', () => {
    expect(resolveCourseShareUrl(null)).toBeNull();
  });
});
