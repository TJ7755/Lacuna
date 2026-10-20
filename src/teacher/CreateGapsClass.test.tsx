import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CreateGapsClass } from './CreateGapsClass';

const mocks = vi.hoisted(() => ({
  createFromLink: vi.fn(),
  unlock: vi.fn(),
  markRecoveryCode: vi.fn(),
  create: vi.fn(),
  forgetConnection: vi.fn(),
  forgetKey: vi.fn(),
  remember: vi.fn(),
  download: vi.fn(),
}));
vi.mock('./connectionStore', () => ({
  createGapsConnectionStore: () => ({
    createFromLink: mocks.createFromLink,
    unlock: mocks.unlock,
    markRecoveryCode: mocks.markRecoveryCode,
    forget: mocks.forgetConnection,
    close: vi.fn(),
  }),
}));
vi.mock('../insights/ownerStore', () => ({
  createInsightsOwnerStore: () => ({
    create: mocks.create,
    forget: mocks.forgetKey,
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
  mocks.forgetConnection.mockResolvedValue(undefined);
  mocks.forgetKey.mockResolvedValue(undefined);
  mocks.create.mockResolvedValue(owner);
  mocks.remember.mockResolvedValue(true);
});
function submit() {
  fireEvent.change(screen.getByLabelText('Course link or code'), { target: { value: shareId } });
  fireEvent.submit(screen.getByRole('form', { name: 'Create class from a course link' }));
}
it('creates both secrets with one generated code and continues without downloading', async () => {
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
  expect(screen.getByLabelText('Recovery code').children[0]).toHaveTextContent(
    code.slice(0, 12).match(/.{4}/g).join('-'),
  );
  expect(screen.getByLabelText('Recovery code').children[1]).toHaveTextContent(
    code.slice(12).match(/.{4}/g).join('-'),
  );
  expect(
    screen.getByText(
      'You need this code and the file to open the class on another device. This is the only time the code is shown.',
    ),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Continue to class' })).toBeEnabled();
  expect(mocks.download).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: 'Continue to class' }));
  expect(connected).toHaveBeenCalledWith(shareId, expect.objectContaining({ connection, owner }));
});
it('rolls back a failed key step and retries with exactly one saved class and a new code', async () => {
  const saved = new Set<string>();
  const nextShareId = 'b'.repeat(32);
  mocks.createFromLink.mockImplementation(async () => {
    const id = mocks.createFromLink.mock.calls.length === 1 ? shareId : nextShareId;
    saved.add(id);
    return id;
  });
  mocks.forgetConnection.mockImplementation(async (id: string) => {
    saved.delete(id);
  });
  mocks.create.mockRejectedValueOnce(new Error('storage failure'));
  render(<CreateGapsClass onConnected={vi.fn()} />);
  submit();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not finish setting up the class. Try again.',
  );
  expect([...saved]).toEqual([]);
  expect(mocks.forgetConnection).toHaveBeenCalledWith(shareId);
  expect(mocks.forgetKey).toHaveBeenCalledWith(shareId);
  submit();
  await screen.findByRole('heading', { name: 'Class created' });
  expect([...saved]).toEqual([nextShareId]);
  expect(mocks.createFromLink).toHaveBeenCalledTimes(2);
  expect(mocks.create.mock.calls[1][1]).not.toEqual(mocks.create.mock.calls[0][1]);
});
it('rolls back both records when remembering fails', async () => {
  mocks.remember.mockResolvedValueOnce(false);
  render(<CreateGapsClass onConnected={vi.fn()} />);
  submit();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not finish setting up the class. Try again.',
  );
  expect(mocks.forgetConnection).toHaveBeenCalledWith(shareId);
  expect(mocks.forgetKey).toHaveBeenCalledWith(shareId);
  expect(screen.queryByRole('heading', { name: 'Class created' })).not.toBeInTheDocument();
});
it.each(['resolve', 'reject'] as const)(
  'rolls back after unmount while key creation is in flight (%s)',
  async (outcome) => {
    let finish!: (value: unknown) => void;
    mocks.create.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          finish = outcome === 'resolve' ? resolve : reject;
        }),
    );
    const onCreated = vi.fn();
    const view = render(<CreateGapsClass onConnected={vi.fn()} onCreated={onCreated} />);
    submit();
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    view.unmount();
    await act(async () => {
      finish(outcome === 'resolve' ? owner : new Error('storage failure'));
    });
    expect(mocks.forgetConnection).toHaveBeenCalledWith(shareId);
    expect(mocks.forgetKey).toHaveBeenCalledWith(shareId);
    expect(mocks.remember).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  },
);
it('attempts both removals and keeps the setup error when rollback fails', async () => {
  mocks.create.mockRejectedValueOnce(new Error('key failure'));
  mocks.forgetConnection.mockRejectedValueOnce(new Error('connection removal failure'));
  mocks.forgetKey.mockRejectedValueOnce(new Error('key removal failure'));
  render(<CreateGapsClass onConnected={vi.fn()} />);
  submit();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not finish setting up the class. Try again.',
  );
  expect(mocks.forgetConnection).toHaveBeenCalledWith(shareId);
  expect(mocks.forgetKey).toHaveBeenCalledWith(shareId);
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
    expect(screen.getByRole('button', { name: 'Continue to class' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(writeText).toHaveBeenCalledWith(
      mocks.createFromLink.mock.calls[0][1].match(/.{4}/g).join('-'),
    );
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

it.each(['resolve', 'reject'] as const)(
  'keeps Continue available after a download %s',
  async (outcome) => {
    mocks.download.mockImplementationOnce(() =>
      outcome === 'resolve' ? Promise.resolve() : Promise.reject(new Error('download failed')),
    );
    const connected = vi.fn();
    render(<CreateGapsClass onConnected={connected} />);
    submit();
    await screen.findByRole('heading', { name: 'Class created' });
    expect(screen.getByRole('button', { name: 'Continue to class' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Download class recovery file' }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledWith(shareId));
    if (outcome === 'reject')
      expect(await screen.findByRole('alert')).toHaveTextContent('Could not download');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to class' }));
    expect(connected).toHaveBeenCalledWith(shareId, expect.objectContaining({ connection, owner }));
  },
);
