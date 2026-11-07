import { useState } from 'react';
import { Button } from '../../components/ui/Button';
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
import { InlineSettingsDisclosure } from './InlineSettingsDisclosure';
import { SettingsSectionHeading } from './SettingsSectionHeading';
import { PillSwitch, SETTINGS_HEADING_ROW_CLASS, SettingRow, SettingsCard } from './SettingsUi';
import { cn } from '../../components/ui/cn';

const PAUSE_MESSAGES: Record<JevPauseReason, string> = {
  offline: 'Paused while offline. It resumes automatically.',
  'session-rejected': 'Paused: the session was not accepted. It will try again later.',
  'service-disabled': 'Paused: the service is unavailable. It will try again later.',
  'limit-reached': 'Paused: the automatic marking allowance has been reached.',
  'rate-limited': 'Paused: too many requests.',
  error: 'Paused after an error. It will try again later.',
};

function jevStatusMessage(status: JevStatus, now = Date.now()): string | null {
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
      return `${PAUSE_MESSAGES[status.reason]}${
        (status.reason === 'rate-limited' || status.reason === 'limit-reached') && status.retryAt
          ? ` Try again after ${new Date(status.retryAt).toLocaleString('en-GB')}. You can still mark answers yourself.`
          : ''
      }${last}`;
  }
}

export function JevSection() {
  const settings = useJevSettings();
  const status = useJevStatus();
  const jev = useJevController();
  const [consentOpen, setConsentOpen] = useState(false);
  const [quotaId, setQuotaId] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const on = settings.enabled && settings.acceptedConsentVersion === JEV_CONSENT_VERSION;
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
        Experimental beta. Check its marks and undo any mistakes.
      </p>

      <SettingRow
        className="items-start"
        label={
          <>
            Mark my answers automatically
            <span className="mt-1 block text-sm font-normal leading-6 text-ink-soft">
              {on
                ? `Sends study text to ${JEV_PROVIDER.name} in the ${JEV_PROVIDER.region}.`
                : 'Nothing is sent until you accept the consent warning.'}
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

      <InlineSettingsDisclosure
        className="mt-5 border-t border-line pt-4"
        headerClassName="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
        header={<span className="text-sm font-medium text-ink">How it works</span>}
      >
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-soft">
          <li>
            Jev is an experimental public beta for marking typed flashcard answers and written
            practice answers, using the decision model from {JEV_PROVIDER.name}. Its accuracy is
            still being evaluated. It can give wrong marks and diagnoses. Check its decisions; you
            can always undo or change its mark.
          </li>
          <li>
            The standard beta allowance is 100 Jev requests per installation each UTC day, with
            short-term limits to keep the service available. You can still mark answers yourself
            when the allowance runs out.
          </li>
          <li>
            Jev can send answers with their questions and marking material, lesson text to choose
            multiple-choice options, and authored techniques to classify them.
          </li>
        </ul>
      </InlineSettingsDisclosure>

      {message && (
        <p role="status" className="mt-3 text-sm text-ink-faint">
          {message}
        </p>
      )}

      {on && (
        <div className="mt-4">
          <Button
            type="button"
            onClick={async () => {
              let id: string | null;
              try {
                id = await jev.quotaId();
              } catch {
                id = null;
              }
              if (!id) {
                setCopyMessage('Could not read the quota ID. Try again.');
                return;
              }
              setQuotaId(id);
              try {
                await navigator.clipboard.writeText(id);
                setCopyMessage(
                  'Quota ID copied. Share it with the maintainer to request a higher beta allowance.',
                );
              } catch {
                setCopyMessage('Could not copy automatically. Select and copy the quota ID below.');
              }
            }}
          >
            Copy quota ID
          </Button>
          {copyMessage && (
            <p role="status" className="mt-2 text-sm text-ink-faint">
              {copyMessage}
            </p>
          )}
          {quotaId && (
            <code
              aria-label="Quota ID"
              className="mt-2 block select-text break-all text-xs text-ink-soft"
            >
              {quotaId}
            </code>
          )}
        </div>
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
