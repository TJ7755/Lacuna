import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Menu } from './Menu';

function renderMenu(overrides?: {
  onFirst?: () => void;
  onSecond?: () => void;
  secondDisabled?: boolean;
}) {
  const onFirst = overrides?.onFirst ?? vi.fn();
  const onSecond = overrides?.onSecond ?? vi.fn();
  render(
    <Menu
      label="More ways to add cards"
      items={[
        { label: 'New sequence', onSelect: onFirst },
        { label: 'New occlusion', onSelect: onSecond, disabled: overrides?.secondDisabled },
        { label: 'Import cards', onSelect: vi.fn() },
      ]}
    >
      More
    </Menu>,
  );
  return { onFirst, onSecond, trigger: screen.getByLabelText('More ways to add cards') };
}

describe('Menu', () => {
  it('keeps its items out of the document until opened', () => {
    const { trigger } = renderMenu();
    expect(screen.queryByText('New sequence')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(screen.getByText('New sequence')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('calls the item and closes when one is chosen', () => {
    const onFirst = vi.fn();
    const { trigger } = renderMenu({ onFirst });

    fireEvent.click(trigger);
    fireEvent.click(screen.getByText('New sequence'));

    expect(onFirst).toHaveBeenCalledOnce();
    expect(screen.queryByText('New sequence')).not.toBeInTheDocument();
  });

  it('returns focus to the trigger on Escape', () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it('opens on ArrowDown from the trigger with the first item focused', () => {
    const { trigger } = renderMenu();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(document.activeElement).toHaveTextContent('New sequence');
  });

  it('opens on ArrowUp from the trigger with the last item focused', () => {
    const { trigger } = renderMenu();
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });

    expect(document.activeElement).toHaveTextContent('Import cards');
  });

  it('steps over a disabled item rather than focusing it', () => {
    const { trigger } = renderMenu({ secondDisabled: true });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(document.activeElement).toHaveTextContent('New sequence');

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });

    // New occlusion is disabled, so focus lands on the item after it.
    expect(document.activeElement).toHaveTextContent('Import cards');
  });

  it('wraps from the last item back to the first', () => {
    const { trigger } = renderMenu();
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    expect(document.activeElement).toHaveTextContent('Import cards');

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });

    expect(document.activeElement).toHaveTextContent('New sequence');
  });

  it('closes when a pointer goes down outside it', () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders nothing when every item is disabled', () => {
    render(
      <Menu
        label="More ways to add cards"
        items={[{ label: 'New sequence', onSelect: vi.fn(), disabled: true }]}
      >
        More
      </Menu>,
    );

    expect(screen.queryByLabelText('More ways to add cards')).not.toBeInTheDocument();
  });

  it('renders nothing when there are no items at all', () => {
    render(
      <Menu label="More ways to add cards" items={[]}>
        More
      </Menu>,
    );

    expect(screen.queryByLabelText('More ways to add cards')).not.toBeInTheDocument();
  });
});
