import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CourseInsightsSection } from './CourseInsightsSection';

// The opt-in must be off by default and stay pure device-local: no stored value,
// no send. Copy is pinned to the re-scope wording (#600) so regressions that
// soften either the seal or the expiry honesty are caught at build time.
// Presence is asserted rather than pixel visibility: the shared settings card
// animates itself in, and the component owns the words, not the animation.

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 1,
}));

const COURSE_ID = 'course-1';

function renderSection() {
  return render(<CourseInsightsSection courseId={COURSE_ID} />);
}

describe('CourseInsightsSection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the toggle off by default, with no week recorded as sent', () => {
    renderSection();
    const toggle = screen.getByRole('switch', { name: 'Share insights with your teacher' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Nothing has been sent yet.')).toBeTruthy();
  });

  it('records the student\u2019s choice per course, per device, on this toggle alone', () => {
    const { rerender } = renderSection();
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
    render(<CourseInsightsSection courseId={COURSE_ID} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Share insights with your teacher' }));

    expect(localStorage.getItem(`lacuna.insights.optIn.${COURSE_ID}`)).toBe('on');
    expect(localStorage.getItem('lacuna.insights.optIn.other-course')).toBeNull();
  });

  it('states the end-to-end seal and the expiry honesty of the re-scoped disclosure', () => {
    renderSection();
    expect(screen.getByText(/sealed end-to-end/i)).toBeTruthy();
    expect(screen.getByText(/cannot be deleted one item at a time/i)).toBeTruthy();
  });

  it('shows the recorded week once a completed send exists', () => {
    localStorage.setItem(`lacuna.insights.lastSentWeek.${COURSE_ID}`, '2026-W41');
    renderSection();
    expect(screen.getByText('Last sent: 2026-W41.')).toBeTruthy();
  });
});
