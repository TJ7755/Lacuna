import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Card } from '../../db/types';
import { StudyCardFace } from './StudyCardFace';

const card = {
  id: 'typed-card',
  type: 'front_back',
  front: 'Translate the phrase',
  back: 'a lighter timetable',
} as Card;

function renderFace(typedAnswer: string, overrides = {}) {
  return render(
    <StudyCardFace
      card={card}
      side="back"
      audioCard={false}
      audioAutoplay={false}
      isTyping
      typedAnswer={typedAnswer}
      answerStrictness="standard"
      motionMultiplier={0}
      onReplayAudio={vi.fn()}
      onRevealHint={vi.fn()}
      {...overrides}
    />,
  );
}

describe('standalone numeric card answers', () => {
  it.each(['1871.', '1921.', '1.', '0.'])('shows %s as literal answer text', (back) => {
    const { container } = renderFace('', { card: { ...card, back }, isTyping: false });
    expect(container.querySelector('[data-study-face="back"]')?.textContent).toBe(back);
    expect(container.querySelector('p')?.textContent).toBe(back);
    expect(container.querySelector('ol')).toBeNull();
  });

  it.each([
    ['1871', '1871'],
    ['1871\\.', '1871.'],
    ['1.5', '1.5'],
    ['0.5', '0.5'],
    ['-1.', '-1.'],
    ['+1.', '+1.'],
  ])('preserves the numeric control %s', (back, expected) => {
    const { container } = renderFace('', { card: { ...card, back }, isTyping: false });
    expect(container.querySelector('p')?.textContent).toBe(expected);
    expect(container.querySelector('ol')).toBeNull();
  });

  it.each(['1. First answer\n2. Second answer', '1871. First answer\n1872. Second answer'])(
    'preserves a genuine ordered-list answer: %s',
    (back) => {
      const { container } = renderFace('', { card: { ...card, back }, isTyping: false });
      expect(container.querySelector('ol')).not.toBeNull();
      expect(container.querySelector('ol')?.start).toBe(Number(back.split('.')[0]));
      expect([...container.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
        'First answer',
        'Second answer',
      ]);
    },
  );

  it('shows the same literal answer while measuring the card', () => {
    const { container } = renderFace('', {
      card: { ...card, back: '1871.' },
      isTyping: false,
      measuring: true,
    });
    expect(container.querySelector('p')?.textContent).toBe('1871.');
    expect(container.querySelector('ol')).toBeNull();
  });
});

describe('inline typed answer card face', () => {
  it.each([false, true])('highlights only missing words (measuring: %s)', (measuring) => {
    const { container } = renderFace('timetable', { measuring });
    expect([...container.querySelectorAll('mark')].map((node) => node.textContent)).toEqual([
      'a',
      'lighter',
    ]);
    expect(container.querySelector('[aria-label="Submitted response"]')).toHaveTextContent(
      'timetable',
    );
    expect(container.querySelectorAll('.prose-lacuna')).toHaveLength(1);
    expect(screen.queryByText('Your answer')).not.toBeInTheDocument();
    expect(screen.queryByText('Correct answer')).not.toBeInTheDocument();
  });

  it('shows matching answers once and respects strictness', () => {
    const { container, unmount } = renderFace('A lighter timetable!', {
      answerStrictness: 'lenient',
    });
    expect(container.querySelector('[aria-label="Submitted response"]')).toBeNull();
    expect(container.querySelector('mark')).toBeNull();
    expect(screen.getByText('a lighter timetable')).toBeInTheDocument();
    unmount();
    const strict = renderFace('A lighter timetable!', { answerStrictness: 'exact' });
    expect(strict.container.querySelectorAll('mark')).toHaveLength(2);
    expect(strict.container.querySelectorAll('del')).toHaveLength(2);
  });

  it('shows only the expected answer for an empty submission', () => {
    const { container } = renderFace('   ');
    expect(container.querySelector('[aria-label="Submitted response"]')).toBeNull();
    expect(container.querySelectorAll('mark')).toHaveLength(3);
  });

  it('preserves formatting and compares rendered text rather than Markdown syntax', () => {
    const { container } = renderFace('a timetable', {
      card: { ...card, back: 'a **lighter** timetable' },
    });
    expect(container.querySelector('strong mark')).toHaveTextContent('lighter');
    expect(container.querySelector('del')).toBeNull();
  });

  it('preserves cloze context while comparing only the hidden answer', () => {
    const { container } = renderFace('Paris', {
      card: { ...card, type: 'cloze', front: 'The capital is {{c1::Paris}}.', back: '' },
    });
    expect(container).toHaveTextContent('The capital is Paris.');
    expect(container.querySelector('mark')).toBeNull();
    expect(container.querySelector('[aria-label="Submitted response"]')).toBeNull();
  });

  it('leaves ordinary cards and question faces unchanged', () => {
    const { container, unmount } = renderFace('timetable', { isTyping: false });
    expect(screen.getByText('a lighter timetable')).toBeInTheDocument();
    expect(container.querySelector('mark')).toBeNull();
    unmount();
    renderFace('timetable', { side: 'front' });
    expect(screen.getByText('Translate the phrase')).toBeInTheDocument();
  });
});
