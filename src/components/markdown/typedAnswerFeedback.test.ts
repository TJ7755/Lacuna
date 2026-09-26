import { describe, expect, it } from 'vitest';
import { typedAnswerFeedbackHtml } from './typedAnswerFeedback';

function render(html: string, answer: string, cloze = false) {
  const root = document.createElement('div');
  root.innerHTML = typedAnswerFeedbackHtml(html, { answer, options: {} }, cloze);
  return root;
}

describe('typed answer feedback', () => {
  it('aligns words across inline formatting and separate paragraphs', () => {
    const root = render(
      '<p>a <strong>light</strong>er timetable</p><p>tomorrow</p>',
      'a timetable tomorrow',
    );
    expect([...root.querySelectorAll('mark')].map((mark) => mark.textContent).join('')).toBe(
      'lighter',
    );
    expect(root.querySelector('strong')).toHaveTextContent('light');
    expect(root.querySelectorAll('p')).toHaveLength(2);
  });

  it('compares multiple cloze answers without highlighting their context', () => {
    const root = render(
      '<p><span class="cloze-reveal">Paris</span> and <span class="cloze-reveal">London</span> are capitals.</p>',
      'Paris',
      true,
    );
    expect(root.querySelector('mark')).toHaveTextContent('London');
    expect(root.querySelectorAll('mark')).toHaveLength(1);
    expect(root).toHaveTextContent('are capitals.');
  });

  it('treats submitted HTML as text, never as markup', () => {
    const root = render('<p>safe</p>', '<img src=x onerror=alert(1)>');
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('[aria-label="Submitted response"]')).toHaveTextContent(
      '<img src=x onerror=alert(1)>',
    );
  });

  it('retains media and mathematical markup', () => {
    const root = render(
      '<p>energy</p><img src="diagram.png"><span class="katex"><span>E</span><span>E</span></span>',
      'energy',
    );
    expect(root.querySelector('img')).toHaveAttribute('src', 'diagram.png');
    expect(root.querySelector('.katex')).toHaveTextContent('EE');
    expect(root.querySelector('mark')).toBeNull();
  });
});
