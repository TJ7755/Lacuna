import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Field, Input } from '../components/ui/Field';
import { SectionCard } from '../components/ui/SectionCard';
import { buttonClassName } from '../components/ui/buttonStyles';
import { ShareLinkError } from '../shareLinks/client';
import { GAPS_CONNECTION_FILE_MAX_BYTES, GapsConnectionFileError } from './connectionFile';
import { createGapsConnectionStore, type ConnectedGapsCourse } from './connectionStore';

export function TeacherCourses({
  onPrepareKey,
  keySetupOpen,
  onOpenClass,
}: {
  onPrepareKey(shareId: string): void;
  keySetupOpen: boolean;
  onOpenClass(course: ConnectedGapsCourse): void;
}) {
  const [courses, setCourses] = useState<ConnectedGapsCourse[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    const store = createGapsConnectionStore();
    void store
      .list()
      .then(
        (saved) => {
          if (active) {
            setCourses(saved);
            setError(null);
          }
        },
        () => {
          if (active)
            setError(
              'Could not read saved courses. Check that browser storage is available and try again.',
            );
        },
      )
      .finally(() => store.close());
    return () => {
      active = false;
      controller.current?.abort();
    };
  }, [attempt]);

  async function connect(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setConnected(false);
    if (!file || file.size > GAPS_CONNECTION_FILE_MAX_BYTES) {
      setError('Choose a Gaps connection file smaller than 8 KiB.');
      return;
    }
    setBusy(true);
    const request = new AbortController();
    controller.current = request;
    const store = createGapsConnectionStore();
    try {
      await store.connect(await file.text(), phrase, { signal: request.signal });
      setCourses(await store.list());
      setConnected(true);
      setOpen(false);
      setFile(null);
    } catch (cause) {
      setError(
        request.signal.aborted
          ? 'Connection cancelled.'
          : cause instanceof ShareLinkError
            ? cause.status === 401
              ? 'This file does not own the course. Export a fresh connection from the device that published it.'
              : cause.status === 404 || cause.status === 410
                ? 'This share link is missing or expired. Publish it again in Lacuna, then export a new connection.'
                : 'Could not verify course ownership with the relay. Try again later.'
            : cause instanceof GapsConnectionFileError
              ? cause.message
              : 'Could not open or save the connection. Check the file, passphrase and browser storage, then try again.',
      );
    } finally {
      store.close();
      setPhrase('');
      setBusy(false);
      controller.current = null;
    }
  }

  async function forget(shareId: string) {
    setBusy(true);
    setError(null);
    setConnected(false);
    const store = createGapsConnectionStore();
    try {
      await store.forget(shareId);
      setCourses((current) => current?.filter((course) => course.shareId !== shareId) ?? null);
    } catch {
      setError('Could not remove this connection from Gaps. Try again.');
    } finally {
      store.close();
      setBusy(false);
    }
  }

  return (
    <SectionCard aria-labelledby="courses-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="courses-heading" className="font-display text-2xl">
          {courses?.length ? 'Your courses' : courses ? 'No courses connected' : 'Your courses'}
        </h2>
        {!open && (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setConnected(false);
              setError(null);
            }}
            disabled={busy || courses === null}
            className={buttonClassName('primary')}
          >
            Connect a course
          </button>
        )}
      </div>
      {courses === null ? (
        <div className="mt-4">
          <p role="status" className="text-sm text-ink-soft">
            Loading saved courses…
          </p>
          {error && (
            <button
              type="button"
              className={`${buttonClassName('secondary')} mt-3`}
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try again
            </button>
          )}
        </div>
      ) : courses.length === 0 ? (
        <div className="mt-4 space-y-4 text-sm text-ink-soft">
          <p>Bring a published Lacuna course into Gaps. Its share link stays the same.</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Open the course’s Share page on the device where you published it.</li>
            <li>
              Choose <strong className="font-medium text-ink">Connect to Gaps</strong> and download
              the encrypted connection file.
            </li>
            <li>
              Choose <strong className="font-medium text-ink">Connect a course</strong> here and
              enter that file’s passphrase.
            </li>
          </ol>
          <a href="https://getlacuna.app/#/share" className={buttonClassName('secondary')}>
            Open sharing on the main site
          </a>
          <p>
            Existing courses saved on this domain are kept. Gaps does not open or migrate your
            learner library.
          </p>
        </div>
      ) : (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2">
          {courses.map((course) => (
            <li key={course.shareId} className="rounded-2xl border border-ink/10 bg-paper p-5">
              <h3 className="break-words font-display text-xl">{course.courseName}</h3>
              <p className="mt-2 text-xs text-ink-soft">
                Ownership checked {new Date(course.verifiedAt).toLocaleDateString('en-GB')}
              </p>
              <p className="mt-4 text-sm text-ink-soft">
                Prepare or restore its teacher key, then open the class to publish an invitation and
                read encrypted daily reports.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClassName('primary')}
                  disabled={busy || keySetupOpen}
                  onClick={() => onOpenClass(course)}
                >
                  Open class
                </button>
                <button
                  type="button"
                  className={buttonClassName('secondary')}
                  disabled={busy || keySetupOpen}
                  onClick={() => onPrepareKey(course.shareId)}
                >
                  Set up teacher key
                </button>
                <button
                  type="button"
                  className={buttonClassName('ghost')}
                  disabled={busy || keySetupOpen}
                  onClick={() => void forget(course.shareId)}
                >
                  Remove connection
                </button>
              </div>
              <p className="mt-3 text-xs text-ink-soft">
                Removing this connection keeps your published course and teacher key.
              </p>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <form
          onSubmit={(event) => void connect(event)}
          className="mt-6 space-y-4 border-t border-ink/10 pt-5"
          aria-label="Connect a course"
        >
          <p className="text-sm text-ink-soft">
            Gaps checks ownership with the shared Lacuna relay before saving the encrypted
            connection. Your passphrase stays on this device.
          </p>
          <fieldset disabled={busy} className="space-y-4">
            <Field
              label="Encrypted connection file"
              hint="Select the gaps-course JSON file exported from Lacuna, not a teacher-key recovery file."
            >
              <Input
                type="file"
                accept=".json,application/json"
                required
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </Field>
            <Field label="Connection passphrase">
              <Input
                type="password"
                autoComplete="off"
                required
                value={phrase}
                onChange={(event) => setPhrase(event.target.value)}
              />
            </Field>
            <button type="submit" className={buttonClassName('primary')}>
              {busy ? 'Verifying ownership…' : 'Verify and connect'}
            </button>
          </fieldset>
          <button
            type="button"
            className={buttonClassName('ghost')}
            onClick={() => {
              if (busy) controller.current?.abort();
              else {
                setOpen(false);
                setPhrase('');
                setFile(null);
                setError(null);
              }
            }}
          >
            {busy ? 'Cancel connection' : 'Cancel'}
          </button>
        </form>
      )}
      {connected && (
        <p role="status" className="mt-4 text-sm text-ink">
          Course connected.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-negative">
          {error}
        </p>
      )}
    </SectionCard>
  );
}
