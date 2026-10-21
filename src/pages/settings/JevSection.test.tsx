import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as JevModule from '../../jev';
import type { JevSettings, JevStatus } from '../../jev';
import { JevSection } from './JevSection';

const state = vi.hoisted(() => ({
  settings: { enabled: false, acceptedConsentVersion: null } as JevSettings,
  status: { state: 'off' } as JevStatus,
  hasCode: true,
  enable: vi.fn(),
  disable: vi.fn(),
  connect: vi.fn(),
}));

vi.mock('../../jev', async (importOriginal) => ({
  ...(await importOriginal<typeof JevModule>()),
  useJevSettings: () => state.settings,
  useJevStatus: () => state.status,
  useJevController: () => ({
    enable: state.enable,
    disable: state.disable,
    connectAccessCode: state.connect,
    hasAccessCode: () => state.hasCode,
  }),
}));

const toggle = () => screen.getByRole('switch', { name: 'Mark my answers automatically' });

describe('JevSection', () => {
  beforeEach(() => {
    state.settings = { enabled: false, acceptedConsentVersion: null };
    state.status = { state: 'off' };
    state.hasCode = true;
    state.enable.mockClear();
    state.disable.mockClear();
    state.connect.mockReset();
  });

  it('is off by default and turns on only after the warning is accepted', () => {
    render(<JevSection />);
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle());

    const dialog = screen.getByRole('alertdialog', {
      name: 'Before you turn on automatic marking',
    });
    expect(dialog).toHaveTextContent('Warning');
    expect(dialog).toHaveTextContent('sent to TypeSafe AI in the United States');
    expect(dialog).toHaveTextContent('Do not write personal data');
    const turnOn = screen.getByRole('button', { name: 'Turn on' });
    expect(turnOn).toBeDisabled();
    fireEvent.click(turnOn);
    expect(state.enable).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', { name: /I understand/ }));
    fireEvent.click(turnOn);
    expect(state.enable).toHaveBeenCalledWith(1);
  });

  it('sends nothing when the warning is cancelled', () => {
    render(<JevSection />);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(state.enable).not.toHaveBeenCalled();
  });

  it('treats an older consent as off', () => {
    state.settings = { enabled: true, acceptedConsentVersion: 0 };
    render(<JevSection />);
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
  });

  it('turns off immediately and reports its status while on', () => {
    state.settings = { enabled: true, acceptedConsentVersion: 1 };
    state.status = { state: 'paused', reason: 'offline', lastUsedAt: null };
    render(<JevSection />);
    expect(screen.getByRole('status')).toHaveTextContent('Paused while offline');
    fireEvent.click(toggle());
    expect(state.disable).toHaveBeenCalled();
  });

  it('asks for an access code only when this device has none', async () => {
    state.settings = { enabled: true, acceptedConsentVersion: 1 };
    state.hasCode = false;
    state.connect.mockResolvedValue({ ok: false, message: 'That code was not recognised.' });
    render(<JevSection />);
    fireEvent.change(screen.getByLabelText(/Access code/), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That code was not recognised.');
    expect(state.connect).toHaveBeenCalledWith('abc');
  });
});
