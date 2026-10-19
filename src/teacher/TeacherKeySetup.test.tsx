import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { TeacherKeySetup } from './TeacherKeySetup';
import { serialiseInsightsRecoveryFile } from '../insights/recoveryFile';
import type { InsightsRecovery } from '../insights/envelope';
import type * as OwnerStoreModule from '../insights/ownerStore';

const store = vi.hoisted(() => ({
  create: vi.fn(),
  restore: vi.fn(),
  unlock: vi.fn(),
  close: vi.fn(),
}));
vi.mock('../insights/ownerStore', async (importOriginal) => ({
  ...(await importOriginal<typeof OwnerStoreModule>()),
  createInsightsOwnerStore: () => store,
}));
const shareId = 'a'.repeat(32);
const passphrase = 'a long offline teacher recovery phrase';
const recovery: InsightsRecovery = {
  v: 1,
  recipient: { keyId: 'b'.repeat(64), publicKey: btoa('public-key') },
  iterations: 600_000,
  salt: btoa('1234567890123456'),
  n: btoa('123456789012'),
  c: btoa('encrypted-private-key'),
};

beforeEach(() => {
  vi.clearAllMocks();
  store.create.mockResolvedValue({ recovery });
  store.restore.mockResolvedValue({ recovery });
  store.unlock.mockResolvedValue({ recovery });
});
function show() {
  render(<TeacherKeySetup onClose={vi.fn()} />);
}
function fillCreate(phrase = passphrase, repeat = phrase) {
  fireEvent.change(screen.getByLabelText(/Published course link/), {
    target: { value: `https://getlacuna.app/#/s/${shareId}` },
  });
  fireEvent.change(screen.getByLabelText(/^Recovery passphrase/), { target: { value: phrase } });
  fireEvent.change(screen.getByLabelText('Repeat recovery passphrase'), {
    target: { value: repeat },
  });
}

it('validates a new passphrase before creating a key', () => {
  show();
  fillCreate('short');
  fireEvent.click(screen.getByRole('button', { name: 'Prepare teacher key' }));
  expect(screen.getByRole('alert')).toHaveTextContent('at least 16 characters');
  fillCreate(passphrase, 'another long but different phrase');
  fireEvent.click(screen.getByRole('button', { name: 'Prepare teacher key' }));
  expect(screen.getByRole('alert')).toHaveTextContent('do not match');
  expect(store.create).not.toHaveBeenCalled();
});

it('offers a recovery download only after persistence succeeds without claiming connection', async () => {
  show();
  fillCreate();
  fireEvent.click(screen.getByRole('button', { name: 'Prepare teacher key' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Teacher key saved');
  expect(store.create).toHaveBeenCalledWith(shareId, passphrase);
  expect(screen.getByRole('button', { name: 'Download encrypted recovery file' })).toBeEnabled();
  expect(screen.getByText(/Key setup does not start reporting/)).toBeInTheDocument();
  expect(screen.queryByDisplayValue(passphrase)).not.toBeInTheDocument();
  expect(store.close).toHaveBeenCalled();
});

it('does not claim a saved key or offer a file after a failed storage commit', async () => {
  store.create.mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
  show();
  fillCreate();
  fireEvent.click(screen.getByRole('button', { name: 'Prepare teacher key' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Download encrypted recovery file' }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText(/^Recovery passphrase/)).toHaveValue('');
});

it('rejects a malformed recovery file before attempting a restore, then accepts its bound course', async () => {
  show();
  fireEvent.change(screen.getByLabelText('Key action'), { target: { value: 'restore' } });
  const choose = (text: string) => {
    const file = new File([text], 'teacher.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText(/Encrypted recovery file/), {
      target: { files: [file] },
    });
    fireEvent.change(screen.getByLabelText(/^Recovery passphrase/), {
      target: { value: passphrase },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Restore teacher key' }));
  };
  choose('{"privateKey":"wrong file"}');
  expect(await screen.findByRole('alert')).toHaveTextContent('supported Gaps');
  expect(store.restore).not.toHaveBeenCalled();
  choose(serialiseInsightsRecoveryFile(shareId, recovery));
  await waitFor(() => expect(store.restore).toHaveBeenCalledWith(shareId, recovery, passphrase));
  expect(await screen.findByRole('status')).toHaveTextContent('Teacher key saved');
});

it('does not create a replacement while looking for an existing key', async () => {
  store.unlock.mockResolvedValue(null);
  show();
  fireEvent.change(screen.getByLabelText('Key action'), { target: { value: 'download' } });
  fireEvent.change(screen.getByLabelText(/Published course link/), { target: { value: shareId } });
  fireEvent.change(screen.getByLabelText('Recovery passphrase'), { target: { value: passphrase } });
  fireEvent.click(screen.getByRole('button', { name: 'Open saved key' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No teacher key is saved');
  expect(store.create).not.toHaveBeenCalled();
  expect(store.unlock).toHaveBeenCalledWith(shareId, passphrase);
});

it('does not restore an earlier file after switching away and back to restore mode', async () => {
  show();
  fireEvent.change(screen.getByLabelText('Key action'), { target: { value: 'restore' } });
  fireEvent.change(screen.getByLabelText(/Encrypted recovery file/), {
    target: {
      files: [new File([serialiseInsightsRecoveryFile(shareId, recovery)], 'teacher.json')],
    },
  });
  fireEvent.change(screen.getByLabelText('Key action'), { target: { value: 'download' } });
  fireEvent.change(screen.getByLabelText('Key action'), { target: { value: 'restore' } });
  fireEvent.change(screen.getByLabelText('Recovery passphrase'), { target: { value: passphrase } });
  fireEvent.click(screen.getByRole('button', { name: 'Restore teacher key' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('supported Gaps');
  expect(store.restore).not.toHaveBeenCalled();
});
