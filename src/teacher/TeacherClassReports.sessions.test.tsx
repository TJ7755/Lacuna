import {
  mocks,
  course,
  callbacks,
  unlockRequest,
  Harness,
  unlock,
} from './TeacherClassReports.testSupport';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ClassPage } from './TeacherClassReports';

it('aborts a read and drops unlocked credentials when the page unmounts', async () => {
  let signal: AbortSignal | undefined;
  mocks.read.mockImplementation((options: { signal: AbortSignal }) => {
    signal = options.signal;
    return new Promise((_resolve, reject) =>
      signal!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }),
    );
  });
  const page = render(<Harness />);
  await unlock();
  await waitFor(() => expect(signal?.aborted).toBe(false));
  page.unmount();
  expect(signal?.aborted).toBe(true);
});

it('swaps in set-up when this browser has no saved teacher key', async () => {
  mocks.unlockKey.mockResolvedValue(null);
  render(<Harness />);
  await unlock();
  expect(await screen.findByRole('alert')).toHaveTextContent('no key for this class');
  fireEvent.click(screen.getByRole('button', { name: 'Set up or restore this class' }));
  expect(screen.getByRole('heading', { name: 'Protect this class' })).toBeVisible();
  await waitFor(() => expect(screen.getByLabelText('Key set-up create')).toHaveFocus());
  expect(mocks.read).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Back to unlock' }));
  expect(screen.getByLabelText('Connection passphrase')).toHaveFocus();
});

it('locks the class and removes the connection only after confirmation', async () => {
  render(<Harness />);
  await unlock();
  fireEvent.click(await screen.findByRole('button', { name: 'Lock' }));
  expect(await screen.findByRole('heading', { name: 'Unlock to see results' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /^Class settings/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Remove connection' }));
  fireEvent.click(screen.getByRole('button', { name: 'Keep connection' }));
  expect(mocks.forget).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove connection' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove from this browser' }));
  await waitFor(() => expect(mocks.forget).toHaveBeenCalledWith(course.shareId));
  expect(callbacks.onRemoved).toHaveBeenCalledOnce();
});

it('moves to the requested step when a mounted locked class receives a new request', async () => {
  const page = render(<Harness request={null} />);
  const field = await screen.findByLabelText('Connection passphrase');
  expect(field).not.toHaveFocus();
  page.rerender(<Harness request={unlockRequest} />);
  await waitFor(() => expect(screen.getByLabelText('Connection passphrase')).toHaveFocus());
  page.rerender(<Harness request={{ kind: 'setup', id: 2 }} />);
  await waitFor(() => expect(screen.getByLabelText('Key set-up create')).toHaveFocus());
});

it('does not restore a class when key recovery finishes after removal', async () => {
  let finish!: (value: unknown) => void;
  mocks.unlockKey.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<Harness />);
  await unlock();
  await waitFor(() => expect(mocks.unlockKey).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: /^Class settings/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Remove connection' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove from this browser' }));
  await waitFor(() => expect(callbacks.onRemoved).toHaveBeenCalledOnce());
  await act(async () => finish({ privateKey: {}, recipient: { keyId: 'key' } }));
  expect(screen.queryByRole('button', { name: /^Lock$/ })).not.toBeInTheDocument();
  expect(mocks.read).not.toHaveBeenCalled();
});

it('does not publish an unlock completion after the class page unmounts', async () => {
  let finish!: (value: unknown) => void;
  mocks.unlockKey.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const onUnlocked = vi.fn();
  const page = render(
    <ClassPage
      course={course}
      session={null}
      request={unlockRequest}
      onUnlocked={onUnlocked}
      onChanged={vi.fn()}
      onLock={vi.fn()}
      onRemoved={vi.fn()}
    />,
  );
  await unlock();
  await waitFor(() => expect(mocks.unlockKey).toHaveBeenCalledOnce());
  page.unmount();
  await act(async () => finish({ privateKey: {}, recipient: { keyId: 'key' } }));
  expect(onUnlocked).not.toHaveBeenCalled();
});

it('remembers by default and shows Close with an inline, cancellable Forget confirmation', async () => {
  mocks.remember.mockResolvedValue(true);
  render(<Harness />);
  expect(
    await screen.findByRole('checkbox', { name: 'Remember this class on this device' }),
  ).toBeChecked();
  await unlock();
  expect(await screen.findByRole('button', { name: 'Close' })).toBeVisible();
  expect(mocks.remember).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Forget on this device' }));
  expect(
    screen.getByText(
      'This browser will ask for both passphrases next time. Your class, reports and recovery file are not affected.',
    ),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(mocks.forgetRemembered).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Forget on this device' }));
  fireEvent.click(screen.getByRole('button', { name: 'Forget' }));
  await waitFor(() => expect(mocks.forgetRemembered).toHaveBeenCalledWith(course.shareId));
  expect(await screen.findByRole('form', { name: 'Unlock class' })).toBeVisible();
});

it('does not persist when unchecked and keeps the existing Lock action', async () => {
  render(<Harness />);
  fireEvent.click(
    await screen.findByRole('checkbox', { name: 'Remember this class on this device' }),
  );
  await unlock();
  expect(await screen.findByRole('button', { name: 'Lock' })).toBeVisible();
  expect(mocks.remember).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Forget on this device' })).not.toBeInTheDocument();
});

it('opens remembered credentials through the same revocable session path without the unlock form', async () => {
  mocks.readRemembered.mockResolvedValue({
    connection: { shareId: course.shareId },
    owner: {},
    remembered: true,
    days: new Map(),
  });
  render(<Harness />);
  expect(screen.queryByRole('form', { name: 'Unlock class' })).not.toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Close' })).toBeVisible();
  expect(mocks.unlockConnection).not.toHaveBeenCalled();
  expect(mocks.unlockKey).not.toHaveBeenCalled();
  await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
});

it('forgets a pending remember completion if removal revoked its session', async () => {
  let finish!: (value: boolean) => void;
  mocks.remember.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<Harness />);
  await unlock();
  await waitFor(() => expect(mocks.remember).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: /^Class settings/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Remove connection' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove from this browser' }));
  await waitFor(() => expect(callbacks.onRemoved).toHaveBeenCalledOnce());
  await act(async () => finish(true));
  expect(mocks.forgetRemembered).toHaveBeenCalledWith(course.shareId);
  expect(mocks.read).not.toHaveBeenCalled();
});

it('keeps failed Forget visible and retryable until cancelled or retried', async () => {
  mocks.remember.mockResolvedValue(true);
  mocks.forgetRemembered.mockRejectedValue(new Error('Deletion failed'));
  render(<Harness />);
  await unlock();
  const trigger = await screen.findByRole('button', { name: 'Forget on this device' });
  fireEvent.click(trigger);
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: /^Forget$/ }));
  const alert = await screen.findByRole('alert');
  expect(trigger.closest('header')).toContainElement(screen.getByRole('button', { name: 'Close' }));
  expect(alert).toHaveTextContent('Could not forget this class. Try again.');
  expect(alert).toHaveClass('text-negative', 'text-sm');
  expect(alert.closest('[role="group"]')).toContainElement(
    screen.getByRole('button', { name: /^Forget$/ }),
  );
  expect(screen.getByRole('button', { name: 'Close' })).toBeVisible();
  expect(screen.queryByRole('form', { name: 'Unlock class' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Forget$/ })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Forget$/ }));
  await screen.findByRole('alert');
  let finish!: () => void;
  mocks.forgetRemembered.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: /^Forget$/ }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Forget$/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await act(async () => finish());
  expect(await screen.findByRole('form', { name: 'Unlock class' })).toBeVisible();
});

it('keeps the pinned link usable when short code creation fails', async () => {
  mocks.shortCode.mockRejectedValue(new Error('offline'));
  render(<Harness />);
  await unlock();
  fireEvent.click(await screen.findByRole('button', { name: 'Share class code' }));
  fireEvent.click(screen.getByRole('button', { name: 'Publish class code' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not create a short code. Pupils can still use the join link.',
  );
  expect((screen.getByLabelText('Pupil join link') as HTMLInputElement).value).toMatch(
    /\/s\/GAPS1_/,
  );
  expect(screen.queryByLabelText('Class code')).not.toBeInTheDocument();
});

it('unlocks a code-protected class with one normalised code and no first-time setup', async () => {
  const onUnlocked = vi.fn();
  render(
    <ClassPage
      course={{ ...course, secret: 'recovery-code' }}
      session={null}
      request={unlockRequest}
      onUnlocked={onUnlocked}
      onChanged={vi.fn()}
      onLock={vi.fn()}
      onRemoved={vi.fn()}
    />,
  );
  const input = await screen.findByLabelText('Recovery code');
  expect(screen.queryAllByLabelText(/passphrase/)).toHaveLength(0);
  expect(screen.queryByRole('button', { name: 'First time? Set up' })).not.toBeInTheDocument();
  expect(input).toHaveAttribute('autocomplete', 'off');
  expect(input).toHaveAttribute('spellcheck', 'false');
  expect(input).toHaveAttribute('autocapitalize', 'characters');
  fireEvent.change(input, { target: { value: 'short' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Unlock class' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Check the recovery code. It has 24 letters and numbers.',
  );
  expect(mocks.unlockConnection).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: 'oill-2345-6789-abcd-efgh-jkmn' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Unlock class' }));
  await waitFor(() => expect(onUnlocked).toHaveBeenCalled());
  expect(mocks.unlockConnection).toHaveBeenCalledWith(course.shareId, '011123456789ABCDEFGHJKMN');
  expect(mocks.unlockKey).toHaveBeenCalledWith(course.shareId, '011123456789ABCDEFGHJKMN');
});

it('shows recovery-code feedback when WebCrypto rejects without a message', async () => {
  mocks.unlockConnection.mockRejectedValue(new DOMException('', 'OperationError'));
  render(
    <ClassPage
      course={{ ...course, secret: 'recovery-code' }}
      session={null}
      request={unlockRequest}
      onUnlocked={vi.fn()}
      onChanged={vi.fn()}
      onLock={vi.fn()}
      onRemoved={vi.fn()}
    />,
  );
  fireEvent.change(await screen.findByLabelText('Recovery code'), {
    target: { value: 'Z'.repeat(24) },
  });
  fireEvent.submit(screen.getByRole('form', { name: 'Unlock class' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not unlock. Check the recovery code.',
  );
});

it.each([true, false])(
  'separates the pupil invitation from private recovery (short code: %s)',
  async (shortCode) => {
    if (!shortCode) mocks.shortCode.mockRejectedValue(new Error('offline'));
    render(<Harness />);
    await unlock();
    fireEvent.click(await screen.findByRole('button', { name: 'Share class code' }));
    expect(screen.getAllByRole('group', { name: /give .* pupils/i })).toHaveLength(1);
    expect(screen.getAllByRole('group', { name: /keep .* private .* reopen/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Publish class code' }));
    await screen.findByLabelText('Pupil join link');
    await waitFor(() => expect(mocks.shortCode).toHaveBeenCalled());
    const pupil = screen.getAllByRole('group', { name: /give .* pupils/i });
    const privateItem = screen.getAllByRole('group', { name: /keep .* private .* reopen/i });
    expect(pupil).toHaveLength(1);
    expect(privateItem).toHaveLength(1);
    expect(within(pupil[0]).getByLabelText('Pupil join link')).toHaveAttribute(
      'value',
      expect.stringContaining('/s/GAPS1_'),
    );
    expect(within(pupil[0]).queryByLabelText('Class code') !== null).toBe(shortCode);
    expect(within(pupil[0]).queryByText(/recovery/i)).not.toBeInTheDocument();
    expect(privateItem[0]).toHaveTextContent(/recovery/i);
    expect(within(privateItem[0]).queryByRole('textbox')).not.toBeInTheDocument();
  },
);
