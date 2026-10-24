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

  it.each([
    ['history0977', '0977', '0470'],
  ])(
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

  it('publishes the Religious Studies scope, counts and stable destination', () => {
    const course = libraryCourses.find(({ id }) => id === 'religiousstudies8062')!;
    const metadata = courseMetadata(course);
    expect(metadata.title).toBe('Religious Studies 8062 revision — AQA GCSE | Lacuna');
    expect(metadata.canonical).toBe('https://getlacuna.app/courses/religiousstudies8062/');
    expect(metadata.description).toContain(
      '1,218 flashcards, 115 notes and 115 exam-style practice sets',
    );
    render(<CoursePage course={course} />);
    expect(screen.getByText(course.summary)).toHaveTextContent('optional Themes A–F');
    expect(screen.getByText(course.summary)).toHaveTextContent('1, 1, 4 and 6-mark');
    expect(screen.getByText('1,380 marks of practice')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start revising' })).toHaveAttribute(
      'href',
      'https://getlacuna.app/#/s/e85fc39e709074d58669c2d8bfd723bb',
    );
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

  it('lists each subject once using British list formatting in the index description', () => {
    const subjects = new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(
      [...new Set(libraryCourses.map(({ subject }) => subject))],
    );
    expect(courseMetadata().description).toBe(
      `Free GCSE and IGCSE revision courses for ${subjects}, with flashcards, notes and exam-style practice planned to your exam date.`,
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
