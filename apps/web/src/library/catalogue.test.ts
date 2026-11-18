import { describe, expect, it } from 'vitest';
import { libraryCourses, resolveCourseShareUrl } from './catalogue';

describe('libraryCourses', () => {
  it('uses unique course identifiers', () => {
    expect(new Set(libraryCourses.map(({ id }) => id)).size).toBe(libraryCourses.length);
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
  });
});

describe('resolveCourseShareUrl', () => {
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
