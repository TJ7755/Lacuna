import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CreateGapsClass } from './CreateGapsClass';

const mocks = vi.hoisted(() => ({
  createFromLink: vi.fn(),
  unlock: vi.fn(),
  markRecoveryCode: vi.fn(),
  create: vi.fn(),
  unlockKey: vi.fn(),
  remember: vi.fn(),
  download: vi.fn(),
}));
vi.mock('./connectionStore', () => ({
  createGapsConnectionStore: () => ({
    createFromLink: mocks.createFromLink,
    unlock: mocks.unlock,
    markRecoveryCode: mocks.markRecoveryCode,
    close: vi.fn(),
  }),
}));
vi.mock('../insights/ownerStore', () => ({
  createInsightsOwnerStore: () => ({
    create: mocks.create,
    unlock: mocks.unlockKey,
    close: vi.fn(),
  }),
}));
vi.mock('./rememberedClass', () => ({ rememberClass: mocks.remember }));
vi.mock('./classRecoveryFile', () => ({ downloadClassRecoveryFile: mocks.download }));
const shareId = 'a'.repeat(32);
const connection = { shareId };
const owner = { recipient: {} };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.createFromLink.mockResolvedValue(shareId);
  mocks.unlock.mockResolvedValue(connection);
  mocks.unlockKey.mockResolvedValue(null);
  mocks.create.mockResolvedValue(owner);
  mocks.remember.mockResolvedValue(true);
});
function submit() {
  fireEvent.change(screen.getByLabelText('Course link or code'), { target: { value: shareId } });
  fireEvent.submit(screen.getByRole('form', { name: 'Create class from a course link' }));
}
it('creates both secrets with one generated code and continues only after download', async () => {
  const connected = vi.fn();
  render(<CreateGapsClass onConnected={connected} />);
  expect(screen.queryByLabelText(/passphrase/i)).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox')).toBeChecked();
  submit();
  expect(await screen.findByRole('heading', { name: 'Class created' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Class created' })).toHaveFocus();
  const code = mocks.createFromLink.mock.calls[0][1];
  expect(code).toMatch(/^[0-9A-Z]{24}$/);
  expect(mocks.create).toHaveBeenCalledWith(shareId, code);
  expect(mocks.markRecoveryCode).toHaveBeenCalledWith(shareId);
  expect(mocks.remember).toHaveBeenCalledWith(expect.objectContaining({ connection, owner }));
  expect(screen.getByLabelText('Recovery code')).toHaveTextContent(code.match(/.{4}/g).join('-'));
  expect(
    screen.getByText(
      'You need this code and the file to open the class on another device. This is the only time the code is shown.',
    ),
  ).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Continue to class' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Download class recovery file' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Continue to class' }));
  expect(connected).toHaveBeenCalledWith(shareId, expect.objectContaining({ connection, owner }));
});
it('retries a failed key step with the same class and code', async () => {
  mocks.create.mockRejectedValueOnce(new Error('storage failure'));
  render(<CreateGapsClass onConnected={vi.fn()} />);
  submit();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not finish setting up the class. Try again.',
  );
  submit();
  await screen.findByRole('heading', { name: 'Class created' });
  expect(mocks.createFromLink).toHaveBeenCalledTimes(1);
  expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
});
it('does not remember when unchecked', async () => {
  render(<CreateGapsClass onConnected={vi.fn()} />);
  fireEvent.click(screen.getByRole('checkbox'));
  submit();
  await waitFor(() => expect(mocks.create).toHaveBeenCalled());
  expect(mocks.remember).not.toHaveBeenCalled();
});

it('copies the formatted code and resets the success label after two seconds', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(<CreateGapsClass onConnected={vi.fn()} />);
  submit();
  await screen.findByRole('heading', { name: 'Class created' });
  vi.useFakeTimers();
  try {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    });
    expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(writeText).toHaveBeenCalledWith(screen.getByLabelText('Recovery code').textContent);
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeVisible();
  } finally {
    vi.useRealTimers();
  }
});
