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

    expect(screen.queryByText('Lacuna')).not.toBeInTheDocument();
    expect(document.querySelector('[data-titlebar-native-controls="darwin"]')).toHaveClass('h-10');
    expect(screen.queryByRole('button', { name: 'Minimise' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Maximise' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(api.isMaximized).not.toHaveBeenCalled();
    expect(api.onMaximizedChange).not.toHaveBeenCalled();
  });

  it.each(['win32', 'linux'])(
    'floats unbranded controls over the shell on %s',
    async (platform) => {
      installElectronApi(platform);

      const { container } = render(<Titlebar />);

      expect(screen.queryByText('Lacuna')).not.toBeInTheDocument();
      expect(container.firstElementChild).toHaveClass('absolute', 'inset-x-0', 'top-0', 'h-8');
      expect(container.firstElementChild).not.toHaveClass('border-b', 'bg-surface');
      expect(await screen.findByRole('button', { name: 'Close' })).toHaveClass('h-8', 'w-12');
      expect(container.querySelector('.titlebar-drag')).toBeInTheDocument();
    },
  );

  it('renders no desktop chrome in a web browser', () => {
    const { container } = render(<Titlebar />);
    expect(container).toBeEmptyDOMElement();
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
