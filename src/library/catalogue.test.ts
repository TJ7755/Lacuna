import { describe, expect, it } from 'vitest';
import { libraryCourses, resolveCourseShareUrl } from './catalogue';

describe('libraryCourses', () => {
  it('uses unique course identifiers', () => {
    expect(new Set(libraryCourses.map(({ id }) => id)).size).toBe(libraryCourses.length);
  });

  it('retains the published science, History and Religious Studies snapshots', () => {
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
        ['biology8461', 22, 2208, 242, 243, 2284],
        ['chemistry8462', 10, 1674, 209, 215, 2005],
        ['physics8463', 9, 1835, 190, 190, 2417],
        ['biology0610', 15, 1812, 212, 212, 1820],
        ['chemistry0620', 10, 1371, 180, 183, 1614],
        ['physics0625', 8, 1569, 150, 151, 2092],
        ['biology0970', 15, 1812, 212, 212, 1820],
        ['chemistry0971', 10, 1371, 180, 183, 1614],
        ['biology1bi0', 16, 2385, 254, 265, 2429],
        ['chemistry1ch0', 10, 1683, 213, 215, 1959],
        ['physics1ph0', 9, 1853, 199, 199, 2398],
        ['biologyj247', 16, 2251, 232, 239, 2295],
        ['chemistryj248', 10, 1602, 207, 204, 1886],
        ['physicsj249', 9, 1743, 176, 177, 2298],
        ['biologyj257', 16, 2267, 235, 243, 2311],
        ['chemistryj258', 10, 1620, 209, 206, 1899],
        ['physicsj259', 9, 1760, 180, 181, 2332],
        ['physics4ph1', 9, 1571, 150, 151, 1990],
        ['biology4bi1', 44, 1559, 165, 174, 1585],
        ['chemistry4ch1', 43, 1192, 147, 154, 1531],
        ['physics0972', 28, 1569, 152, 153, 2172],
        ['history0977', 21, 737, 111, 112, 1738],
        ['religiousstudies8062', 22, 1272, 126, 126, 1656],
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
      if (course.qualification.includes('International GCSE')) {
        expect(course.summary).toContain('International GCSE');
      } else if (course.board === 'Cambridge') {
        expect(course.summary).toContain('Core and Supplement');
      } else {
        expect(course.summary).toContain('Higher-tier GCSE');
        expect(course.summary).toContain('shared Foundation content');
      }
    }
    expect(libraryCourses.some(({ subject }) => subject === 'Combined Science')).toBe(false);
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
