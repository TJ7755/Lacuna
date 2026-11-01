import { describe, expect, it } from 'vitest';
import { markdownAnswerCorrect, markdownPlainText } from './MarkdownView';
import {
  typedAnswerCorrect,
  typedAnswerFeedbackHtml,
  type TypedAnswerJudgement,
} from './typedAnswerFeedback';

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

describe('typedAnswerCorrect', () => {
  it('judges the rendered text, not the Markdown syntax', () => {
    const html = '<p>We <em>slowly</em> drove</p>';
    expect(typedAnswerCorrect(html, { answer: 'we slowly drove', options: {} })).toBe(true);
    expect(typedAnswerCorrect(html, { answer: 'we quickly drove', options: {} })).toBe(false);
  });

  it('includes authored maths exactly once and keeps its operators significant', () => {
    expect(markdownPlainText('E = $mc^2$')).toBe('E = mc^2');
    expect(markdownAnswerCorrect('E = $mc^2$', { answer: 'E =', options: {} })).toBe(false);
    expect(markdownAnswerCorrect('$-x$', { answer: 'x', options: {} })).toBe(false);
    expect(markdownAnswerCorrect('$x$', { answer: 'X', options: {} })).toBe(false);
    expect(markdownAnswerCorrect('$-x$', { answer: '-x', options: {} })).toBe(true);
  });
});

describe('Jev typed answer feedback', () => {
  function judged(html: string, judgement: TypedAnswerJudgement, answer = 'Red and blue') {
    const root = document.createElement('div');
    root.innerHTML = typedAnswerFeedbackHtml(html, { answer, options: {}, judgement }, false);
    return root;
  }

  const partial = {
    state: 'judged',
    outcome: 'incorrect',
    expected: 'Red, green and blue.',
    feedback: {
      kind: 'partial',
      parts: [
        { start: 0, end: 3, covered: true },
        { start: 5, end: 10, covered: false },
        { start: 15, end: 19, covered: null },
      ],
    },
    confidence: 0.98,
  } satisfies TypedAnswerJudgement;

  it('shows a checking state without legacy highlights or strike-throughs', () => {
    const root = judged('<p>Red, green and blue.</p>', { state: 'checking' });
    expect(root.querySelector('[data-typed-checking]')).toHaveTextContent('Red, green and blue.');
    expect(root.querySelector('[aria-label="Submitted response"]')).toHaveTextContent(
      'Red and blue',
    );
    expect(root.querySelector('mark, del, [data-typed-verdict]')).toBeNull();
  });

  it('highlights only missed parts across formatting and whitespace', () => {
    const root = judged('<p>Red,</p><p><strong>gr</strong>een and blue.</p>', partial);
    expect([...root.querySelectorAll('mark')].map((mark) => mark.textContent).join('')).toBe(
      'green',
    );
    expect(root.querySelector('strong')).toHaveTextContent('gr');
    expect(root.querySelector('[data-typed-verdict]')).toHaveTextContent('Partly right');
    expect(root.querySelector('[data-typed-verdict]')).toHaveAttribute(
      'title',
      'Marked by Jev, 98% sure',
    );
    expect(root.querySelector('del')).toBeNull();
  });

  it('retains missed-part feedback when the learner must decide the grade', () => {
    const root = judged('<p>Red, green and blue.</p>', {
      ...partial,
      outcome: 'unsure',
      confidence: undefined,
    });
    expect(root.querySelector('[data-typed-verdict="unsure"]')).toHaveTextContent('Partly right');
    expect(root.querySelector('mark')).toHaveTextContent('green');
    expect(root.querySelector('[data-typed-verdict]')).not.toHaveAttribute('title');
  });

  it('keeps a submitted HTML payload inert in both checking and judged states', () => {
    for (const judgement of [{ state: 'checking' } as const, partial]) {
      const root = judged('<p>Red, green and blue.</p>', judgement, '<img src=x onerror=alert(1)>');
      expect(root.querySelector('img')).toBeNull();
      expect(root.querySelector('[aria-label="Submitted response"]')).toHaveTextContent(
        '<img src=x onerror=alert(1)>',
      );
    }
  });
});
