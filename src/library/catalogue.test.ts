import { describe, expect, it } from 'vitest';
import { libraryCourses, resolveCourseShareUrl } from './catalogue';

describe('libraryCourses', () => {
  it('uses unique course identifiers', () => {
    expect(new Set(libraryCourses.map(({ id }) => id)).size).toBe(libraryCourses.length);
  });

  it('retains the published science, History and Religious Studies snapshots', () => {
    expect(libraryCourses).toHaveLength(26);
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
        ['biology8461', 7, 1328, 152, 152, 1371],
        ['chemistry8462', 5, 980, 139, 145, 1293],
        ['physics8463', 5, 1164, 140, 141, 1698],
        ['biology0610', 6, 1398, 155, 155, 1414],
        ['chemistry0620', 5, 990, 137, 143, 1278],
        ['physics0625', 5, 1228, 150, 151, 1827],
        ['biology0970', 6, 1398, 155, 155, 1414],
        ['chemistry0971', 5, 990, 137, 143, 1278],
        ['biology1bi0', 7, 1304, 147, 148, 1350],
        ['chemistry1ch0', 5, 985, 140, 146, 1305],
        ['physics1ph0', 5, 1160, 140, 141, 1702],
        ['biologyj247', 7, 1311, 149, 149, 1344],
        ['chemistryj248', 5, 972, 136, 142, 1276],
        ['physicsj249', 5, 1170, 141, 142, 1709],
        ['biologyj257', 7, 1287, 147, 147, 1326],
        ['chemistryj258', 5, 972, 136, 142, 1276],
        ['physicsj259', 5, 1154, 140, 141, 1700],
        ['physics4ph1', 5, 1118, 132, 133, 1623],
        ['biology4bi1', 31, 1465, 164, 168, 1533],
        ['chemistry4ch1', 22, 1057, 147, 154, 1417],
        ['physics0972', 20, 1310, 152, 153, 1968],
        ['combinedscience8464', 10, 3760, 447, 429, 4192],
        ['history0977', 15, 708, 111, 112, 1738],
        ['religiousstudies8062', 21, 1272, 126, 126, 1656],
        ['combinedscience1sc0', 4, 4310, 445, 449, 4634],
        ['combinedsciencej250', 3, 4478, 476, 479, 5064],
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
    const scienceCourses = libraryCourses.filter(({ subject }) =>
      ['Biology', 'Chemistry', 'Physics', 'Combined Science'].includes(subject),
    );
    for (const course of scienceCourses) {
      expect(course.summary).toMatch(/selected|selection/);
    }
    const combined = libraryCourses.filter(({ subject }) => subject === 'Combined Science');
    expect(combined.map(({ code }) => code)).toEqual(['8464', '1SC0', 'J250']);
    for (const course of combined) {
      expect(course.summary).toMatch(/^A Higher-tier selection of biology, chemistry and physics/);
      expect(course.topics.length).toBeGreaterThan(8);
    }
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
