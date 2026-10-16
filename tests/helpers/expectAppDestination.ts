import { fireEvent } from '@testing-library/react';
import { expect, vi } from 'vitest';

/** Check the resolved destination without relying on a browser-visible href. */
export function expectAppDestination(link: HTMLElement, destination: string) {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  try {
    expect(link).not.toHaveAttribute('href');
    fireEvent.click(link, { ctrlKey: true });
    expect(open).toHaveBeenCalledWith(destination, '_blank', 'noopener,noreferrer');
  } finally {
    open.mockRestore();
  }
}
