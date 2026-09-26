import { useId, useState } from 'react';
import { Button } from '../ui/Button';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { UpdateReleaseNotes } from './UpdateReleaseNotes';
import './UpdateReadyDialog.css';

export function UpdateReadyDialog({
  version,
  releaseNotes,
  onInstall,
  onLater,
}: {
  version: string;
  releaseNotes?: string;
  onInstall: () => void;
  onLater: () => void;
}) {
  const trapRef = useFocusTrap(true, { autoFocusSelector: '[data-update-install]' });
  const [notesOpen, setNotesOpen] = useState(false);
  const notesId = useId();
  const descriptionId = useId();
  return (
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-label="Update ready"
      aria-describedby={descriptionId}
      className="update-ready fixed inset-0 z-[70] flex items-center justify-center p-4"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onLater();
      }}
    >
      <ModalBackdrop className="update-ready-backdrop" />
      <div className="update-ready-panel">
        <div className="update-ready-art" aria-hidden="true">
          <svg viewBox="0 0 180 220" fill="none" focusable="false">
            <circle cx="90" cy="110" r="76" className="update-ready-accent" strokeWidth="1.8" />
            <g className="update-ready-cards" strokeWidth="1.6">
              <rect x="62" y="52" width="56" height="100" rx="8" />
              <rect x="54" y="62" width="72" height="100" rx="8" />
              <rect x="46" y="72" width="88" height="100" rx="9" strokeWidth="1.8" />
            </g>
            <path
              d="M90 133V101m-13 13 13-13 13 13"
              className="update-ready-accent"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M74 151h32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div className="update-ready-copy">
          <div className="update-ready-content">
            <h2>
              Ready when
              <br />
              you are.
            </h2>
            <p id={descriptionId}>
              Lacuna {version} is ready to install.
              <br />
              Restart to update and reopen.
            </p>
            {releaseNotes?.trim() && (
              <div className="update-ready-notes">
                <button
                  type="button"
                  className="update-ready-disclosure"
                  aria-expanded={notesOpen}
                  aria-controls={notesId}
                  onClick={() => setNotesOpen(!notesOpen)}
                >
                  What’s new <span aria-hidden="true">{notesOpen ? '−' : '+'}</span>
                </button>
                {notesOpen && (
                  <div
                    id={notesId}
                    role="region"
                    aria-label={`Changes in version ${version}`}
                    tabIndex={0}
                    className="update-ready-notes-scroll"
                  >
                    <UpdateReleaseNotes source={releaseNotes} />
                    <a
                      href={`https://github.com/TJ7755/Lacuna/releases/tag/v${encodeURIComponent(version)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="update-ready-release-link"
                    >
                      Full release notes
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="update-ready-actions">
            <Button variant="ghost" onClick={onLater}>
              Later
            </Button>
            <Button
              data-update-install
              variant="ghost"
              className="update-ready-install"
              onClick={onInstall}
            >
              Restart Lacuna
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
