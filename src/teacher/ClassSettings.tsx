import { useEffect, useId, useRef, useState } from 'react';
import { buttonClassName } from '../components/ui/buttonStyles';
import { createGapsConnectionStore, type ConnectedGapsCourse } from './connectionStore';
import { Disclosure, DisclosureChevron } from './gapsUi';
import { downloadGapsFile } from './connectionFile';
import { downloadClassRecoveryFile } from './classRecoveryFile';
import { useKeySetup, KeySetupSlot } from './ClassAccess';

/** Secondary class settings open in place, as a course's settings rows do in Lacuna. */
export function ClassSettings({
  course,
  locked,
  onRemoved,
}: {
  course: ConnectedGapsCourse;
  locked: boolean;
  onRemoved(): void;
}) {
  const [open, setOpen] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  async function downloadConnection() {
    setDownloadError('');
    const store = createGapsConnectionStore();
    try {
      if (course.secret) {
        await downloadClassRecoveryFile(course.shareId);
        return;
      }
      const text = await store.exportConnection(course.shareId);
      downloadGapsFile(text, `gaps-course-${course.shareId}.json`);
    } catch {
      setDownloadError('Could not download the saved connection. Try again.');
    } finally {
      store.close();
    }
  }
  const id = useId();
  const keys = useKeySetup(recovery);
  const checked = new Date(course.verifiedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return (
    <section className="mt-16 border-t border-line pt-2">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex min-h-11 w-full items-center gap-4 rounded-2xl px-2 py-5 text-left transition-colors hover:bg-ink/[0.03] active:bg-ink/[0.06]"
        >
          <span className="min-w-0 flex-1 font-semibold text-ink">Class settings</span>
          <span className="hidden text-right text-sm font-normal text-ink-faint sm:block">
            Connection checked {checked}
          </span>
          <DisclosureChevron open={open} />
        </button>
      </h2>
      <Disclosure open={open} id={id} className="flex flex-col gap-8 px-2 pb-8 pt-2">
        {!locked && !course.secret && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-semibold">Recovery file</p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  Save another copy, or restore this class’s key.
                </p>
              </div>
              <button
                type="button"
                aria-expanded={recovery}
                aria-controls={`${id}-recovery`}
                onClick={() => setRecovery(!recovery)}
                className={`${buttonClassName('secondary', 'sm')} gaps-press`}
              >
                Set up or restore this class
                <DisclosureChevron open={recovery} className="text-current" />
              </button>
            </div>
            <Disclosure open={recovery} id={`${id}-recovery`} className="max-w-md pt-6">
              <KeySetupSlot keys={keys}>
                {(Keys) => (
                  <Keys.TeacherKeySetup initialCourse={course.shareId} initialMode="download" />
                )}
              </KeySetupSlot>
            </Disclosure>
          </div>
        )}
        <div>
          <button
            type="button"
            className={buttonClassName('secondary')}
            onClick={() => void downloadConnection()}
          >
            {course.secret ? 'Download class recovery file' : 'Download connection file'}
          </button>
          {downloadError && (
            <p role="alert" className="mt-2 text-sm text-negative">
              {downloadError}
            </p>
          )}
        </div>
        <RemoveClass course={course} onRemoved={onRemoved} />
      </Disclosure>
    </section>
  );
}

/** Removal confirms in place of its button, as Lacuna's danger zone does. */
function RemoveClass({ course, onRemoved }: { course: ConnectedGapsCourse; onRemoved(): void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (confirming) keep.current?.focus();
    else if (wasConfirming.current) trigger.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  async function remove() {
    setBusy(true);
    setError('');
    const store = createGapsConnectionStore();
    try {
      await store.forget(course.shareId);
      onRemoved();
    } catch {
      setError('Could not remove this connection. Try again.');
      setBusy(false);
    } finally {
      store.close();
    }
  }

  return (
    <div>
      <p className="font-semibold text-negative">Remove connection</p>
      <p className="mb-4 mt-0.5 text-sm text-ink-soft">
        Your course, key and pupils’ copies are kept.
      </p>
      {confirming ? (
        <div
          role="group"
          aria-label="Confirm removal"
          aria-busy={busy}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || busy) return;
            event.preventDefault();
            setConfirming(false);
          }}
          className="gaps-fade flex flex-col gap-3 rounded-2xl border border-negative/20 bg-negative/5 p-4 sm:flex-row sm:items-center"
        >
          <span className="min-w-0 flex-1 text-sm text-ink-soft">
            Remove {course.courseName} from this browser?
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className={buttonClassName('danger', 'sm')}
              onClick={() => void remove()}
            >
              Remove from this browser
            </button>
            <button
              ref={keep}
              type="button"
              disabled={busy}
              className={buttonClassName('secondary', 'sm')}
              onClick={() => setConfirming(false)}
            >
              Keep connection
            </button>
          </div>
        </div>
      ) : (
        <button
          ref={trigger}
          type="button"
          className={buttonClassName('danger', 'sm')}
          onClick={() => setConfirming(true)}
        >
          Remove connection
        </button>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
