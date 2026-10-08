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
    <div className="sharing-announcement-frame">
      <section aria-label="New sharing features" className="sharing-announcement">
        <span className="sharing-announcement-icon" aria-hidden="true">
          <ShareIcon width={18} height={18} />
        </span>
        <p>
          <strong>One link to share it all.</strong>{' '}
          <span>Lessons, cards and media come along.</span>
        </p>
        <Link
          className="sharing-announcement-action"
          to="/share?highlight=share-link"
          onClick={dismiss}
        >
          {/* One flex item, so the detail's leading space survives. */}
          <span>
            Explore<span className="sharing-announcement-action-detail"> sharing</span>
          </span>
        </Link>
        <button
          type="button"
          className="sharing-announcement-close"
          onClick={dismiss}
          aria-label="Dismiss announcement"
        >
          <CloseIcon width={16} height={16} />
        </button>
      </section>
    </div>
  );
}
