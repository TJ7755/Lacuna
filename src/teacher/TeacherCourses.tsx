import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Field, Input } from '../components/ui/Field';
import { SectionCard } from '../components/ui/SectionCard';
import { buttonClassName } from '../components/ui/buttonStyles';
import { ShareLinkError } from '../shareLinks/client';
import {
  GAPS_CONNECTION_FILE_MAX_BYTES,
  GapsConnectionFileError,
  parseGapsConnectionFile,
} from './connectionFile';
import { CreateGapsClass } from './CreateGapsClass';
import { TeacherJourney } from './TeacherHomeView';
import { createGapsConnectionStore, type ConnectedGapsCourse } from './connectionStore';

export function TeacherCourses({
  onPrepareKey,
  keySetupOpen,
  onOpenClass,
  onForgotten,
}: {
  onPrepareKey(course: ConnectedGapsCourse): void;
  keySetupOpen: boolean;
  onOpenClass(course: ConnectedGapsCourse): void;
  onForgotten?(shareId: string): void;
}) {
  const [courses, setCourses] = useState<ConnectedGapsCourse[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [useFile, setUseFile] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState('');
  const [removing, setRemoving] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    if (open && useFile) fileInput.current?.focus();
  }, [open, useFile]);

  async function connect(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setConnected('');
    if (!file || file.size > GAPS_CONNECTION_FILE_MAX_BYTES) {
      setError('Choose a Gaps connection file smaller than 8 KiB.');
      return;
    }
    setBusy(true);
    const request = new AbortController();
    controller.current = request;
    const store = createGapsConnectionStore();
    try {
      const text = await file.text();
      await store.connect(text, phrase, { signal: request.signal });
      setCourses(await store.list());
      setConnected(parseGapsConnectionFile(text).shareId);
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

  async function downloadConnection(shareId: string) {
    const store = createGapsConnectionStore();
    try {
      const text = await store.exportConnection(shareId);
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `gaps-course-${shareId}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('Could not download the saved connection. Try again.');
    } finally {
      store.close();
    }
  }

  async function forget(shareId: string) {
    setBusy(true);
    setError(null);
    setConnected('');
    const store = createGapsConnectionStore();
    try {
      await store.forget(shareId);
      onForgotten?.(shareId);
      setCourses((current) => current?.filter((course) => course.shareId !== shareId) ?? null);
    } catch {
      setError('Could not remove this connection from Gaps. Try again.');
    } finally {
      store.close();
      setBusy(false);
    }
  }

  return (
    <div className="teacher-home-grid">
      <SectionCard aria-labelledby="courses-heading">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 tabIndex={-1} id="courses-heading" className="font-display text-2xl">
            {courses?.length
              ? 'Your classes'
              : courses
                ? 'Connect your first class'
                : 'Your classes'}
          </h2>
          {!open && (
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                setUseFile(false);
                setConnected('');
                setError(null);
              }}
              disabled={busy || courses === null}
              className={buttonClassName(courses?.length ? 'secondary' : 'primary')}
            >
              Connect a class
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
            <p>
              Start with any published Lacuna course link. You do not need to own or republish the
              course.
            </p>
            {!open && <p>Choose Connect a class to paste a link or restore a saved connection.</p>}
            <details>
              <summary>Where do I get a connection file?</summary>
              <ol className="mt-3 list-decimal space-y-2 pl-5">
                <li>Open the course’s Share page on the device where you published it.</li>
                <li>
                  Choose <strong>Connect to Gaps</strong>. Set a strong connection passphrase and
                  download the file.
                </li>
                <li>Return here, choose the file and enter that passphrase.</li>
              </ol>
              <a
                href="https://getlacuna.app/#/share"
                className={`${buttonClassName('secondary')} mt-4`}
              >
                Open sharing on the main site
              </a>
            </details>
          </div>
        ) : (
          <ul className="mt-5">
            {courses.map((course) => (
              <li key={course.shareId} className="teacher-class-row">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="break-words font-display text-xl">{course.courseName}</h3>
                    <p className="mt-2 text-xs text-ink-soft">
                      Connection checked {new Date(course.verifiedAt).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={buttonClassName('primary')}
                    disabled={busy || keySetupOpen}
                    onClick={() =>
                      connected === course.shareId ? onPrepareKey(course) : onOpenClass(course)
                    }
                  >
                    {connected === course.shareId ? 'Set up class' : 'Open class'}
                  </button>
                </div>
                <details className="mt-4 text-sm text-ink-soft">
                  <summary>Class setup and connection</summary>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClassName('secondary')}
                      disabled={busy || keySetupOpen}
                      onClick={() => onPrepareKey(course)}
                    >
                      Set up or restore this class
                    </button>
                    <button
                      type="button"
                      className={buttonClassName('secondary')}
                      disabled={busy || keySetupOpen}
                      onClick={() => void downloadConnection(course.shareId)}
                    >
                      Download connection file
                    </button>
                    <button
                      type="button"
                      className={buttonClassName('ghost')}
                      disabled={busy || keySetupOpen}
                      onClick={() => setRemoving(course.shareId)}
                    >
                      Remove connection
                    </button>
                  </div>
                  {removing === course.shareId && (
                    <div className="mt-3 space-y-3" role="group" aria-label="Confirm removal">
                      <p>
                        Remove {course.courseName} from this browser? Your published course, teacher
                        key and pupil copies are kept. You can reconnect with your connection file.
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        className={buttonClassName('danger')}
                        onClick={() => void forget(course.shareId)}
                      >
                        Remove from this browser
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className={`${buttonClassName('ghost')} ml-2`}
                        onClick={() => setRemoving('')}
                      >
                        Keep connection
                      </button>
                    </div>
                  )}
                </details>
              </li>
            ))}
          </ul>
        )}
        {open && (
          <div className="mt-5">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClassName(useFile ? 'secondary' : 'primary')}
                aria-pressed={!useFile}
                disabled={busy}
                onClick={() => setUseFile(false)}
              >
                Use a course link
              </button>
              <button
                type="button"
                className={buttonClassName(useFile ? 'primary' : 'secondary')}
                aria-pressed={useFile}
                disabled={busy}
                onClick={() => setUseFile(true)}
              >
                Use a connection file
              </button>
            </div>
            {!useFile && (
              <CreateGapsClass
                onConnected={(shareId) => {
                  setConnected(shareId);
                  setOpen(false);
                  setAttempt((value) => value + 1);
                }}
              />
            )}
          </div>
        )}
        {open && useFile && (
          <form
            onSubmit={(event) => void connect(event)}
            className="mt-6 space-y-4 border-t border-ink/10 pt-5"
            aria-label="Connect a class"
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
                  ref={fileInput}
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
          <p role="status" className="teacher-notice mt-4 text-sm">
            Class connected. Next, set up a code for your pupils. Save your connection file under
            Class setup and connection. If you have used this class before, restore its saved
            recovery file.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-negative">
            {error}
          </p>
        )}
      </SectionCard>
      <aside className="teacher-guide" aria-label="How a class works">
        <h2 className="font-display text-xl">A class, step by step</h2>
        <TeacherJourney current={courses?.length ? undefined : 1} />
        <p className="text-sm text-ink-soft">
          Pupils decide whether to share their results. You see the recorded work they send, so you
          can decide what to revisit in class.
        </p>
        <details className="mt-5 text-sm text-ink-soft">
          <summary>Using a different device?</summary>
          <p className="mt-3">
            Connections are saved in this browser. To move devices, bring your connection file and
            the separate teacher recovery file, with their passphrases. Existing Lacuna courses are
            kept; Gaps does not open your learner library.
          </p>
        </details>
      </aside>
    </div>
  );
}
