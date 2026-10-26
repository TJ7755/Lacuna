import {
  mocks,
  course,
  latest,
  Harness,
  event,
  report,
  unlock,
} from './TeacherClassReports.testSupport';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { DAY_MS, isoDayLabel, isoDayStartMs } from '../../relay/shared/insights/index';
import { createClassSessions } from './classSessions';
import { dayLabel } from './classInsights';

it('reads only after an explicit unlock and preserves unknown, self-marked and disputed evidence', async () => {
  mocks.read.mockResolvedValue({
    unreadable: 1,
    reports: [{ slotId: 'slot', report: report('Pupil A', [event()], 2) }],
  });
  render(<Harness />);
  expect(mocks.unlockConnection).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
  await unlock();
  await waitFor(() =>
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ isoDay: latest })),
  );
  expect(screen.queryByDisplayValue('connection secret')).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue('teacher secret')).not.toBeInTheDocument();
  expect(await screen.findByText('1 report could not be read and is left out.')).toBeVisible();
  expect(screen.getByRole('table')).toBeVisible();

  const pupil = screen.getByRole('button', { name: 'Pupil A' });
  fireEvent.click(pupil);
  expect(pupil).toHaveAttribute('aria-expanded', 'true');
  const dialog = await screen.findByRole('region', { name: 'Evidence for Pupil A' });
  expect(within(dialog).getByText(/Unknown \/ 2 marks · Self marked/)).toBeInTheDocument();
  expect(within(dialog).getByText(/disputed by the pupil/)).toBeInTheDocument();
  expect(within(dialog).getByText(/shortened for this report/)).toBeInTheDocument();
  expect(within(dialog).getByText(/Membrane/)).toHaveTextContent('Membrane Unknown / 2');
  expect(within(dialog).getByText(/at least 2 more activities/)).toBeInTheDocument();
});

it('explains an empty day without claiming no study and leads to the class code', async () => {
  render(<Harness />);
  await unlock();
  await waitFor(() => expect(screen.getByText(/No report does not mean no study/)).toBeVisible());
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Share class code' }));
  fireEvent.click(screen.getByRole('button', { name: 'Publish class code' }));
  await waitFor(() =>
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ shareId: course.shareId, recipient: expect.anything() }),
    ),
  );
  const code = ((await screen.findByLabelText('Class code')) as HTMLInputElement).value;
  expect(code).toBe('K7QM-4XTP');
  expect((screen.getByLabelText('Pupil join link') as HTMLInputElement).value).toMatch(
    /\/s\/GAPS1_/,
  );
  expect(screen.queryByText(/GAPS1_/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Copy code' })).toBeVisible();
});

it('reads an earlier day on request and keeps days already read for this session', async () => {
  render(<Harness />);
  await unlock();
  await screen.findByText(/No report does not mean no study/);
  const previous = isoDayLabel(isoDayStartMs(latest) - DAY_MS);
  fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
  await waitFor(() =>
    expect(mocks.read).toHaveBeenLastCalledWith(expect.objectContaining({ isoDay: previous })),
  );
  expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
  await screen.findByText(/No report does not mean no study/);
  expect(mocks.read).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
});

it('opens today’s UTC day and explains explicit partial snapshots and refreshing', async () => {
  render(<Harness />);
  await unlock();
  await screen.findByText(/No report does not mean no study/);
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ isoDay: isoDayLabel(Date.now()) }),
  );
  expect(screen.getByText('Today (UTC)')).toBeVisible();
  expect(screen.getByText(/Partial UTC results/)).toHaveTextContent(
    /Ask pupils to Send latest progress.*Refresh results/,
  );
  expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Refresh results' })).toBeVisible();
});

it('refreshes a cached day by replacing the pupil’s evidence once', async () => {
  mocks.read.mockResolvedValue({
    unreadable: 0,
    reports: [{ slotId: 'slot', report: report('Ada', [event({ earned: 0 })]) }],
  });
  const cache = createClassSessions();
  render(<Harness cache={cache} />);
  await unlock();
  await screen.findByRole('button', { name: 'Ada, Explain osmosis.: 0%' });
  // Returning from yesterday uses today's cached result before an explicit refresh.
  fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
  await screen.findByRole('button', { name: 'Ada, Explain osmosis.: 0%' });
  fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
  expect(screen.getByRole('button', { name: 'Ada, Explain osmosis.: 0%' })).toBeVisible();
  mocks.read.mockResolvedValue({
    unreadable: 0,
    reports: [{ slotId: 'slot', report: report('Ada', [event({ earned: 2 })]) }],
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh results' }));
  expect(await screen.findByRole('button', { name: 'Ada, Explain osmosis.: 100%' })).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Ada, Explain osmosis.: 0%' }),
  ).not.toBeInTheDocument();
  expect(within(screen.getByRole('table')).getAllByRole('button', { name: 'Ada' })).toHaveLength(1);
  expect(cache.sessions.get(course.shareId)?.days.get(latest)?.reports).toHaveLength(1);
  expect(mocks.read).toHaveBeenCalledTimes(3);
  expect(mocks.read).toHaveBeenLastCalledWith(expect.objectContaining({ isoDay: latest }));
});

it('shows failed refreshes honestly and retries without restoring stale evidence', async () => {
  mocks.read.mockResolvedValue({
    unreadable: 0,
    reports: [{ slotId: 'slot', report: report('Ada', [event({ earned: 0 })]) }],
  });
  const cache = createClassSessions();
  render(<Harness cache={cache} />);
  await unlock();
  await screen.findByRole('table');
  mocks.read.mockRejectedValue(new Error('Could not reach the insights service.'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh results' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not reach the insights service.',
  );
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(cache.sessions.get(course.shareId)?.days.has(latest)).toBe(false);
  mocks.read.mockResolvedValue({
    unreadable: 0,
    reports: [{ slotId: 'slot', report: report('Ada', [event({ earned: 2 })]) }],
  });
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: 'Ada, Explain osmosis.: 100%' })).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(mocks.read).toHaveBeenCalledTimes(3);
});

it('aborts a pending refresh when navigating and ignores its late result', async () => {
  const cache = createClassSessions();
  render(<Harness cache={cache} />);
  await unlock();
  await screen.findByText(/No report does not mean no study/);
  let finish!: (value: unknown) => void;
  let signal!: AbortSignal;
  mocks.read.mockImplementationOnce((options: { signal: AbortSignal }) => {
    signal = options.signal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh results' }));
  expect(screen.getByRole('button', { name: 'Refresh results' })).toBeDisabled();
  await waitFor(() => expect(signal?.aborted).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
  expect(signal.aborted).toBe(true);
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(3));
  await waitFor(() =>
    expect(
      cache.sessions.get(course.shareId)?.days.has(isoDayLabel(isoDayStartMs(latest) - DAY_MS)),
    ).toBe(true),
  );
  await act(async () =>
    finish({
      unreadable: 0,
      reports: [{ slotId: 'slot', report: report('Late pupil', [event()]) }],
    }),
  );
  expect(cache.sessions.get(course.shareId)?.days.has(latest)).toBe(false);
  expect(screen.queryByRole('button', { name: 'Late pupil' })).not.toBeInTheDocument();
  expect(
    screen.getByText(dayLabel(isoDayLabel(isoDayStartMs(latest) - DAY_MS), 'short')),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(4));
  await screen.findByText(/No report does not mean no study/);
  expect(screen.getByText('Today (UTC)')).toBeVisible();
});

it('aborts a pending refresh on lock without repopulating the revoked session', async () => {
  const cache = createClassSessions();
  render(<Harness cache={cache} />);
  await unlock();
  await screen.findByText(/No report does not mean no study/);
  const session = cache.sessions.get(course.shareId)!;
  let finish!: (value: unknown) => void;
  let signal!: AbortSignal;
  mocks.read.mockImplementationOnce((options: { signal: AbortSignal }) => {
    signal = options.signal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh results' }));
  await waitFor(() => expect(signal?.aborted).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
  expect(signal.aborted).toBe(true);
  await act(async () =>
    finish({
      unreadable: 0,
      reports: [{ slotId: 'slot', report: report('Late pupil', [event()]) }],
    }),
  );
  expect(cache.sessions.has(course.shareId)).toBe(false);
  expect(session.days.has(latest)).toBe(false);
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Refresh results' })).not.toBeInTheDocument();
  expect(await screen.findByRole('form', { name: 'Unlock class' })).toBeVisible();
});

it('shows unreadable packets even when none of the reports can be decrypted', async () => {
  mocks.read.mockResolvedValue({ reports: [], unreadable: 3 });
  render(<Harness />);
  await unlock();
  expect(await screen.findByText('3 reports could not be read and are left out.')).toBeVisible();
  expect(screen.getByRole('heading', { name: /^No readable reports for/ })).toBeVisible();
});

it('clears a failed day when returning to a successfully cached day', async () => {
  render(<Harness />);
  await unlock();
  await screen.findByText(/No report does not mean no study/);
  mocks.read.mockRejectedValue(new Error('Earlier day unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Earlier day unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(screen.getByText(/No report does not mean no study/)).toBeVisible();
  expect(mocks.read).toHaveBeenCalledTimes(2);
});

it('restores an earlier day’s read evidence after navigation without another fetch', async () => {
  const cache = createClassSessions();
  mocks.read.mockResolvedValue({
    unreadable: 0,
    reports: [{ slotId: 'saved', report: report('Retained pupil', [event()]) }],
  });
  const page = render(<Harness cache={cache} />);
  await unlock();
  await screen.findByRole('table');
  const pupil = screen.getByRole('button', { name: 'Retained pupil' });
  pupil.focus();
  fireEvent.keyDown(pupil, { key: '[' });
  // Stepping starts a read without tearing down the evidence or its keyboard focus.
  expect(pupil).toBeInTheDocument();
  expect(pupil).toHaveFocus();
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
  await screen.findByRole('table');
  page.unmount();
  mocks.read.mockRejectedValue(new Error('offline'));
  render(<Harness cache={cache} />);
  fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
  expect(await screen.findByRole('button', { name: 'Retained pupil' })).toBeVisible();
  expect(mocks.read).toHaveBeenCalledTimes(2);
});
