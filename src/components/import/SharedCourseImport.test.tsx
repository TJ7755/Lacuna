import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SharedCourseImport } from './SharedCourseImport';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  clear: vi.fn(),
  notify: vi.fn(),
}));
vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    start = mocks.start;
    stop = mocks.stop;
    clear = mocks.clear;
  },
}));
vi.mock('../ui/Toast', () => ({ useToast: () => ({ notify: mocks.notify }) }));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['none'],
  speedMultiplier: () => 0,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.start.mockResolvedValue(undefined);
  mocks.stop.mockResolvedValue(undefined);
  mocks.clear.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn() },
  });
});

it('stops and clears the active QR camera when Stop scanning is pressed', async () => {
  render(<SharedCourseImport />);
  fireEvent.click(screen.getByRole('button', { name: 'Scan QR code' }));
  await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Stop scanning' }));
  await waitFor(() => expect(mocks.stop).toHaveBeenCalledOnce());
  expect(mocks.clear).toHaveBeenCalledOnce();
});

it('releases a camera that finishes starting after the importer closes', async () => {
  let started!: () => void;
  mocks.start.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        started = resolve;
      }),
  );
  const view = render(<SharedCourseImport />);
  fireEvent.click(screen.getByRole('button', { name: 'Scan QR code' }));
  await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  view.unmount();
  await act(async () => {
    started();
  });
  await waitFor(() => expect(mocks.stop).toHaveBeenCalledOnce());
  expect(mocks.clear).toHaveBeenCalledOnce();
});

it('shows camera startup errors after the scanning view closes', async () => {
  mocks.start.mockRejectedValue(new Error('Camera permission denied'));
  render(<SharedCourseImport />);
  fireEvent.click(screen.getByRole('button', { name: 'Scan QR code' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Camera permission denied');
  expect(screen.getByRole('button', { name: 'Scan QR code' })).toBeEnabled();
});

it('stops a camera that finishes starting after Stop scanning is pressed', async () => {
  let started!: () => void;
  mocks.start.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        started = resolve;
      }),
  );
  render(<SharedCourseImport />);
  fireEvent.click(screen.getByRole('button', { name: 'Scan QR code' }));
  await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Stop scanning' }));
  await act(async () => {
    started();
  });
  await waitFor(() => expect(mocks.stop).toHaveBeenCalledOnce());
  expect(mocks.clear).toHaveBeenCalledOnce();
});
