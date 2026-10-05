import { expect, test } from '@playwright/test';

test('renders Mermaid notes with safe fallback and theme updates', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand Welcome to Lacuna' }).click();
  await page.getByRole('link', { name: 'Core concepts & rendering' }).click();
  await page.getByRole('button', { name: 'Author mode' }).click();
  await expect(page.locator('[data-lesson-workspace-mode="edit"]')).toBeVisible();
  await page.getByRole('button', { name: 'Add note' }).click();
  await page.getByPlaceholder('Note title').fill('Revision diagram');
  await page
    .getByPlaceholder('Write your notes in Markdown…')
    .fill(
      [
        '```mermaid',
        'flowchart TD',
        '  A[Recall] --> B[Review]',
        '```',
        '',
        '[[Revision|Revision notes]]',
        '',
        '```mermaid',
        'this is invalid Mermaid syntax',
        '```',
      ].join('\n'),
    );

  const diagram = page.locator('pre.lacuna-mermaid[data-mermaid-rendered]');
  await expect(diagram.locator('svg')).toBeVisible();
  await expect(diagram.locator('.lacuna-mermaid-rendered')).toContainText('Recall');
  await expect(page.locator('.lacuna-wikilink')).toHaveText('Revision notes');
  const fallback = page.locator('pre.lacuna-mermaid[data-mermaid-error]');
  await expect(fallback).toContainText('this is invalid Mermaid syntax');
  await expect(diagram.locator('script, [onclick], [onload]')).toHaveCount(0);

  const previousTheme = await diagram.getAttribute('data-mermaid-theme');
  const previousSvg = await diagram.locator('svg').evaluate((svg) => svg.outerHTML);
  await page.evaluate(() => document.documentElement.classList.toggle('dark'));
  await expect(diagram).toHaveAttribute(
    'data-mermaid-theme',
    previousTheme === 'dark' ? 'light' : 'dark',
  );
  await expect
    .poll(() => diagram.locator('svg').evaluate((svg) => svg.outerHTML))
    .not.toBe(previousSvg);
  await diagram.getByText('Diagram source', { exact: true }).click();
  await expect(diagram.locator('.lacuna-mermaid-source code')).toContainText(
    'A[Recall] --> B[Review]',
  );
});
