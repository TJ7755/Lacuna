import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { libraryCourses } from '../../library/catalogue';
import { CoursePage } from './CoursePage';
import { courseMetadata } from './content';
import { LIBRARY_ORIGIN } from '../../config/origins';
import { renderHead } from './entry-server';

describe('public course catalogue', () => {
  it.each([undefined, ...libraryCourses])(
    'links to the library from the index and every course: %s',
    (course) => {
      const document = new DOMParser().parseFromString(
        renderToStaticMarkup(<CoursePage course={course} />),
        'text/html',
      );
      const link = [...document.querySelectorAll('main a')].find(
        (anchor) => anchor.getAttribute('href') === LIBRARY_ORIGIN,
      );
      expect(link?.textContent?.trim()).toBeTruthy();
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    },
  );

  it.each([['history0977', '0977', '0470']])(
    'includes both codes in %s content, metadata and structured data',
    (id, primary, alternative) => {
      const course = libraryCourses.find((entry) => entry.id === id)!;
      const metadata = courseMetadata(course);
      for (const value of [metadata.title, metadata.ogTitle, metadata.description]) {
        expect(value).toContain(primary);
        expect(value).toContain(alternative);
      }
      expect(metadata.canonical).toBe(`https://getlacuna.app/courses/${id}/`);
      for (const selected of [course, undefined]) {
        const doc = new DOMParser().parseFromString(
          renderToStaticMarkup(<CoursePage course={selected} />),
          'text/html',
        );
        const heading = selected
          ? doc.querySelector('h1')
          : doc.querySelector(`a[href="/courses/${id}/"]`);
        expect(heading?.textContent).toContain(primary);
        expect(heading?.textContent).toContain(alternative);
      }
      const head = new DOMParser().parseFromString(renderHead(`/courses/${id}/`), 'text/html');
      const data = JSON.parse(
        head.querySelector('script[type="application/ld+json"]')!.textContent!,
      );
      expect(data.name).toContain(primary);
      expect(data.name).toContain(alternative);
      expect(data.url).toBe(metadata.canonical);
    },
  );

  it('gives each Physics grading variant its own course page', () => {
    for (const code of ['0972', '0625']) {
      const course = libraryCourses.find((entry) => entry.code === code)!;
      expect(courseMetadata(course).title).toContain(code);
      expect(course.alternativeCodes).toBeUndefined();
      expect(courseMetadata(course).canonical).toBe(`https://getlacuna.app/courses/${course.id}/`);
    }
  });

  it('advertises every course in both source crawl files', () => {
    for (const path of ['public/sitemap.xml', 'public/llms.txt']) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('https://getlacuna.app/courses/');
      for (const course of libraryCourses) {
        expect(source).toContain(`https://getlacuna.app/courses/${course.id}/`);
      }
    }
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

  it('renders publication provenance and a minimal report for each public course page', () => {
    for (const course of libraryCourses) {
      const { unmount } = render(<CoursePage course={course} />);
      const provenance = screen.getByRole('region', { name: 'Course provenance' });
      expect(within(provenance).getAllByText('Lacuna')).toHaveLength(2);
      expect(within(provenance).getByText(String(course.revision))).toBeInTheDocument();
      expect(within(provenance).queryByText('Revision date')).not.toBeInTheDocument();
      const report = within(provenance).getByRole('link', { name: 'Report a mistake' });
      const url = new URL(report.getAttribute('href')!);
      expect([...url.searchParams]).toEqual([
        ['title', `Course mistake: ${course.id}`],
        ['body', `Course: ${course.id}\nRevision: ${course.revision}`],
      ]);
      fireEvent.change(within(provenance).getByRole('textbox'), { target: { value: 'card: 123' } });
      expect(new URL(report.getAttribute('href')!).searchParams.get('body')).toBe(
        `Course: ${course.id}\nRevision: ${course.revision}\nItem reference: card: 123`,
      );
      unmount();
    }
  });
});
