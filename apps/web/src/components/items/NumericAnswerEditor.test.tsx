import { createRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { NumericAnswerSpec } from '../../db/types';
import { NumericAnswerEditor, numericAnswerSpecIsValid } from './NumericAnswerEditor';

function Harness({ initialValue }: { initialValue: NumericAnswerSpec }) {
  const [value, setValue] = useState(initialValue);
  return <NumericAnswerEditor value={value} onChange={setValue} />;
}

describe('NumericAnswerEditor', () => {
  it('switches from an exact answer to a tolerance check without losing the value', () => {
    render(<Harness initialValue={{ kind: 'exact', value: '4' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tolerance' }));

    expect(screen.getByRole('textbox', { name: 'Expected answer' })).toHaveValue('4');
    expect(screen.getByRole('spinbutton', { name: 'Plus or minus' })).toHaveValue(0.01);
  });

  it('adds and removes accepted alternatives', () => {
    render(<Harness initialValue={{ kind: 'matches-one-of', values: ['3/4'] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add accepted answer' }));

    expect(screen.getByRole('textbox', { name: 'Accepted answer 2' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Accepted answer 2' }), {
      target: { value: '0.75' },
    });
    expect(screen.queryByText(/Enter at least one valid/)).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove answer' })[0]);
    expect(screen.getByRole('textbox', { name: 'Accepted answer 1' })).toHaveValue('0.75');
  });

  it('rejects variables and negative tolerances', () => {
    expect(numericAnswerSpecIsValid({ kind: 'exact', value: 'x' })).toBe(false);
    expect(numericAnswerSpecIsValid({ kind: 'within', value: '4', tolerance: -0.1 })).toBe(false);
    expect(numericAnswerSpecIsValid({ kind: 'exact', value: 'sqrt(16)' })).toBe(true);
  });
});

for (const refKind of ['object', 'callback', 'callback cleanup'] as const) {
  it(`keeps precise invalid targets and clears the ${refKind} ref on unmount`, () => {
    const objectRef = createRef<HTMLInputElement>();
    let callbackTarget: HTMLInputElement | null = null;
    let cleanupCount = 0;
    const inputRef =
      refKind === 'object'
        ? objectRef
        : (node: HTMLInputElement | null) => {
            callbackTarget = node;
            if (refKind === 'callback cleanup' && node)
              return () => {
                callbackTarget = null;
                cleanupCount += 1;
              };
          };
    const currentTarget = () => (refKind === 'object' ? objectRef.current : callbackTarget);
    const { rerender, unmount } = render(
      <NumericAnswerEditor
        value={{ kind: 'matches-one-of', values: ['4', 'x'] }}
        onChange={() => {}}
        invalid
        inputRef={inputRef}
      />,
    );
    expect(currentTarget()).toBe(screen.getByRole('textbox', { name: 'Accepted answer 2' }));
    rerender(
      <NumericAnswerEditor
        value={{ kind: 'matches-one-of', values: ['4', 'x'] }}
        onChange={() => {}}
        inputRef={inputRef}
      />,
    );
    expect(currentTarget()).toBe(screen.getByRole('textbox', { name: 'Accepted answer 1' }));
    rerender(
      <NumericAnswerEditor
        value={{ kind: 'within', value: '4', tolerance: -1 }}
        onChange={() => {}}
        invalid
        inputRef={inputRef}
      />,
    );
    expect(currentTarget()).toBe(screen.getByRole('spinbutton', { name: 'Plus or minus' }));
    rerender(
      <NumericAnswerEditor
        value={{ kind: 'within', value: '4', tolerance: -1 }}
        onChange={() => {}}
        inputRef={inputRef}
      />,
    );
    expect(currentTarget()).toBe(screen.getByRole('textbox', { name: 'Expected answer' }));
    const previousCleanupCount = cleanupCount;
    unmount();
    expect(currentTarget()).toBeNull();
    if (refKind === 'callback cleanup') expect(cleanupCount).toBe(previousCleanupCount + 1);
  });
}

it('exposes an alternative added to an initially empty answer list', () => {
  const inputRef = createRef<HTMLInputElement>();
  const { rerender, unmount } = render(
    <NumericAnswerEditor
      value={{ kind: 'matches-one-of', values: [] }}
      onChange={() => {}}
      inputRef={inputRef}
    />,
  );
  expect(inputRef.current).toBeNull();
  rerender(
    <NumericAnswerEditor
      value={{ kind: 'matches-one-of', values: ['4'] }}
      onChange={() => {}}
      inputRef={inputRef}
    />,
  );
  expect(inputRef.current).toBe(screen.getByRole('textbox', { name: 'Accepted answer 1' }));
  unmount();
  expect(inputRef.current).toBeNull();
});
