import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { libraryCourses } from '../../library/catalogue';
import { CoursePage } from './CoursePage';
import { courseMetadata } from './content';

describe('public course catalogue', () => {
  it('advertises every course in both source crawl files', () => {
    for (const path of ['public/sitemap.xml', 'public/llms.txt']) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('https://getlacuna.app/courses/');
      for (const course of libraryCourses) {
        expect(source).toContain(`https://getlacuna.app/courses/${course.id}/`);
      }
    }
  });

  it('uses catalogue order and British list formatting in the index description', () => {
    const subjects = new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(
      libraryCourses.map(({ subject }) => subject),
    );
    expect(courseMetadata().description).toBe(
      `Free IGCSE revision courses for ${subjects}, with flashcards, notes and exam-style practice planned to your exam date.`,
    );
  });

  it('omits unknown counts and uses plain coming-soon text for an unpublished course', () => {
    const course = { ...libraryCourses[0], stats: undefined, shareUrl: null };
    expect(courseMetadata(course).description).toBe(
      `Free ${course.qualification} ${course.subject} (${course.code}) revision course with flashcards, notes and exam-style practice, planned to your exam date.`,
    );
    const html = renderToStaticMarkup(<CoursePage course={course} />);
    expect(html).toContain('<p>Coming soon</p>');
    expect(html).not.toContain('course-stats');
    expect(html).not.toContain('Start revising');
  });
});
