import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { GapsConnectionExport } from './GapsConnectionExport';

const { credentials, seal } = vi.hoisted(() => ({ credentials: vi.fn(), seal: vi.fn() }));
vi.mock('../shareLinks/credentials', () => ({ readShareCredentials: credentials }));
vi.mock('./connectionFile', () => ({
  sealGapsConnection: seal,
  GapsConnectionFileError: class extends Error {},
}));
beforeEach(() => {
  credentials.mockReset();
  seal.mockReset();
});
const phrase = 'several separate words for this transfer';

it('requires matching strong passphrases before reading the ownership credential', async () => {
  render(<GapsConnectionExport shareId={'a'.repeat(32)} courseName="Biology" />);
  fireEvent.click(screen.getByRole('button', { name: 'Connect to Gaps' }));
  fireEvent.change(screen.getByLabelText(/^Connection passphrase/), { target: { value: 'short' } });
  fireEvent.click(screen.getByRole('button', { name: 'Download connection file' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('16');
  expect(credentials).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(/^Connection passphrase/), { target: { value: phrase } });
  fireEvent.change(screen.getByLabelText('Repeat connection passphrase'), {
    target: { value: 'different' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Download connection file' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('do not match');
  expect(credentials).not.toHaveBeenCalled();
});

it('refuses missing credentials and clears passphrases after the attempt', async () => {
  credentials.mockResolvedValue(null);
  render(<GapsConnectionExport shareId={'a'.repeat(32)} courseName="Biology" />);
  fireEvent.click(screen.getByRole('button', { name: 'Connect to Gaps' }));
  for (const name of ['Connection passphrase', 'Repeat connection passphrase'])
    fireEvent.change(screen.getByLabelText(new RegExp(`^${name}`)), { target: { value: phrase } });
  fireEvent.click(screen.getByRole('button', { name: 'Download connection file' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('published'));
  expect(screen.getByLabelText(/^Connection passphrase/)).toHaveValue('');
  expect(seal).not.toHaveBeenCalled();
});
