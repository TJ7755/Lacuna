import { fireEvent, render, screen } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsageAnalyticsSection } from '../pages/settings/UsageAnalyticsSection';
import { AnalyticsConsent } from './AnalyticsConsent';
import { canCollectUsage } from './preference';

const KEY = 'lacuna.usageAnalytics';

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 0,
}));

function renderConsent() {
  return render(
    <LazyMotion features={domAnimation}>
      <AnalyticsConsent />
    </LazyMotion>,
  );
}

beforeEach(() => {
  localStorage.removeItem(KEY);
  vi.stubEnv('PROD', true);
  vi.stubEnv('VITE_USAGE_ANALYTICS_ENABLED', 'true');
  vi.spyOn(window.location, 'origin', 'get').mockReturnValue('https://getlacuna.app');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('usage analytics choice', () => {
  it('selects On without collecting until Continue and remembers the choice on return', () => {
    const visit = renderConsent();
    expect(screen.getByRole('radio', { name: 'On' })).toBeChecked();
    expect(canCollectUsage()).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(canCollectUsage()).toBe(true);

    visit.unmount();
    renderConsent();
    expect(screen.queryByRole('dialog', { name: 'Usage analytics' })).not.toBeInTheDocument();
  });

  it('keeps analytics off when the user chooses Off', () => {
    renderConsent();
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(canCollectUsage()).toBe(false);
    expect(screen.queryByRole('dialog', { name: 'Usage analytics' })).not.toBeInTheDocument();
  });

  it('treats Escape as Off when On is selected', () => {
    renderConsent();
    fireEvent.keyDown(screen.getByRole('radio', { name: 'On' }), { key: 'Escape' });

    expect(canCollectUsage()).toBe(false);
    expect(screen.queryByRole('dialog', { name: 'Usage analytics' })).not.toBeInTheDocument();
  });

  it('honours a browser privacy signal over a previously saved On choice', () => {
    localStorage.setItem(KEY, '1');
    vi.spyOn(navigator, 'doNotTrack', 'get').mockReturnValue('1');
    expect(canCollectUsage()).toBe(false);
  });

  it('refreshes the Settings switch when another tab changes the choice', () => {
    localStorage.setItem(KEY, '1');
    render(
      <LazyMotion features={domAnimation}>
        <UsageAnalyticsSection />
      </LazyMotion>,
    );
    const toggle = screen.getByRole('switch', { name: 'Usage analytics' });
    expect(toggle).toBeChecked();

    localStorage.setItem(KEY, '0');
    fireEvent(window, new StorageEvent('storage', { key: KEY }));

    expect(toggle).not.toBeChecked();
    expect(canCollectUsage()).toBe(false);
  });
});
