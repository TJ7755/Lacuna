import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ItemFixture } from '../../db/types';
import { MarkSchemeEditor } from './MarkSchemeEditor';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  const [fixtures, setFixtures] = useState<ItemFixture[]>([]);
  return <MarkSchemeEditor value={value} onChange={setValue} fixtures={fixtures} onFixturesChange={setFixtures} />;
}

describe('MarkSchemeEditor', () => {
  it('compiles valid criteria into plain-English previews and a running total', () => {
    render(<Harness initial={'[1] substitution :: 2x = 8\n[2] answer :: within 0.1 :: 4'} />);

    expect(
      screen.getByText('1 mark — substitution — any line equivalent to 2x = 8'),
    ).toBeInTheDocument();
    expect(screen.getByText('2 marks — answer — within 0.1 of 4')).toBeInTheDocument();
    expect(screen.getByText('3 marks total')).toBeInTheDocument();
  });

  it('keeps valid siblings visible when one source line is malformed', () => {
    render(<Harness initial={'[1] first :: 2 + 2\nnot a criterion\n[2] final :: equals :: 4'} />);

    expect(screen.getByText('1 mark — first — any line equivalent to 2 + 2')).toBeInTheDocument();
    expect(screen.getByText('2 marks — final — equals 4')).toBeInTheDocument();
    expect(screen.getByText(/Start the line with marks in brackets/)).toBeInTheDocument();
    expect(screen.getByText('3 marks total')).toBeInTheDocument();
  });

  it('suggests and inserts the nearest predicate for a typo', () => {
    render(<Harness initial="[1] check :: wthin" />);
    const source = screen.getByRole('textbox', { name: 'Scheme source' });
    fireEvent.click(source);

    const suggestion = screen.getByRole('option', { name: /within/i });
    expect(suggestion).toBeInTheDocument();
    fireEvent.click(suggestion);

    expect(source).toHaveValue('[1] check :: within 0.01 :: value');
  });

  it('offers mark snippets when a criterion starts with an opening bracket', () => {
    render(<Harness initial="[" />);
    const source = screen.getByRole('textbox', { name: 'Scheme source' });
    fireEvent.click(source);

    fireEvent.click(screen.getByRole('option', { name: /\[2\].*2 marks/i }));
    expect(source).toHaveValue('[2] ');
  });

  it('marks a test answer live with the shared working verifier', () => {
    render(<Harness initial={'[1] substitution :: 2x = 8\n[2] answer :: equals :: 4'} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Test student answer' }), {
      target: { value: '2x = 8\n4' },
    });
    expect(screen.getByText('3 / 3 marks')).toBeInTheDocument();
    expect(screen.getByText('2x = 8')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('flags a pinned fixture when a scheme edit changes its score', () => {
    render(<Harness initial={'[1] substitution :: 2x = 8\n[2] answer :: equals :: 4'} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Test student answer' }), {
      target: { value: '2x = 8\n4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pin as fixture' }));
    expect(screen.getByText('Expected 3, got 3')).toBeInTheDocument();
    expect(screen.getByText('Pass')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Scheme source' }), {
      target: { value: '[1] substitution :: 2x = 8' },
    });
    expect(screen.getByText('Expected 3, got 1')).toBeInTheDocument();
    expect(screen.getByText('Mismatch')).toBeInTheDocument();
  });
});
