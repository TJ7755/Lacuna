import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const pagePath = 'dist/compare/quizlet/index.html';
test('public pages describe their identity and comparison intent without invented ratings', () => {
  const schema = (path) => {
    const html = readFileSync(path, 'utf8');
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(match, `${path} needs structured data`);
    return JSON.parse(match[1]);
  };
  const site = schema('dist/index.html');
  assert.equal(site['@type'], 'WebSite');
  assert.equal(site.name, 'Lacuna');
  assert.equal(site.url, 'https://getlacuna.app/');
  const comparison = schema(pagePath);
  assert.equal(comparison['@type'], 'WebPage');
  assert.equal(comparison.name, 'Lacuna vs Quizlet');
  assert.equal(comparison.isPartOf['@id'], site['@id']);
  assert.equal(comparison.about['@type'], 'WebApplication');
  assert.equal(comparison.about.name, 'Lacuna');
  assert.ok(!('aggregateRating' in comparison.about));
});
test('comparison ships crawlable HTML, metadata and resolved assets', async () => {
  assert.ok(existsSync(pagePath), 'The comparison must be a built public HTML page');
  const html = readFileSync(pagePath, 'utf8');
  const view = new Window();
  try {
    view.document.documentElement.innerHTML = html;
    const doc = view.document;
    assert.match(doc.title, /\bLacuna\b.*\bQuizlet\b/);
    assert.equal(
      doc.querySelector('link[rel="canonical"]')?.getAttribute('href'),
      'https://getlacuna.app/compare/quizlet/',
    );
    assert.ok(doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim());
    assert.equal(
      doc.querySelector('meta[property="og:url"]')?.getAttribute('content'),
      'https://getlacuna.app/compare/quizlet/',
    );
    assert.ok(doc.querySelector('main h1')?.textContent.trim(), 'Missing prerendered heading');
    assert.ok(
      doc.querySelector('main table[aria-label="Lacuna and Quizlet feature comparison"]'),
      'Missing prerendered comparison table',
    );
    assert.ok(
      doc.querySelector('main a[href="/#/share"]')?.textContent.trim(),
      'Missing crawlable entry into course sharing',
    );
  } finally {
    await view.happyDOM.close();
  }
  assert.doesNotMatch(html, /Prototype variants|ROUND 2|\/src\/|\/prototype\//);
  for (const [, asset] of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) {
    assert.ok(existsSync(`dist${asset}`), `Missing built asset ${asset}`);
  }
});
test('homepage ships prerendered landing HTML for crawlers', async () => {
  const path = 'dist/index.html';
  const html = readFileSync(path, 'utf8');
  const { Window } = await import('happy-dom');
  const view = new Window();
  try {
    view.document.documentElement.innerHTML = html;
    assert.match(view.document.title, /^Lacuna\b/);
    assert.ok(
      view.document.querySelector('main h1')?.textContent.trim(),
      'Missing prerendered heading',
    );
    assert.ok(
      view.document.querySelector('main a[href="#/"]')?.textContent.trim(),
      'Missing crawlable entry into the study app',
    );
  } finally {
    await view.happyDOM.close();
  }
  assert.match(html, /rel="canonical" href="https:\/\/getlacuna.app\/"/);
  assert.match(html, /name="description"/);
  assert.match(html, /property="og:url" content="https:\/\/getlacuna.app\/"/);
  assert.match(html, /id="how-it-works"/);
  assert.doesNotMatch(html, /<!--landing-page-->|Prototype variants|ROUND 2|\/src\//);
  for (const [, asset] of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) {
    assert.ok(existsSync(`dist${asset}`), `Missing built asset ${asset}`);
  }
});
test('sitemap uses canonical public URLs and robots advertises it', () => {
  const sitemap = readFileSync('dist/sitemap.xml', 'utf8');
  assert.match(sitemap, /https:\/\/getlacuna.app\/<\/loc>/);
  assert.match(sitemap, /https:\/\/getlacuna.app\/compare\/quizlet\/<\/loc>/);
  assert.doesNotMatch(sitemap, /#|prototype|localhost|\/share|\/course(?:\/|<)/);
  assert.match(
    readFileSync('dist/robots.txt', 'utf8'),
    /Sitemap: https:\/\/getlacuna.app\/sitemap.xml/,
  );
});

test('catalogue course URLs are advertised in the source crawl files', async () => {
  const { libraryCourses } = await import('../src/library/catalogue.ts');
  for (const path of ['public/sitemap.xml', 'public/llms.txt']) {
    const source = readFileSync(path, 'utf8');
    for (const course of libraryCourses) {
      assert.ok(
        source.includes(`https://getlacuna.app/courses/${course.id}/`),
        `${path}: ${course.id}`,
      );
    }
  }
});

test('course pages ship the complete catalogue content and metadata without JavaScript', async () => {
  const { libraryCourses } = await import('../src/library/catalogue.ts');
  const { Window } = await import('happy-dom');
  const view = new Window();
  try {
    const index = readFileSync('dist/courses/index.html', 'utf8');
    view.document.documentElement.innerHTML = index;
    assert.equal(view.document.querySelector('h1')?.textContent, 'Revision courses');
    const indexDoc = view.document;
    assert.equal(
      indexDoc.querySelector('title')?.textContent,
      'Free GCSE and IGCSE revision courses | Lacuna',
    );
    assert.equal(
      indexDoc.querySelector('link[rel="canonical"]')?.getAttribute('href'),
      'https://getlacuna.app/courses/',
    );
    const subjects = new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(
      [...new Set(libraryCourses.map(({ subject }) => subject))],
    );
    assert.equal(
      indexDoc.querySelector('meta[name="description"]')?.getAttribute('content'),
      `Free GCSE and IGCSE revision courses for ${subjects}, with flashcards, notes and exam-style practice planned to your exam date.`,
    );
    const indexText = view.document.body.textContent;
    for (const course of libraryCourses) {
      const codes = [course.code, ...(course.alternativeCodes ?? [])].join(' / ');
      const name = `${course.subject} ${codes}`;
      assert.ok(indexText.includes(name));
      assert.ok(index.includes(course.qualification));
      assert.ok(index.includes(course.summary));
      assert.ok(index.includes(`href="/courses/${course.id}/"`));
      const html = readFileSync(`dist/courses/${course.id}/index.html`, 'utf8');
      view.document.documentElement.innerHTML = html;
      const doc = view.document;
      const canonical = `https://getlacuna.app/courses/${course.id}/`;
      assert.equal(doc.querySelector('h1')?.textContent, name);
      assert.ok(doc.body.textContent.includes(course.qualification));
      assert.ok(doc.body.textContent.includes(course.summary));
      assert.deepEqual(
        [...doc.querySelectorAll('ol li')].map((li) => li.textContent),
        course.topics,
      );
      assert.equal(doc.querySelector('link[rel="canonical"]')?.getAttribute('href'), canonical);
      assert.equal(
        doc.querySelector('title')?.textContent,
        `${name} revision — ${course.qualification} | Lacuna`,
      );
      if (course.shareUrl) {
        assert.equal(
          [...doc.querySelectorAll('a')]
            .find((a) => a.textContent === 'Start revising')
            ?.getAttribute('href'),
          course.shareUrl,
        );
      } else {
        assert.ok(doc.body.textContent.includes('Coming soon'));
      }
      const stats = course.stats;
      const description = stats
        ? `Free ${course.qualification} ${course.subject} (${codes}) revision course: ${stats.cards.toLocaleString('en-GB')} flashcards, ${stats.notes.toLocaleString('en-GB')} notes and ${stats.practiceSets.toLocaleString('en-GB')} exam-style practice sets, planned to your exam date.`
        : `Free ${course.qualification} ${course.subject} (${codes}) revision course with flashcards, notes and exam-style practice, planned to your exam date.`;
      assert.equal(
        doc.querySelector('meta[name="description"]')?.getAttribute('content'),
        description,
      );
      for (const [property, value] of Object.entries({
        type: 'website',
        title: `${name} revision — ${course.qualification}`,
        description,
        url: canonical,
      })) {
        assert.equal(
          doc.querySelector(`meta[property="og:${property}"]`)?.getAttribute('content'),
          value,
        );
      }
      if (stats) {
        assert.deepEqual(
          [...doc.querySelectorAll('.course-stats li')].map((li) => li.textContent),
          [
            `${stats.cards.toLocaleString('en-GB')} flashcards`,
            `${stats.notes.toLocaleString('en-GB')} notes`,
            `${stats.practiceSets.toLocaleString('en-GB')} practice sets`,
            `${stats.practiceMarks.toLocaleString('en-GB')} marks of practice`,
          ],
        );
      }
      for (const [, asset] of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) {
        assert.ok(existsSync(`dist${asset}`), `Missing built asset ${asset}`);
      }
      const schemas = doc.querySelectorAll('script[type="application/ld+json"]');
      assert.equal(schemas.length, 1);
      assert.deepEqual(JSON.parse(schemas[0].textContent), {
        '@context': 'https://schema.org',
        '@type': 'Course',
        name,
        description: course.summary,
        url: canonical,
        inLanguage: 'en-GB',
        isAccessibleForFree: true,
        educationalLevel: course.qualification,
        provider: { '@type': 'Organization', name: 'Lacuna', url: 'https://getlacuna.app/' },
      });
      assert.doesNotMatch(html, /<!--public-page-->|\/src\//);
    }
  } finally {
    await view.happyDOM.close();
  }
});

test('Religious Studies ships its published scope and revision in crawlable HTML', () => {
  const html = readFileSync('dist/courses/religiousstudies8062/index.html', 'utf8');
  assert.match(html, /Christianity and Islam: beliefs, teachings and practices/);
  assert.match(html, /optional Themes A–F modules to choose from/);
  assert.match(html, /1, 1, 4 and 6-mark question styles/);
  assert.match(html, /e85fc39e709074d58669c2d8bfd723bb/);
  assert.match(html, /<dd>11<\/dd>/);
});
