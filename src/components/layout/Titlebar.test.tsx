import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Titlebar } from './Titlebar';

function installElectronApi(platform: string) {
  let maximizedListener: ((maximized: boolean) => void) | undefined;
  const api = {
    platform,
    isElectron: true,
    minimizeWindow: vi.fn(),
    maximizeWindow: vi.fn(),
    closeWindow: vi.fn(),
    isMaximized: vi.fn().mockResolvedValue(false),
    onMaximizedChange: vi.fn((listener: (maximized: boolean) => void) => {
      maximizedListener = listener;
      return vi.fn();
    }),
    emitMaximized: (maximized: boolean) => maximizedListener?.(maximized),
  };
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: api,
  });
  return api;
}

afterEach(() => {
  Reflect.deleteProperty(window, 'electronAPI');
});

describe('Electron titlebar', () => {
  it('reserves the native-control inset and does not duplicate controls on macOS', () => {
    const api = installElectronApi('darwin');

    render(<Titlebar />);

    expect(screen.getByText('Lacuna')).toBeInTheDocument();
    expect(document.querySelector('[data-titlebar-native-controls="darwin"]')).toHaveClass(
      'h-10',
      'pl-20',
    );
    expect(screen.getByTestId('titlebar-brand')).toHaveClass('-translate-y-[3px]');
    expect(screen.queryByRole('button', { name: 'Minimise' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Maximise' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(api.isMaximized).not.toHaveBeenCalled();
    expect(api.onMaximizedChange).not.toHaveBeenCalled();
  });

  it('retains functional custom controls on Windows', async () => {
    const api = installElectronApi('win32');

    render(<Titlebar />);

    fireEvent.click(await screen.findByRole('button', { name: 'Minimise' }));
    fireEvent.click(screen.getByRole('button', { name: 'Maximise' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(api.minimizeWindow).toHaveBeenCalledOnce();
    expect(api.maximizeWindow).toHaveBeenCalledOnce();
    expect(api.closeWindow).toHaveBeenCalledOnce();
  });

  it('renders complete maximise and restore glyphs as the window state changes', async () => {
    const api = installElectronApi('win32');

    render(<Titlebar />);

    const maximise = await screen.findByRole('button', { name: 'Maximise' });
    expect(maximise.querySelector('rect')).toHaveAttribute('width', '9');
    expect(maximise.querySelector('path')).not.toBeInTheDocument();

    act(() => api.emitMaximized(true));

    const restore = screen.getByRole('button', { name: 'Restore' });
    expect(restore.querySelector('path')).toHaveAttribute(
      'd',
      'M3.5 3.5V1.5h7v7h-2M1.5 3.5h7v7h-7z',
    );
  });
});
