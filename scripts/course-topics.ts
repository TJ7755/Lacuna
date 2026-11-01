import type { Plugin } from 'vite';
import { libraryCourses } from '../apps/web/src/library/catalogue.ts';
import {
  courseBoardPath,
  courseSubjectPath,
  courseTopicPath,
} from '../apps/web/src/pages/courses/topic-paths.ts';
import samples from '../apps/web/src/pages/courses/topic-samples.json' with { type: 'json' };

export interface TopicSample {
  id: string;
  title: string;
  points: { code: string; title: string }[];
  flashcards: { question: string; answer: string }[];
  questions: { question: string; answer: string }[];
}
export interface CourseSamples {
  courseId: string;
  specificationCode: string;
  specificationTitle: string;
  topics: TopicSample[];
}
const origin = 'https://getlacuna.app';
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
const link = (path: string, title: string) => `<a href="${escape(path)}">${escape(title)}</a>`;
function page(
  path: string,
  title: string,
  description: string,
  body: string,
  structured?: object,
): string {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} | Lacuna</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${origin}${path}"><meta property="og:type" content="website"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${origin}${path}"><style>body{margin:0;background:#faf9f6;color:#222;font:18px/1.6 system-ui,sans-serif}header,main,footer{max-width:960px;margin:auto;padding:24px}a{color:#285b36;display:inline-block;min-height:44px;padding:4px 0;box-sizing:border-box}a:focus-visible,summary:focus-visible{outline:3px solid #285b36;outline-offset:4px}.skip{position:absolute;left:-9999px}.skip:focus{left:24px;background:white}article{border-top:1px solid #ccc;padding:20px 0}h1{line-height:1.15;font-size:2.6rem}summary{cursor:pointer;min-height:44px}nav{display:flex;gap:24px;flex-wrap:wrap}</style>${structured ? `<script type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script>` : ''}</head><body><a class="skip" href="#content">Skip to content</a><header>${link('/courses/', 'Lacuna courses')}</header><main id="content"><h1>${escape(title)}</h1><p>${escape(description)}</p>${body}</main><footer>Original Lacuna revision material. Independent of the awarding bodies.</footer></body></html>`;
}
const list = (items: string[]) => `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
export function generateTopicPages(input: readonly CourseSamples[]): Map<string, string> {
  const assertKeys = (value: object, allowed: string[]) => {
    if (Object.keys(value).some((key) => !allowed.includes(key)))
      throw new Error(
        'Unapproved sample field. Only original samples and specification codes and titles may be published.',
      );
  };
  for (const source of input) {
    if (
      !libraryCourses.some(
        (course) => course.id === source.courseId && course.shareUrl && course.author === 'Lacuna',
      )
    )
      throw new Error('Samples require a published Lacuna course.');
    assertKeys(source, ['courseId', 'specificationCode', 'specificationTitle', 'topics']);
    for (const topic of source.topics) {
      assertKeys(topic, ['id', 'title', 'points', 'flashcards', 'questions']);
      for (const point of topic.points) assertKeys(point, ['code', 'title']);
      for (const sample of [...topic.flashcards, ...topic.questions])
        assertKeys(sample, ['question', 'answer']);
    }
  }
  const pages = new Map<string, string>();
  const add = (path: string, html: string) => {
    if (pages.has(path)) throw new Error(`Duplicate topic path: ${path}`);
    pages.set(path, html);
  };
  const boards = new Map<string, { title: string; links: string[] }>();
  const sources = libraryCourses
    .filter((course) => course.shareUrl)
    .map(
      (course) =>
        input.find((entry) => entry.courseId === course.id) ?? {
          courseId: course.id,
          specificationCode: course.code,
          specificationTitle: course.subject,
          topics: [],
        },
    );
  for (const source of sources) {
    const course = libraryCourses.find(
      (item) => item.id === source.courseId && item.shareUrl && item.author === 'Lacuna',
    );
    if (!course) throw new Error(`Samples require a published Lacuna course: ${source.courseId}`);
    const subject = courseSubjectPath(course);
    const board = courseBoardPath(course);
    const boardEntry = boards.get(board) ?? { title: course.board, links: [] };
    boardEntry.links.push(link(subject, `${course.subject} ${course.code}`));
    boards.set(board, boardEntry);
    add(
      subject,
      page(
        subject,
        `${course.subject} ${course.code} revision topics`,
        `Explore original ${course.qualification} revision samples and specification references.`,
        `<nav>${link(board, course.board)}${link(`/courses/${course.id}/`, 'About this course')}</nav>${source.topics.length ? list(source.topics.map((topic) => link(courseTopicPath(course, topic.id), topic.title))) : '<p>Topic samples are being prepared. Open the published course to start revising.</p>'}${link(course.shareUrl!, 'Open this course in Lacuna')}`,
      ),
    );
    for (const topic of source.topics) {
      if (!topic.points.length || !topic.flashcards.length || !topic.questions.length)
        throw new Error('Each topic needs references, flashcards and practice questions.');
      const path = courseTopicPath(course, topic.id);
      const title = `${topic.title} — ${course.subject} ${course.code}`;
      const description = `Revise ${topic.title} with original Lacuna flashcards and practice questions for ${course.qualification} ${course.subject}.`;
      const examples = (heading: string, values: TopicSample['questions']) =>
        `<section><h2>${heading}</h2>${values.map((item) => `<article><h3>${escape(item.question)}</h3><details><summary>Show answer</summary><p>${escape(item.answer)}</p></details></article>`).join('')}</section>`;
      add(
        path,
        page(
          path,
          title,
          description,
          `<nav>${link(subject, `${course.subject} topics`)}${link(board, course.board)}</nav><h2>Specification references</h2><p>${escape(source.specificationCode)}: ${escape(source.specificationTitle)}</p>${list(topic.points.map((point) => `${escape(point.code)}: ${escape(point.title)}`))}${examples('Sample flashcards', topic.flashcards)}${examples('Practice questions', topic.questions)}<h2>Start revising</h2><p>Import the published course into Lacuna to study these topics.</p>${link(course.shareUrl!, 'Open this course in Lacuna')}<h2>More topics</h2>${list(source.topics.filter((sibling) => sibling.id !== topic.id).map((sibling) => link(courseTopicPath(course, sibling.id), sibling.title)))}`,
          {
            '@context': 'https://schema.org',
            '@type': 'LearningResource',
            name: title,
            description,
            url: `${origin}${path}`,
            inLanguage: 'en-GB',
            learningResourceType: ['Flashcard', 'Practice question'],
            isAccessibleForFree: true,
            provider: { '@type': 'Organization', name: 'Lacuna', url: origin },
          },
        ),
      );
    }
  }
  for (const [path, board] of boards)
    add(
      path,
      page(
        path,
        `${board.title} revision courses`,
        'Choose a subject to explore original revision resources.',
        list(board.links),
      ),
    );
  return pages;
}
export function topicSitemap(pages: ReadonlyMap<string, string>): string {
  const paths = new Set([
    '/',
    '/compare/quizlet/',
    '/courses/',
    ...libraryCourses.map((course) => `/courses/${course.id}/`),
    ...pages.keys(),
  ]);
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[
    ...paths,
  ]
    .sort()
    .map((path) => `<url><loc>${origin}${escape(path)}</loc></url>`)
    .join('')}</urlset>`;
}
export function topicPagesPlugin(): Plugin {
  return {
    name: 'lacuna-topic-pages',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler() {
        const pages = generateTopicPages(samples);
        for (const [path, source] of pages)
          this.emitFile({ type: 'asset', fileName: `${path.slice(1)}index.html`, source });
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: topicSitemap(pages) });
      },
    },
  };
}
