import { describe, expect, it } from 'vitest';
import { libraryCourses, resolveCourseShareUrl } from './catalogue';

describe('libraryCourses', () => {
  it('uses unique course identifiers', () => {
    expect(new Set(libraryCourses.map(({ id }) => id)).size).toBe(libraryCourses.length);
  });

  it('retains the 22 approved science snapshots and unchanged History snapshot', () => {
    expect(libraryCourses).toHaveLength(23);
    const snapshots = libraryCourses.map(({ id, revision, stats }) => [
      id,
      revision,
      stats?.cards,
      stats?.notes,
      stats?.practiceSets,
      stats?.practiceMarks,
    ]);
    expect(snapshots).toEqual(
      expect.arrayContaining([
        ['biology8461', 3, 1171, 152, 152, 1298],
        ['chemistry8462', 2, 879, 139, 145, 1236],
        ['physics8463', 2, 983, 140, 141, 1587],
        ['biology0610', 3, 1219, 155, 155, 1335],
        ['chemistry0620', 2, 889, 137, 143, 1221],
        ['physics0625', 2, 1036, 150, 151, 1710],
        ['biology0970', 3, 1219, 155, 155, 1335],
        ['chemistry0971', 2, 889, 137, 143, 1221],
        ['biology1bi0', 3, 1135, 147, 148, 1275],
        ['chemistry1ch0', 2, 884, 140, 146, 1248],
        ['physics1ph0', 2, 979, 140, 141, 1591],
        ['biologyj247', 3, 1142, 149, 149, 1269],
        ['chemistryj248', 2, 871, 136, 142, 1219],
        ['physicsj249', 2, 983, 141, 142, 1594],
        ['biologyj257', 3, 1130, 147, 147, 1253],
        ['chemistryj258', 2, 871, 136, 142, 1219],
        ['physicsj259', 2, 970, 140, 141, 1587],
        ['physics4ph1', 2, 942, 132, 133, 1516],
        ['biology4bi1', 25, 1264, 164, 165, 1424],
        ['chemistry4ch1', 18, 911, 147, 153, 1338],
        ['physics0972', 17, 1036, 152, 153, 1790],
        ['combinedscience8464', 1, 69, 7, 7, 59],
        ['history0977', 13, 708, 111, 112, 1738],
      ]),
    );
    for (const course of libraryCourses) {
      expect(course.author).toBe('Lacuna');
      expect(course.publisher).toBe('Lacuna');
      expect(course.revisionDate).toBeUndefined();
    }
  });

  it('gives every listed publication a working share-route destination', () => {
    for (const course of libraryCourses) {
      expect(resolveCourseShareUrl(course.shareUrl)).toBe(course.shareUrl);
      expect(course.shareUrl).not.toBeNull();
    }
  });

  it('keeps native share identities and separates the Physics syllabus downloads', () => {
    expect(libraryCourses.find(({ id }) => id === 'biology4bi1')?.shareUrl).toBe(
      'https://getlacuna.app/#/s/6fb10671c70197caeff8616f80697ac5',
    );
    expect(libraryCourses.find(({ id }) => id === 'chemistry4ch1')?.shareUrl).toBe(
      'https://getlacuna.app/#/s/daf16de2b88b97fa236948559ede6c4c',
    );
    const physics = libraryCourses.find(({ id }) => id === 'physics0972');
    expect(physics?.shareUrl).toBe('https://getlacuna.app/#/s/52fe58acd2fcece40c1d10ffbf08276f');
    expect(physics?.alternativeCodes).toBeUndefined();
    expect(
      libraryCourses.filter(
        ({ code, alternativeCodes }) => code === '0625' || alternativeCodes?.includes('0625'),
      ),
    ).toHaveLength(1);
    expect(libraryCourses.find(({ id }) => id === 'history0977')).toMatchObject({
      alternativeCodes: ['0470'],
      shareUrl: 'https://getlacuna.app/#/s/31178fee8489ffcf1748c1dc5c570be5',
    });
  });

  it('uses one Cambridge board label and states the science scope honestly', () => {
    expect([
      ...new Set(
        libraryCourses
          .filter(({ board }) => board.startsWith('Cambridge'))
          .map(({ board }) => board),
      ),
    ]).toEqual(['Cambridge']);
    for (const course of libraryCourses.filter(({ subject }) => subject !== 'History')) {
      expect(course.summary).toMatch(/selected|selection/);
    }
    const combined = libraryCourses.find(({ code }) => code === '8464');
    expect(combined?.summary).toBe(
      'Cells and microscopy: seven introductory lessons for AQA Trilogy. Other Combined Science topics are outside this selection.',
    );
    expect(combined?.topics).toEqual([
      'Animal cells',
      'Plant cells',
      'Microscopic quantities',
      'Microscopy',
    ]);
    expect(libraryCourses.some(({ subject }) => /religious/i.test(subject))).toBe(false);
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
