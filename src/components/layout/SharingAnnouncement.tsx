import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CloseIcon, ShareIcon } from '../ui/icons';
import './SharingAnnouncement.css';

const dismissalKey = 'lacuna-sharing-announcement-v1-dismissed';
let dismissedThisVisit = false;

function isDismissed() {
  try {
    dismissedThisVisit = localStorage.getItem(dismissalKey) === '1';
    return dismissedThisVisit;
  } catch {
    return dismissedThisVisit;
  }
}

export function SharingAnnouncement() {
  const [dismissed, setDismissed] = useState(isDismissed);
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === dismissalKey || event.key === null) setDismissed(isDismissed());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function dismiss() {
    dismissedThisVisit = true;
    setDismissed(true);
    try {
      localStorage.setItem(dismissalKey, '1');
    } catch {
      // The in-memory state keeps dismissal across shell remounts.
    }
  }

  if (dismissed) return null;
  return (
    <section aria-label="New sharing features" className="sharing-announcement">
      <button
        type="button"
        className="sharing-announcement-close"
        onClick={dismiss}
        aria-label="Dismiss announcement"
      >
        <CloseIcon width={16} height={16} />
      </button>
      <div>
        <h2>
          Good revision
          <br />
          is worth sharing.
        </h2>
        <p>Send your whole course with one link. Lessons, cards and media come along.</p>
        <Link
          className="sharing-announcement-action"
          to="/share?highlight=share-link"
          onClick={dismiss}
        >
          Explore sharing <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <div className="sharing-announcement-art" aria-hidden="true">
        <div className="sharing-announcement-sheet">
          <span>YOUR COURSE</span>
          <div />
          <div />
          <div />
          <strong>Ready to pass on.</strong>
        </div>
        <div className="sharing-announcement-link">
          <ShareIcon width={19} height={19} /> One link to share it all
        </div>
      </div>
    </section>
  );
}
