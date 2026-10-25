import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CourseInsightsSection } from './CourseInsightsSection';
import { enrolInClass, setReportingConsent } from '../../insights/enrolment';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 0,
}));

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => ({ name: 'Biology' }) }));
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
  return render(<CourseInsightsSection courseId={COURSE_ID} />);
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

  it('renders the toggle off by default, with no day recorded as sent', () => {
    renderSection();
    const toggle = screen.getByRole('switch', { name: 'Share insights with your teacher' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Nothing has been sent yet.')).toBeTruthy();
  });

  it('records the student\u2019s choice per course, per device, after entering an identifier and consenting', () => {
    joinClass();
    const { rerender } = renderSection();
    fireEvent.change(screen.getByLabelText(/^Name or class identifier/), {
      target: { value: 'Pupil A' },
    });
    fireEvent.click(screen.getByRole('switch', { name: 'Share insights with your teacher' }));
    expect(localStorage.getItem(`lacuna.insights.optIn.${COURSE_ID}`)).toBe('on');

    // Re-mounting reads the recorded choice back rather than resetting it.
    rerender(<CourseInsightsSection courseId={COURSE_ID} />);
    expect(
      screen.getByRole('switch', { name: 'Share insights with your teacher' }),
    ).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('switch', { name: 'Share insights with your teacher' }));
    expect(localStorage.getItem(`lacuna.insights.optIn.${COURSE_ID}`)).toBe('off');
  });

  it('does not leak newly stored choices into another course', () => {
    joinClass();
    render(<CourseInsightsSection courseId={COURSE_ID} />);
    fireEvent.change(screen.getByLabelText(/^Name or class identifier/), {
      target: { value: 'Pupil A' },
    });
    fireEvent.click(screen.getByRole('switch', { name: 'Share insights with your teacher' }));

    expect(localStorage.getItem(`lacuna.insights.optIn.${COURSE_ID}`)).toBe('on');
    expect(localStorage.getItem('lacuna.insights.optIn.other-course')).toBeNull();
  });

  it('discloses teacher visibility, service metadata, retention and the disconnected transport', () => {
    renderSection();
    expect(screen.getByText(/only your teacher can read/i)).toBeTruthy();
    expect(screen.getByText(/may be able to recognise you/i)).toBeTruthy();
    expect(screen.getByText(/submission time and packet size/i)).toBeTruthy();
    expect(screen.getByText(/publishes today’s completed work immediately/i)).toBeTruthy();
    expect(screen.getByText(/expire from the relay after 12 weeks/i)).toBeTruthy();
    expect(screen.getByText(/teacher may keep results they have already received/i)).toBeTruthy();
    expect(screen.getByText(/Insights delivery is not enabled in this build/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'School data notice' })).toHaveAttribute(
      'href',
      'https://github.com/TJ7755/Lacuna/blob/master/docs/gaps-school-notice.md',
    );
    expect(screen.queryByText(/anonymous|nothing.*identifies you/i)).not.toBeInTheDocument();
  });

  it('warns about previously recorded activity before consent', () => {
    joinClass();
    renderSection();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/activity already recorded today and yesterday/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'How sharing works' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('shows the recorded day once a completed send exists', () => {
    localStorage.setItem(`lacuna.insights.lastSentDay.${COURSE_ID}`, '2026-10-18');
    renderSection();
    expect(screen.getByText('Last daily report: 2026-10-18.')).toBeTruthy();
  });

  it('shows the connected course and a useful explicit-publication time', () => {
    joinClass();
    localStorage.setItem(
      `lacuna.insights.lastPublishedAt.${COURSE_ID}`,
      String(Date.parse('2026-10-19T12:34:00Z')),
    );
    renderSection();
    expect(screen.getByText('Connected course: Biology.')).toBeVisible();
    expect(screen.queryByText(/Class reference/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Last successful publication:.*19.*10.*2026.*12:34.*UTC/),
    ).toBeVisible();
  });

  it.each([
    ['sent', /latest progress was accepted/],
    ['unchanged', /Nothing new to send/],
    ['idle', /Nothing was sent/],
  ] as const)('reports %s honestly', async (result, message) => {
    vi.stubEnv('VITE_GAPS_REPORTING_ENABLED', 'true');
    joinClass();
    setReportingConsent(COURSE_ID, true, 'Pupil A');
    vi.mocked(publishCourseInsights).mockResolvedValue(result);
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Send latest progress' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(message));
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
    fireEvent.click(screen.getByRole('button', { name: 'Send latest progress' }));
    await waitFor(() => expect(publishCourseInsights).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    fail(new Error('Storage full'));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Could not send your latest progress. Try again.',
      ),
    );
    expect(screen.queryByText(/saved for retry/)).not.toBeInTheDocument();
  });

  it('reports offline without attempting publication', async () => {
    vi.stubEnv('VITE_GAPS_REPORTING_ENABLED', 'true');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    joinClass();
    setReportingConsent(COURSE_ID, true, 'Pupil A');
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Send latest progress' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('You are offline.'));
    expect(publishCourseInsights).not.toHaveBeenCalled();
  });

  it.each(['2026-W42', '2026-02-30', 'not a date'])(
    'does not treat %s as a daily acknowledgement',
    (value) => {
      localStorage.setItem(`lacuna.insights.lastSentWeek.${COURSE_ID}`, '2026-W42');
      localStorage.setItem(`lacuna.insights.lastSentDay.${COURSE_ID}`, value);
      renderSection();
      expect(screen.getByText('Nothing has been sent yet.')).toBeTruthy();
    },
  );
});

it('does not enable reporting through an old toggle without a verified class invitation', () => {
  localStorage.setItem(`lacuna.insights.optIn.${COURSE_ID}`, 'on');
  renderSection();
  expect(screen.getByRole('switch')).toBeDisabled();
  expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
});
