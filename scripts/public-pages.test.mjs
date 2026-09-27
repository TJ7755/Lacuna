import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

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
  assert.match(readFileSync(pagePath, 'utf8'), /<h2[^>]*>Lacuna vs Quizlet\.<\/h2>/);
});
test('comparison ships crawlable HTML, metadata and resolved assets', () => {
  assert.ok(existsSync(pagePath), 'The comparison must be a built public HTML page');
  const html = readFileSync(pagePath, 'utf8');
  assert.match(html, /<title>Lacuna vs Quizlet/);
  assert.match(html, /rel="canonical" href="https:\/\/getlacuna.app\/compare\/quizlet\/"/);
  assert.match(html, /name="description"/);
  assert.match(html, /property="og:url" content="https:\/\/getlacuna.app\/compare\/quizlet\/"/);
  assert.match(html, /Remember it/);
  assert.match(html, /Lacuna and Quizlet feature comparison/);
  assert.match(html, /No teacher or student accounts/);
  assert.match(html, /href="\/#\/share"/);
  assert.doesNotMatch(html, /Prototype variants|ROUND 2|\/src\/|\/prototype\//);
  for (const [, asset] of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) {
    assert.ok(existsSync(`dist${asset}`), `Missing built asset ${asset}`);
  }
});
test('sitemap uses canonical public URLs and robots advertises it', () => {
  const sitemap = readFileSync('dist/sitemap.xml', 'utf8');
  assert.match(sitemap, /https:\/\/getlacuna.app\/<\/loc>/);
  assert.match(sitemap, /https:\/\/getlacuna.app\/compare\/quizlet\/<\/loc>/);
  assert.doesNotMatch(sitemap, /#|prototype|localhost|\/share|\/course/);
  assert.match(readFileSync('dist/robots.txt', 'utf8'), /Sitemap: https:\/\/getlacuna.app\/sitemap.xml/);
});
