import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CourseInsightsSection } from './CourseInsightsSection';
import { enrolInClass } from '../../insights/enrolment';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 1,
}));

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
    expect(screen.getByText(/one report per completed day/i)).toBeTruthy();
    expect(screen.getByText(/expire from the relay after 12 weeks/i)).toBeTruthy();
    expect(screen.getByText(/teacher may keep results they have already received/i)).toBeTruthy();
    expect(screen.getByText(/Daily delivery is not enabled in this build/i)).toBeTruthy();
    expect(screen.queryByText(/anonymous|nothing.*identifies you/i)).not.toBeInTheDocument();
  });

  it('shows the recorded day once a completed send exists', () => {
    localStorage.setItem(`lacuna.insights.lastSentDay.${COURSE_ID}`, '2026-10-18');
    renderSection();
    expect(screen.getByText('Last sent: 2026-10-18.')).toBeTruthy();
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
