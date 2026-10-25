import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CardTypePicker } from './CardTypePicker';

describe('CardTypePicker', () => {
  it('keeps import outside the type group before revealing the further types', () => {
    const onChange = vi.fn();
    const onNewSequence = vi.fn();
    const onNewOcclusion = vi.fn();
    render(
      <CardTypePicker
        value="front_back"
        onChange={onChange}
        onNewSequence={onNewSequence}
        onNewOcclusion={onNewOcclusion}
        sources={() => <button type="button">Import cards</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Front / back' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('button', { name: 'Numeric answer' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Card type' })).not.toContainElement(
      screen.getByRole('button', { name: 'Import cards' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'More card types' }));
    // More hands its focus to the first type it revealed.
    expect(screen.getByRole('button', { name: 'Basic (reversed)' })).toHaveFocus();
    expect(screen.getByRole('group', { name: 'Card type' })).not.toContainElement(
      screen.getByRole('button', { name: 'Import cards' }),
    );

    // Kinds with editors of their own open them rather than becoming the card's type.
    fireEvent.click(screen.getByRole('button', { name: 'Sequence' }));
    fireEvent.click(screen.getByRole('button', { name: 'Image occlusion' }));
    expect(onNewSequence).toHaveBeenCalledOnce();
    expect(onNewOcclusion).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Audio' }));
    expect(onChange).toHaveBeenCalledWith('audio');
  });

  it('keeps the selected further type visible when the rest are collapsed', () => {
    const onChange = vi.fn();
    render(<CardTypePicker value="working" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Working' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Numeric answer' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More card types' }));
    expect(screen.getByRole('button', { name: 'Basic (reversed)' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Fewer card types' }));
    expect(screen.getByRole('button', { name: 'More card types' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Working' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Numeric answer' })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    // Editing an existing card offers no other editors.
    expect(screen.queryByRole('button', { name: 'Sequence' })).not.toBeInTheDocument();
  });
});
