import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { CheckIcon } from '../../components/ui/icons';
import {
  JEV_CONSENT_VERSION,
  JEV_PROVIDER,
  useJevController,
  useJevSettings,
  useJevStatus,
  type JevPauseReason,
  type JevStatus,
} from '../../jev';
import { formatRelativeTime } from '../../utils/datetime';
import { JevConsentDialog } from './JevConsentDialog';
import { SettingsSectionHeading } from './SettingsSectionHeading';
import { PillSwitch, SETTINGS_HEADING_ROW_CLASS, SettingRow, SettingsCard } from './SettingsUi';
import { cn } from '../../components/ui/cn';

const PAUSE_MESSAGES: Record<JevPauseReason, string> = {
  offline: 'Paused while offline. It resumes automatically.',
  'no-access-code': 'Paused until an access code is entered.',
  'access-code-rejected': 'Paused: the access code was not accepted.',
  'service-disabled': 'Paused: the service is unavailable. It will try again later.',
  'limit-reached': 'Paused: this month’s safety limit has been reached.',
  error: 'Paused after an error. It will try again later.',
};

export function jevStatusMessage(status: JevStatus, now = Date.now()): string | null {
  const last =
    status.state === 'paused' && status.lastUsedAt !== null
      ? ` Last used ${formatRelativeTime(status.lastUsedAt, now)}.`
      : '';
  switch (status.state) {
    case 'off':
      return null;
    case 'ready':
      return status.lastUsedAt === null
        ? 'Ready. It marks your next typed or written answer.'
        : `Ready. Last used ${formatRelativeTime(status.lastUsedAt, now)}.`;
    case 'paused':
      return `${PAUSE_MESSAGES[status.reason]}${last}`;
  }
}

export function JevSection() {
  const settings = useJevSettings();
  const status = useJevStatus();
  const jev = useJevController();
  const [consentOpen, setConsentOpen] = useState(false);
  const on = settings.enabled && settings.acceptedConsentVersion === JEV_CONSENT_VERSION;
  const needsCode =
    on &&
    (!jev.hasAccessCode() ||
      (status.state === 'paused' &&
        (status.reason === 'no-access-code' || status.reason === 'access-code-rejected')));
  const message = on ? jevStatusMessage(status) : null;

  return (
    <SettingsCard id="settings-jev">
      <div className={cn('mb-1', SETTINGS_HEADING_ROW_CLASS)}>
        <CheckIcon width={18} height={18} />
        <SettingsSectionHeading className="font-display text-xl font-semibold tracking-tight">
          Automatic marking
        </SettingsSectionHeading>
      </div>
      <p className="mb-5 text-sm leading-6 text-ink-soft">
        Marks typed flashcard answers and written practice answers for you, using the Jev decision
        model from {JEV_PROVIDER.name}. When it is not sure, you mark as usual, and you can always
        undo or change its mark.
      </p>

      <SettingRow
        className="items-start"
        label={
          <>
            Mark my answers automatically
            <span className="mt-1 block text-sm font-normal leading-6 text-ink-soft">
              {on
                ? `Answers that need judgement are sent to ${JEV_PROVIDER.name} in the ${JEV_PROVIDER.region}, with the question and mark scheme.`
                : 'Off by default. Nothing is sent until you turn this on and accept the warning.'}
            </span>
          </>
        }
      >
        <PillSwitch
          checked={on}
          onChange={(checked) => (checked ? setConsentOpen(true) : jev.disable())}
          ariaLabel="Mark my answers automatically"
        />
      </SettingRow>

      {needsCode && <JevAccessCodeForm connect={jev.connectAccessCode} />}

      {message && (
        <p role="status" className="mt-3 text-sm text-ink-faint">
          {message}
        </p>
      )}

      <JevConsentDialog
        open={consentOpen}
        onCancel={() => setConsentOpen(false)}
        onAccept={() => {
          jev.enable(JEV_CONSENT_VERSION);
          setConsentOpen(false);
        }}
      />
    </SettingsCard>
  );
}

function JevAccessCodeForm({
  connect,
}: {
  connect: (code: string) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await connect(trimmed);
      if (result.ok) setCode('');
      else setError(result.message);
    } catch {
      setError('Could not check the access code. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start"
      onSubmit={(e) => void submit(e)}
    >
      <Field
        className="min-w-0 flex-1"
        label="Access code"
        hint="Your automatic marking access code. Stored only on this device."
        error={error}
      >
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </Field>
      <Button type="submit" className="sm:mt-7" disabled={busy || code.trim() === ''}>
        {busy ? 'Connecting…' : 'Connect'}
      </Button>
    </form>
  );
}
