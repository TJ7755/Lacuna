import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CardEditorActions } from './CardEditorActions';

function renderActions(editing: boolean) {
  render(
    <CardEditorActions
      editing={editing}
      canSave
      addedCount={0}
      isTouchMode={false}
      onCancel={vi.fn()}
      onSave={vi.fn()}
      saveAddRef={createRef()}
      saveRef={createRef()}
    />,
  );
}

it('puts Add card on its own full-width row above the other two actions', () => {
  renderActions(false);
  expect(screen.getByRole('button', { name: 'Add card' })).toHaveClass('order-first', 'col-span-2');
  expect(screen.getByRole('button', { name: 'Add card' }).parentElement).toHaveClass('grid-cols-2');
});

it('keeps two actions in one row while editing', () => {
  renderActions(true);
  expect(screen.getByRole('button', { name: 'Save changes' })).not.toHaveClass('col-span-2');
});
