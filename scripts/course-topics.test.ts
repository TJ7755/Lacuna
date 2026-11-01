import { describe, expect, it } from 'vitest';
import { generateTopicPages, topicSitemap, type CourseSamples } from './course-topics.ts';
import { topicSlug } from '../apps/web/src/pages/courses/topic-paths.ts';

const source: CourseSamples = {
  courseId: 'biology4bi1',
  specificationCode: '4BI1',
  specificationTitle: 'Biology',
  topics: [
    {
      id: 'cell-structure',
      title: 'Cell structure',
      points: [{ code: '2.2', title: 'Cells' }],
      flashcards: [{ question: 'What stores genetic information?', answer: 'DNA.' }],
      questions: [{ question: 'Name a cell structure.', answer: 'The nucleus.' }],
    },
  ],
};
describe('static topic pages', () => {
  it('creates stable lowercase human-readable slugs', () => {
    expect(topicSlug('Pearson Edexcel')).toBe('pearson-edexcel');
    expect(topicSlug('Cells & tissues: 2.2')).toBe('cells-tissues-2-2');
    expect(() => topicSlug('!')).toThrow();
  });
  it('rejects specification prose fields rather than accidentally publishing them', () => {
    const invalid = structuredClone(source);
    Object.assign(invalid.topics[0].points[0], {
      description: 'Copyrighted specification wording',
    });
    expect(() => generateTopicPages([invalid])).toThrow('Unapproved sample field');
  });
  it('renders hierarchy and samples without application JavaScript', () => {
    const pages = generateTopicPages([source]);
    expect(pages.size).toBeGreaterThan(3);
    const html = [...pages.values()].find((value) => value.includes('Sample flashcards'))!;
    expect(html).toContain('DNA.');
    expect(html).toContain('application/ld+json');
    expect(html).toContain('rel="canonical"');
    expect(html).not.toContain('type="module"');
    expect(html).toContain('Skip to content');
  });
  it('includes every generated page in the sitemap', () => {
    const pages = generateTopicPages([source]);
    const sitemap = topicSitemap(pages);
    for (const path of pages.keys())
      expect(sitemap).toContain(`https://getlacuna.app${path}</loc>`);
  });
  it('rejects slug collisions', () => {
    expect(() =>
      generateTopicPages([{ ...source, topics: [...source.topics, source.topics[0]] }]),
    ).toThrow('Duplicate topic path');
  });
});
