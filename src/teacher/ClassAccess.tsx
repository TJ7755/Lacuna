import { RememberClassCheckbox } from './gapsUi';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { buttonClassName } from '../components/ui/buttonStyles';
import { Field, Input } from '../components/ui/Field';
import { UnlockIcon } from '../components/ui/icons';
import { SectionCard } from '../components/ui/SectionCard';
import { createInsightsOwnerStore } from '../insights/ownerStore';
import { createGapsConnectionStore, type ConnectedGapsCourse } from './connectionStore';
import { ClassGlyph, focusFirstField, Spinner } from './gapsUi';
import { normaliseRecoveryCode } from './recoveryCode';
import { forgetRememberedClass, readRememberedClass, rememberClass } from './rememberedClass';
import type { ClassRequest, ClassSession } from './StandaloneTeacherHome';
import type * as KeysExports from './TeacherKeySetup';
import { ResultsSkeleton } from './ClassResults';
import { PageLoadingBoundary } from '../components/ui/PageLoadingBoundary';

/** Loads the key set-up form when it is first needed, as the shell loads each screen. */
export function useKeySetup(needed: boolean) {
  const [Keys, setKeys] = useState<typeof KeysExports | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (needed && !Keys) void import('./TeacherKeySetup').then(setKeys, () => setFailed(true));
  }, [needed, Keys]);
  return { Keys, failed };
}

export function KeySetupSlot({
  keys,
  children,
}: {
  keys: ReturnType<typeof useKeySetup>;
  children(Keys: typeof KeysExports): ReactNode;
}) {
  return (
    <PageLoadingBoundary
      pending={!keys.Keys && !keys.failed}
      fallback={
        <p role="status" className="flex items-center gap-3 py-6 text-ink-soft">
          <Spinner /> Opening key set-up…
        </p>
      }
    >
      {keys.Keys ? (
        children(keys.Keys)
      ) : keys.failed ? (
        <p role="alert" className="text-sm text-negative">
          Could not open key set-up. Reload Gaps to try again.
        </p>
      ) : null}
    </PageLoadingBoundary>
  );
}

/** The locked class asks for its passphrases in place; first-time set-up swaps in beside it. */
export function LockedClass({
  course,
  request,
  onUnlocked,
  beginUnlock,
}: {
  course: ConnectedGapsCourse;
  request: ClassRequest | null;
  onUnlocked(session: ClassSession): void;
  beginUnlock?(): (session: ClassSession) => boolean;
}) {
  const [checking, setChecking] = useState(request?.kind !== 'setup');
  useEffect(() => {
    if (request?.kind === 'setup') return;
    let active = true;
    const retain = beginUnlock?.();
    void readRememberedClass(course.shareId).then((saved) => {
      if (!active) return;
      if (saved && (!retain || retain(saved))) onUnlocked(saved);
      setChecking(false);
    });
    return () => {
      active = false;
    };
    // One device lookup per mounted class; callbacks do not change its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.shareId]);
  const [step, setStep] = useState<ClassRequest['kind']>(
    course.secret ? 'unlock' : (request?.kind ?? 'unlock'),
  );
  const card = useRef<HTMLDivElement>(null);
  // The step whose first field takes focus once it has rendered.
  const focusNext = useRef<ClassRequest['kind'] | null>(request?.kind ?? null);
  const keys = useKeySetup(step === 'setup');

  useEffect(() => {
    if (!request) return;
    const next = course.secret ? 'unlock' : request.kind;
    setStep(next);
    focusNext.current = next;
  }, [request, course.secret]);
  // Focus waits for the step's form, which may still be loading.
  useEffect(() => {
    if (checking || focusNext.current !== step || (step === 'setup' && !keys.Keys)) return;
    focusNext.current = null;
    focusFirstField(card.current);
  }, [step, keys.Keys, request, checking]);

  function show(next: ClassRequest['kind']) {
    setStep(next);
    focusNext.current = next;
  }

  return (
    <PageLoadingBoundary pending={checking} fallback={<ResultsSkeleton />}>
      {!checking && (
        <SectionCard className="gaps-rise flex flex-col items-center px-6 py-14 text-center md:py-16">
          <ClassGlyph locked size={64} />
          <div ref={card} key={step} className="gaps-fade flex w-full flex-col items-center">
            <h2 className="mt-6 font-display text-3xl font-semibold tracking-tight">
              {step === 'unlock' ? 'Unlock to see results' : 'Protect this class'}
            </h2>
            <p className="mt-3 max-w-sm text-ink-soft">
              {step === 'unlock'
                ? 'Results are decrypted only on this device.'
                : 'Only this key can read your pupils’ reports.'}
            </p>
            <div className="mt-10 w-full max-w-sm text-left">
              {step === 'unlock' ? (
                <UnlockForm
                  course={course}
                  onUnlocked={onUnlocked}
                  beginUnlock={beginUnlock}
                  onSetup={() => show('setup')}
                />
              ) : (
                <KeySetupSlot keys={keys}>
                  {(Keys) => (
                    <Keys.TeacherKeySetup
                      initialCourse={course.shareId}
                      initialMode="create"
                      onOpened={(session) => {
                        if (!beginUnlock || beginUnlock()(session)) onUnlocked(session);
                      }}
                      onContinue={() => show('unlock')}
                    />
                  )}
                </KeySetupSlot>
              )}
            </div>
            {!course.secret && (
              <button
                type="button"
                onClick={() => show(step === 'unlock' ? 'setup' : 'unlock')}
                className={`${buttonClassName('ghost')} mt-4`}
              >
                {step === 'unlock' ? 'First time? Set up' : 'Back to unlock'}
              </button>
            )}
          </div>
        </SectionCard>
      )}
    </PageLoadingBoundary>
  );
}

function UnlockForm({
  course,
  onUnlocked,
  beginUnlock,
  onSetup,
}: {
  course: ConnectedGapsCourse;
  onUnlocked(session: ClassSession): void;
  beginUnlock?(): (session: ClassSession) => boolean;
  onSetup(): void;
}) {
  const [remember, setRemember] = useState(true);
  const [connectionPhrase, setConnectionPhrase] = useState('');
  const [keyPhrase, setKeyPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; setup: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const code = course.secret ? normaliseRecoveryCode(connectionPhrase) : null;
    if (course.secret && !code) {
      setError({
        message: 'Check the recovery code. It has 24 letters and numbers.',
        setup: false,
      });
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    const retain = beginUnlock?.();
    setBusy(true);
    setError(null);
    const connections = createGapsConnectionStore(),
      keys = createInsightsOwnerStore();
    try {
      const connection = await connections.unlock(course.shareId, code ?? connectionPhrase);
      if (!connection) throw new Error('This course connection was removed. Connect it again.');
      const owner = await keys.unlock(course.shareId, code ?? keyPhrase);
      controller.signal.throwIfAborted();
      if (!owner) {
        setError({ message: 'This browser has no key for this class yet.', setup: !course.secret });
        return;
      }
      const session: ClassSession = { connection, owner, days: new Map() };
      if (remember) session.remembered = await rememberClass(session);
      if (controller.signal.aborted || (retain && !retain(session))) {
        if (session.remembered) await forgetRememberedClass(course.shareId);
        return;
      }
      onUnlocked(session);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError({
        message: course.secret
          ? cause instanceof Error && cause.message
            ? cause.message.replace(/passphrases?/gi, 'recovery code')
            : 'Could not unlock. Check the recovery code.'
          : cause instanceof Error
            ? cause.message
            : 'Could not unlock. Check both passphrases.',
        setup: false,
      });
    } finally {
      connections.close();
      keys.close();
      setConnectionPhrase('');
      setKeyPhrase('');
      setBusy(false);
      setAttempt((value) => value + 1);
    }
  }

  return (
    <form onSubmit={(event) => void unlock(event)} aria-label="Unlock class" className="space-y-5">
      <fieldset disabled={busy} className="space-y-5">
        <Field label={course.secret ? 'Recovery code' : 'Connection passphrase'}>
          <Input
            type="password"
            autoComplete="off"
            required
            spellCheck={course.secret ? false : undefined}
            autoCapitalize={course.secret ? 'characters' : undefined}
            value={connectionPhrase}
            onChange={(event) => setConnectionPhrase(event.target.value)}
          />
        </Field>
        {!course.secret && (
          <Field label="Recovery passphrase">
            <Input
              type="password"
              autoComplete="off"
              required
              value={keyPhrase}
              onChange={(event) => setKeyPhrase(event.target.value)}
            />
          </Field>
        )}
        <RememberClassCheckbox checked={remember} onChange={setRemember} />
      </fieldset>
      {error && (
        <div key={attempt} role="alert" className="gaps-shake space-y-3 text-sm text-negative">
          <p>{error.message}</p>
          {error.setup && (
            <button type="button" className={buttonClassName('secondary', 'sm')} onClick={onSetup}>
              Set up or restore this class
            </button>
          )}
        </div>
      )}
      <button
        type="submit"
        disabled={busy}
        className={`${buttonClassName('primary', 'lg')} gaps-press w-full`}
      >
        {busy ? <Spinner /> : <UnlockIcon width={18} height={18} />}
        {busy ? 'Unlocking…' : 'Unlock class'}
      </button>
    </form>
  );
}
