import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShortcutsSection } from './ShortcutsSection';

const notify = vi.fn();

vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ notify }),
}));

describe('ShortcutsSection', () => {
  beforeEach(() => {
    localStorage.clear();
    notify.mockReset();
  });

  it('rejects a key already assigned to another study action', () => {
    render(<ShortcutsSection />);
    fireEvent.click(screen.getByRole('button', { name: /Mark correct/ }));
    fireEvent.keyDown(window, { key: 'n' });

    expect(notify).toHaveBeenCalledWith(
      'That key is already assigned to Mark incorrect (silent mode).',
      'negative',
    );
    expect(screen.getByText('Press a key…')).toBeInTheDocument();
  });
});
