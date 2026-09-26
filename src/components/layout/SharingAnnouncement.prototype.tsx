// Throwaway comparison: three sharing announcements on existing routes via ?variant=A|B|C.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CloseIcon, ShareIcon } from '../ui/icons';
import './SharingAnnouncement.prototype.css';

const names = ['A · The quiet strip', 'B · The invitation', 'C · The field note'];
const dismissalKey = 'lacuna-prototype-sharing-dismissed';

export function SharingAnnouncementPrototype() {
  const [params, setParams] = useSearchParams();
  const index = Math.max(0, ['A', 'B', 'C'].indexOf(params.get('variant') ?? 'A'));
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(dismissalKey) === '1');
  function dismiss() {
    localStorage.setItem(dismissalKey, '1');
    setDismissed(true);
  }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input, textarea, select, [contenteditable]')
      )
        return;
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !['ArrowLeft', 'ArrowRight'].includes(event.key)
      )
        return;
      event.preventDefault();
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set('variant', ['A', 'B', 'C'][(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3]);
          return next;
        },
        { replace: true },
      );
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, setParams]);
  function cycle(delta: number) {
    const next = new URLSearchParams(params);
    next.set('variant', ['A', 'B', 'C'][(index + delta + 3) % 3]);
    setParams(next, { replace: true });
  }
  const action = (
    <Link className="sharing-prototype-action" to="/share" onClick={dismiss}>
      Explore sharing <span aria-hidden="true">↗</span>
    </Link>
  );
  const close = (
    <button className="sharing-prototype-close" onClick={dismiss} aria-label="Dismiss announcement">
      <CloseIcon width={16} height={16} />
    </button>
  );
  return (
    <>
      {!dismissed && (
        <section
          aria-label="New sharing features"
          className={`sharing-prototype sharing-prototype-${index}`}
        >
          {close}
          {index === 0 && (
            <>
              <span className="sharing-prototype-icon" aria-hidden="true">
                <ShareIcon width={20} height={20} />
              </span>
              <div className="sharing-prototype-copy">
                <span className="sharing-prototype-eyebrow">New in Lacuna</span>
                <h2>Your course. One link. Everyone in.</h2>
                <p>Share lessons, cards and media with a link or QR code.</p>
              </div>
              {action}
            </>
          )}
          {index === 1 && (
            <>
              <div className="sharing-prototype-copy">
                <span className="sharing-prototype-eyebrow">Better, together</span>
                <h2>
                  Good revision
                  <br />
                  is worth sharing.
                </h2>
                <p>Send your whole course with one link. Lessons, cards and media come along.</p>
                {action}
              </div>
              <div className="sharing-prototype-art" aria-hidden="true">
                <div className="sharing-prototype-sheet">
                  <span>YOUR COURSE</span>
                  <div />
                  <div />
                  <div />
                  <strong>Ready to pass on.</strong>
                </div>
                <div className="sharing-prototype-link">
                  <ShareIcon width={19} height={19} /> One link. A whole course.
                </div>
              </div>
            </>
          )}
          {index === 2 && (
            <>
              <div className="sharing-prototype-note">
                <span className="sharing-prototype-eyebrow">The latest / Sharing</span>
                <h2>Pass it on.</h2>
                {action}
              </div>
              <div className="sharing-prototype-detail">
                <span className="sharing-prototype-number">01</span>
                <div>
                  <h3>A course, in a link.</h3>
                  <p>
                    Share lessons, cards and media. Send a link or let someone scan the QR code.
                  </p>
                </div>
              </div>
              <div className="sharing-prototype-detail">
                <span className="sharing-prototype-number">02</span>
                <div>
                  <h3>Room to keep improving.</h3>
                  <p>
                    Republish to the same link. Students can review updates and keep their study
                    progress.
                  </p>
                </div>
              </div>
            </>
          )}
        </section>
      )}
      <div className="sharing-prototype-switcher" aria-label="Announcement design preview">
        <button aria-label="Previous design" onClick={() => cycle(-1)}>
          ←
        </button>
        <div>
          <strong>{names[index]}</strong>
          <small>
            Prototype · {dismissed ? 'dismissed on this browser' : 'visible until dismissed'}
          </small>
        </div>
        <button aria-label="Next design" onClick={() => cycle(1)}>
          →
        </button>
        {dismissed && (
          <button
            onClick={() => {
              localStorage.removeItem(dismissalKey);
              setDismissed(false);
            }}
          >
            Show again
          </button>
        )}
      </div>
    </>
  );
}
