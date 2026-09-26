import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SharedCourseImport } from './SharedCourseImport';

function Probe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

function renderImport() {
  return render(
    <MemoryRouter initialEntries={['/share']}>
      <Routes>
        <Route path="/share" element={<SharedCourseImport />} />
        <Route path="/s/:code" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

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
  renderImport();
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
  const view = renderImport();
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
  renderImport();
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
  renderImport();
  fireEvent.click(screen.getByRole('button', { name: 'Scan QR code' }));
  await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Stop scanning' }));
  await act(async () => {
    started();
  });
  await waitFor(() => expect(mocks.stop).toHaveBeenCalledOnce());
  expect(mocks.clear).toHaveBeenCalledOnce();
});

it('navigates to the link importer for a pasted share code', async () => {
  const code = 'a'.repeat(32);
  window.location.hash = '#/share';
  renderImport();
  fireEvent.change(screen.getByLabelText('Share code to import'), {
    target: { value: code },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Read code' }));
  await waitFor(() => expect(window.location.hash).toBe(`#/s/${code}`));
});

it('navigates to the link importer for a pasted full share link', async () => {
  const code = 'b'.repeat(32);
  window.location.hash = '#/share';
  renderImport();
  fireEvent.change(screen.getByLabelText('Share code to import'), {
    target: { value: `https://lacuna.example/#/s/${code}` },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Read code' }));
  await waitFor(() => expect(window.location.hash).toBe(`#/s/${code}`));
});
