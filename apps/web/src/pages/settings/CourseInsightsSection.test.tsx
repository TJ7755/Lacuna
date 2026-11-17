import 'fake-indexeddb/auto';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CourseInsightsSection } from './CourseInsightsSection';
import * as outbox from '../../insights/outbox';
import { enrolInClass, setReportingConsent } from '../../insights/enrolment';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 0,
}));

vi.mock('../../insights/delivery', () => ({ publishCourseInsights: vi.fn() }));
import { publishCourseInsights } from '../../insights/delivery';

const COURSE_ID = 'course-1';

function joinClass() {
  enrolInClass(COURSE_ID, {
    shareId: 'a'.repeat(32),
    lineageId: 'lineage',
    recipient: { keyId: 'b'.repeat(64), publicKey: 'public' },
  });
}

function renderSection() {
  return render(<CourseInsightsSection courseId={COURSE_ID} />, { wrapper: MemoryRouter });
}

describe('CourseInsightsSection', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_GAPS_REPORTING_ENABLED', 'false');
    vi.mocked(publishCourseInsights).mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('offers a single join action and details when there is no verified invitation', () => {
    localStorage.setItem(`lacuna.insights.optIn.${COURSE_ID}`, 'on');
    renderSection();
    expect(screen.getByRole('link', { name: 'Join a class' })).toHaveAttribute(
      'href',
      '/?import=1&join=1',
    );
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing has been sent yet.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'How sharing works' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('records the student\u2019s choice per course, per device, after entering an identifier and consenting', () => {
    joinClass();
    const section = renderSection();
    fireEvent.change(screen.getByLabelText(/^Name or class identifier/), {
      target: { value: 'Pupil A' },
    });
    fireEvent.click(screen.getByRole('switch', { name: 'Share insights with your teacher' }));
    expect(localStorage.getItem(`lacuna.insights.optIn.${COURSE_ID}`)).toBe('on');

    section.unmount();
    renderSection();
    expect(
      screen.getByRole('switch', { name: 'Share insights with your teacher' }),
    ).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('switch', { name: 'Share insights with your teacher' }));
    expect(localStorage.getItem(`lacuna.insights.optIn.${COURSE_ID}`)).toBe('off');
  });

  it('does not leak newly stored choices into another course', () => {
    joinClass();
    renderSection();
    fireEvent.change(screen.getByLabelText(/^Name or class identifier/), {
      target: { value: 'Pupil A' },
    });
    fireEvent.click(screen.getByRole('switch', { name: 'Share insights with your teacher' }));

    expect(localStorage.getItem(`lacuna.insights.optIn.${COURSE_ID}`)).toBe('on');
    expect(localStorage.getItem('lacuna.insights.optIn.other-course')).toBeNull();
  });

  it('keeps the full consent detail inside How sharing works', () => {
    renderSection();
    const trigger = screen.getByRole('button', { name: 'How sharing works' });
    const disclosure = document.getElementById(trigger.getAttribute('aria-controls')!);
    expect(disclosure).toContainElement(
      screen.getByText(/prompts, answers, marks, criterion results/i),
    );
    expect(disclosure).toContainElement(screen.getByText(/only your teacher can read/i));
    expect(disclosure).toContainElement(screen.getByText(/may recognise you/i));
    expect(disclosure).toContainElement(
      screen.getByText(/activity already recorded today and yesterday/i),
    );
    expect(disclosure).toContainElement(screen.getByText(/submission time and packet size/i));
    expect(disclosure).toContainElement(screen.getByText(/sends today’s completed work/i));
    expect(disclosure).toContainElement(screen.getByText(/expire from the relay after 12 weeks/i));
    expect(disclosure).toContainElement(
      screen.getByText(/teacher may keep results they have already received/i),
    );
    expect(screen.getByRole('link', { name: 'School data notice' })).toHaveAttribute(
      'href',
      'https://github.com/TJ7755/Lacuna/blob/master/docs/gaps-school-notice.md',
    );
    expect(screen.queryByText(/anonymous|nothing.*identifies you/i)).not.toBeInTheDocument();
  });

  it('explains the reporting choice while sharing is off and neither report has been sent', () => {
    joinClass();
    renderSection();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(
      screen.getByText(/encrypted reports of your answers, marks and study progress/),
    ).toBeVisible();
    expect(screen.getByText(/turning sharing off stops future reports/i)).toBeVisible();
    expect(screen.getByText('Nothing has been sent yet.')).toBeVisible();
    expect(screen.getByText('This build cannot send reports.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Send latest progress' })).not.toBeInTheDocument();
  });

  it.each([' ', 'x'.repeat(81)])('returns focus to the invalid identifier', (label) => {
    joinClass();
    renderSection();
    const identifier = screen.getByRole('textbox', { name: /^Name or class identifier/ });
    const toggle = screen.getByRole('switch');
    fireEvent.change(identifier, { target: { value: label } });
    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(identifier).toHaveFocus();
    expect(identifier).toHaveAttribute('aria-invalid', 'true');
    expect(identifier).toHaveAccessibleDescription(/enter a name or class identifier/i);
    fireEvent.change(identifier, { target: { value: 'Pupil A' } });
    expect(identifier).not.toHaveAttribute('aria-invalid');
  });

  it('shows the recorded day once a completed send exists', () => {
    joinClass();
    localStorage.setItem(`lacuna.insights.lastSentDay.${COURSE_ID}`, '2026-10-18');
    renderSection();
    expect(screen.getByText('Last automatic report: 2026-10-18.')).toBeTruthy();
  });

  it('prefers the timestamp of the manual send to the last automatic report', () => {
    vi.stubEnv('TZ', 'Asia/Singapore');
    joinClass();
    localStorage.setItem(`lacuna.insights.lastSentDay.${COURSE_ID}`, '2026-10-18');
    localStorage.setItem(
      `lacuna.insights.lastPublishedAt.${COURSE_ID}`,
      String(Date.parse('2026-10-19T12:34:00Z')),
    );
    renderSection();
    expect(screen.queryByText(/Last automatic report/)).not.toBeInTheDocument();
    expect(screen.getByText('Last sent: 19/10/2026, 20:34:00.')).toBeVisible();
  });

  it.each([
    ['sent', /Progress sent/],
    ['unchanged', /already been sent/],
    ['idle', /Nothing was sent/],
  ] as const)('reports %s honestly', async (result, message) => {
    vi.stubEnv('VITE_GAPS_REPORTING_ENABLED', 'true');
    joinClass();
    setReportingConsent(COURSE_ID, true, 'Pupil A');
    vi.mocked(publishCourseInsights).mockResolvedValue(result);
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Send latest progress' }));
    await waitFor(() =>
      expect(screen.getByRole('status', { name: '' })).toHaveTextContent(message),
    );
    expect(publishCourseInsights).toHaveBeenCalledWith(COURSE_ID);
  });

  it('shows sending until acknowledgement and does not claim a packet was saved after failure', async () => {
    vi.stubEnv('VITE_GAPS_REPORTING_ENABLED', 'true');
    joinClass();
    setReportingConsent(COURSE_ID, true, 'Pupil A');
    let fail!: (error: Error) => void;
    vi.mocked(publishCourseInsights).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    renderSection();
    const status = screen.getByRole('status', { name: '' });
    const send = screen.getByRole('button', { name: 'Send latest progress' });
    send.focus();
    fireEvent.click(send);
    await waitFor(() => expect(publishCourseInsights).toHaveBeenCalled());
    expect(status).toHaveTextContent('Sending…');
    expect(send).toHaveFocus();
    expect(send).toHaveAttribute('aria-disabled', 'true');
    fail(new Error('Storage full'));
    await waitFor(() => expect(status).toHaveTextContent('Could not send progress. Try again.'));
    expect(send).toHaveAttribute('aria-disabled', 'false');
    expect(screen.queryByText(/saved for retry/)).not.toBeInTheDocument();
  });

  it('reports offline without attempting publication', async () => {
    vi.stubEnv('VITE_GAPS_REPORTING_ENABLED', 'true');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    joinClass();
    setReportingConsent(COURSE_ID, true, 'Pupil A');
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Send latest progress' }));
    await waitFor(() =>
      expect(screen.getByRole('status', { name: '' })).toHaveTextContent('You are offline.'),
    );
    expect(publishCourseInsights).not.toHaveBeenCalled();
  });

  it.each(['2026-W42', '2026-02-30', 'not a date'])(
    'does not treat %s as a daily acknowledgement',
    (value) => {
      joinClass();
      localStorage.setItem(`lacuna.insights.lastSentWeek.${COURSE_ID}`, '2026-W42');
      localStorage.setItem(`lacuna.insights.lastSentDay.${COURSE_ID}`, value);
      renderSection();
      expect(screen.getByText('Nothing has been sent yet.')).toBeTruthy();
    },
  );

  it('allows opt-out during a send and ignores its result after opting back in', async () => {
    vi.stubEnv('VITE_GAPS_REPORTING_ENABLED', 'true');
    joinClass();
    setReportingConsent(COURSE_ID, true, 'Pupil A');
    let accept!: () => void;
    vi.mocked(publishCourseInsights).mockImplementation(
      () =>
        new Promise((resolve) => {
          accept = () => resolve('sent');
        }),
    );
    renderSection();
    const toggle = screen.getByRole('switch');
    const status = screen.getByRole('status', { name: '' });
    fireEvent.click(screen.getByRole('button', { name: 'Send latest progress' }));
    await waitFor(() => expect(publishCourseInsights).toHaveBeenCalled());
    expect(status).toHaveTextContent('Sending…');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('button', { name: 'Send latest progress' })).not.toBeInTheDocument();
    expect(status).toBeEmptyDOMElement();
    fireEvent.click(toggle);
    await act(async () => accept());
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(status).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: 'Send latest progress' })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
  });

  it('shows a pending disconnect, keeps a failure beside the confirmation and focuses Gaps after retry', async () => {
    joinClass();
    setReportingConsent(COURSE_ID, true, 'Pupil A');
    let rejectDiscard!: (error: Error) => void;
    const discard = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectDiscard = reject;
          }),
      )
      .mockResolvedValue(undefined);
    vi.spyOn(outbox, 'createInsightsOutbox').mockReturnValue({
      ...outbox.createInsightsOutbox(),
      discard,
    });
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect from Gaps' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(screen.getByRole('button', { name: 'Disconnecting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    rejectDiscard(new Error('Could not remove queued reports.'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not remove queued reports.');
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(await screen.findByRole('link', { name: 'Join a class' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Gaps' })).toHaveFocus();
    expect(screen.getByRole('status', { name: 'Class connection' })).toHaveTextContent(
      'Disconnected from Gaps.',
    );
  });
});
