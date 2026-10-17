import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedPills } from './SegmentedPills';
import { PillToggleGroup } from '../cards/PillToggleGroup';
import { QuestionSegmented } from '../questions/QuestionSegmented';

const options = [
  { value: 'a', label: 'First' },
  { value: 'b', label: 'Second' },
];

describe('shared pill choices', () => {
  it('preserves radio semantics and roving keyboard selection for Settings', () => {
    function Choices() {
      const [value, setValue] = useState('a');
      return <SegmentedPills label="Choice" options={options} value={value} onChange={setValue} />;
    }
    render(<Choices />);
    const first = screen.getByRole('radio', { name: 'First' });
    const second = screen.getByRole('radio', { name: 'Second' });
    expect(first).toHaveAttribute('tabindex', '0');
    expect(second).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(second, { key: 'Home' });
    expect(first).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(first, { key: 'End' });
    expect(second).toHaveAttribute('aria-checked', 'true');
  });

  it.each([PillToggleGroup, QuestionSegmented])(
    'preserves pressed-button semantics and option descriptions',
    (Control) => {
      const onChange = vi.fn();
      render(
        <Control
          label="Choice"
          value="a"
          onChange={onChange}
          options={[
            ...options,
            { value: 'c', label: 'Third', description: 'Existing description' },
          ]}
        />,
      );
      expect(screen.getByRole('group', { name: 'Choice' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'First' })).toHaveAttribute('aria-pressed', 'true');
      const third = screen.getByRole('button', { name: 'Third' });
      expect(third).toHaveAccessibleDescription('Existing description');
      fireEvent.click(third);
      expect(onChange).toHaveBeenCalledWith('c');
    },
  );

  it('uses the same track and selection geometry for every caller', () => {
    render(
      <>
        <SegmentedPills label="Settings choice" options={options} value="a" onChange={vi.fn()} />
        <PillToggleGroup label="Card choice" options={options} value="a" onChange={vi.fn()} />
        <QuestionSegmented label="Question choice" options={options} value="a" onChange={vi.fn()} />
      </>,
    );
    const tracks = [screen.getByRole('radiogroup'), ...screen.getAllByRole('group')];
    expect(new Set(tracks.map((track) => track.className)).size).toBe(1);
    const indicators = tracks.map((track) => track.firstElementChild?.firstElementChild);
    expect(new Set(indicators.map((indicator) => indicator?.className)).size).toBe(1);
  });

  it('reveals further options through the existing More action', () => {
    function Choices() {
      const [more, setMore] = useState(false);
      return (
        <PillToggleGroup
          label="Choice"
          options={more ? [...options, { value: 'c', label: 'Third' }] : options}
          value="a"
          onChange={vi.fn()}
          onMore={more ? undefined : () => setMore(true)}
          moreLabel="More choices"
        />
      );
    }
    render(<Choices />);
    fireEvent.click(screen.getByRole('button', { name: 'More choices' }));
    expect(screen.getByRole('button', { name: 'Third' })).toBeInTheDocument();
  });
});
