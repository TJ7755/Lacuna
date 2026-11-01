import { mocks, Harness, event, report, unlock } from './TeacherClassReports.testSupport';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { DemoClassPage } from './TeacherClassReports';

it('uses actual report views for fictional answers without unlocking, reading or publishing', async () => {
  const onExit = vi.fn();
  render(<DemoClassPage onExit={onExit} />);
  expect(screen.getByRole('heading', { name: 'Biology — fictional demo' })).toBeVisible();
  const notice = 'Fictional demo: six invented pupils and answers. Nothing is saved or sent.';
  expect(screen.getByText(notice)).toBeVisible();
  expect(screen.getByRole('table')).toBeVisible();
  const revisit = screen.getByRole('heading', { name: 'Worth revisiting' }).parentElement!;
  expect(within(revisit).getByText('30%')).toBeVisible();
  expect(within(revisit).getByText('3 of 6 with a gap')).toBeVisible();
  fireEvent.click(within(revisit).getByRole('button', { name: 'Answers' }));
  expect(
    await within(revisit).findByText(
      '“Water moves from a concentrated solution to a dilute solution.”',
    ),
  ).toBeVisible();
  expect(within(revisit).getByText('Ada Bennett, Ben Carter, Chloe Evans')).toBeVisible();
  expect(within(revisit).getByText('Unknown / 2 marks · Self marked')).toBeVisible();

  fireEvent.click(screen.getByRole('tab', { name: 'Pupils' }));
  expect(screen.getByText(notice)).toBeVisible();
  const pupils = screen.getByRole('list', { name: 'Pupils' });
  expect(within(pupils).getAllByRole('button')).toHaveLength(6);
  fireEvent.click(within(pupils).getByRole('button', { name: /Finn Wilson/ }));
  const evidence = await screen.findByRole('region', { name: 'Evidence for Finn Wilson' });
  expect(within(evidence).getByText('I am unsure which way the water moves.')).toBeVisible();
  expect(within(evidence).getByText('Unknown / 2 marks · Self marked')).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }));
  expect(screen.getByRole('tab', { name: 'Results' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('table')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Answers' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('region', { name: /Evidence for/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Invite' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Refresh results' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Class settings' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Exit demo' }));
  expect(onExit).toHaveBeenCalledOnce();
  for (const operation of Object.values(mocks)) expect(operation).not.toHaveBeenCalled();
});

it('groups identical answers so a shared misconception reads as one line', async () => {
  const wrong = event({
    disputed: false,
    shortened: false,
    earned: 0,
    answer: 'Salt moves',
    criteria: [],
  });
  mocks.read.mockResolvedValue({
    unreadable: 0,
    reports: [
      { slotId: '1', report: report('Ada', [wrong]) },
      { slotId: '2', report: report('Ben', [{ ...wrong, answer: 'salt moves' }]) },
      { slotId: '3', report: report('Cy', [{ ...wrong, earned: 2, answer: 'Water moves' }]) },
    ],
  });
  render(<Harness />);
  await unlock();
  const answers = await screen.findByRole('button', { name: /^Answers/ });
  fireEvent.click(answers);
  expect(answers).toHaveAttribute('aria-expanded', 'true');
  const row = answers.closest('li')!;
  expect(within(row).getByText('Ada, Ben')).toBeInTheDocument();
  expect(within(row).getByText('Cy')).toBeInTheDocument();

  // The item's heading in the grid opens the same answers in a row beneath it.
  fireEvent.click(screen.getByRole('button', { name: /^Explain osmosis/ }));
  const grid = await screen.findByRole('region', { name: 'Answers' });
  expect(within(grid).getByText('Ada, Ben')).toBeInTheDocument();
  fireEvent.keyDown(grid, { key: 'Escape' });
  expect(screen.getByRole('button', { name: /^Explain osmosis/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

it('keeps grid answer cells keyboard reachable with visible scores and unknown states', async () => {
  mocks.read.mockResolvedValue({
    unreadable: 0,
    reports: [
      { slotId: 'a', report: report('Ada', [event({ earned: 1, available: 2 })]) },
      { slotId: 'b', report: report('Ben', [event()]) },
    ],
  });
  render(<Harness />);
  await unlock();
  const scored = await screen.findByRole('button', { name: 'Ada, Explain osmosis.: 50%' });
  expect(scored.tabIndex).toBe(0);
  expect(scored).toHaveTextContent('50%');
  const unknown = screen.getByRole('button', { name: 'Ben, Explain osmosis.: unknown' });
  expect(unknown.tabIndex).toBe(0);
  expect(unknown).toHaveTextContent('Unknown');
  scored.focus();
  fireEvent.click(scored);
  expect(await screen.findByRole('region', { name: 'Evidence for Ada' })).toBeVisible();
});

it('labels grouped answers with their marking method, dispute and shortening', async () => {
  mocks.read.mockResolvedValue({
    unreadable: 0,
    reports: [
      { slotId: 'a', report: report('Ada', [event()]) },
      {
        slotId: 'b',
        report: report('Ben', [event({ marking: 'automatic', disputed: false, shortened: false })]),
      },
    ],
  });
  render(<Harness />);
  await unlock();
  fireEvent.click(await screen.findByRole('button', { name: /^Explain osmosis/ }));
  const answers = await screen.findByRole('region', { name: 'Answers' });
  expect(
    within(answers).getByText(/Self marked · disputed by the pupil · shortened for this report/),
  ).toBeVisible();
  expect(within(answers).getByText(/Automatic marking/)).toBeVisible();
  expect(within(answers).queryByText('Ada, Ben')).not.toBeInTheDocument();
});

it('shows textual outcomes for written answer groups with known and unknown scores', async () => {
  mocks.read.mockResolvedValue({
    unreadable: 0,
    reports: [
      { slotId: 'a', report: report('Ada', [event({ disputed: false, shortened: false })]) },
      {
        slotId: 'b',
        report: report('Ben', [event({ earned: 1, disputed: false, shortened: false })]),
      },
    ],
  });
  render(<Harness />);
  await unlock();
  fireEvent.click(await screen.findByRole('button', { name: /^Explain osmosis/ }));
  const answers = await screen.findByRole('region', { name: 'Answers' });
  expect(within(answers).getByText(/Unknown \/ 2 marks/)).toBeVisible();
  expect(within(answers).getByText(/1 \/ 2 marks/)).toBeVisible();
});
