import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as JevModule from '../../jev';
import { JEV_CONSENT_VERSION, type JevSettings, type JevStatus } from '../../jev';
import { JevSection } from './JevSection';

const state = vi.hoisted(() => ({
  settings: { enabled: false, acceptedConsentVersion: null } as JevSettings,
  status: { state: 'off' } as JevStatus,
  enable: vi.fn(),
  disable: vi.fn(),
  quotaId: vi.fn(),
}));

vi.mock('../../jev', async (importOriginal) => ({
  ...(await importOriginal<typeof JevModule>()),
  useJevSettings: () => state.settings,
  useJevStatus: () => state.status,
  useJevController: () => ({
    enable: state.enable,
    disable: state.disable,
    quotaId: state.quotaId,
  }),
}));

const toggle = () => screen.getByRole('switch', { name: 'Mark my answers automatically' });

describe('JevSection', () => {
  beforeEach(() => {
    state.settings = { enabled: false, acceptedConsentVersion: null };
    state.status = { state: 'off' };
    state.enable.mockClear();
    state.disable.mockClear();
    state.quotaId.mockReset();
  });

  it('is off by default and turns on only after the warning is accepted', () => {
    render(<JevSection />);
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('button', { name: 'Copy quota ID' })).not.toBeInTheDocument();
    fireEvent.click(toggle());

    const dialog = screen.getByRole('alertdialog', {
      name: 'Before you turn on automatic marking',
    });
    expect(dialog).toHaveTextContent('Warning');
    expect(dialog).toHaveTextContent('sent to TypeSafe AI in the United States');
    expect(dialog).toHaveTextContent('Do not include personal data about yourself or anyone else');
    expect(dialog).toHaveTextContent('your answers, questions, cards or mark schemes');
    expect(dialog).toHaveTextContent('experimental public beta');
    expect(dialog).toHaveTextContent('across subjects and answer types');
    expect(dialog).toHaveTextContent(
      'Marks and diagnoses can be wrong, even when Jev is confident',
    );
    expect(dialog).toHaveTextContent('It does not delete anything already sent');
    const turnOn = screen.getByRole('button', { name: 'Turn on' });
    expect(turnOn).toBeDisabled();
    fireEvent.click(turnOn);
    expect(state.enable).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox', { name: /I understand/ }));
    fireEvent.click(turnOn);
    expect(state.enable).toHaveBeenCalledWith(JEV_CONSENT_VERSION);
  });

  it('sends nothing when the warning is cancelled', () => {
    render(<JevSection />);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(state.enable).not.toHaveBeenCalled();
  });

  it('treats an older consent as off', () => {
    state.settings = { enabled: true, acceptedConsentVersion: JEV_CONSENT_VERSION - 1 };
    render(<JevSection />);
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
  });

  it('turns off immediately and reports its status while on', () => {
    state.settings = { enabled: true, acceptedConsentVersion: JEV_CONSENT_VERSION };
    state.status = { state: 'paused', reason: 'offline', lastUsedAt: null };
    render(<JevSection />);
    expect(screen.getByRole('status')).toHaveTextContent('Paused while offline');
    fireEvent.click(toggle());
    expect(state.disable).toHaveBeenCalled();
  });

  it('offers public beta marking without an invitation code', () => {
    state.settings = { enabled: true, acceptedConsentVersion: JEV_CONSENT_VERSION };
    state.status = { state: 'ready', lastUsedAt: null };
    render(<JevSection />);
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Ready.');
    expect(screen.queryByLabelText(/Access code/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect' })).not.toBeInTheDocument();
  });
  it('copies the public quota ID for a higher beta allowance', async () => {
    state.settings = { enabled: true, acceptedConsentVersion: JEV_CONSENT_VERSION };
    const id = 'ab'.repeat(32);
    state.quotaId.mockResolvedValue(id);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<JevSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy quota ID' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(id));
    expect(await screen.findByText(/Quota ID copied/)).toBeInTheDocument();
    expect(screen.getByLabelText('Quota ID')).toHaveTextContent(id);
  });
});
