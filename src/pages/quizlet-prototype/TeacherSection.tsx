import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Arrow } from './PrototypeUi';
import './TeacherSection.css';

export function TeacherSection() {
  const [updates, setUpdates] = useState(false);
  return (
    <section id="teachers" className="qc-section qc-teachers" aria-labelledby="qc-teachers-title">
      <div className="qc-teachers-intro">
        <h2 id="qc-teachers-title">For teachers. A course link, not a class of logins.</h2>
        <p>
          Share the lessons, notes and practice together. Students import the course and build their
          own revision history.
        </p>
      </div>
      <div className="qc-teachers-panel">
        <div className="qc-teachers-copy">
          <h3>No teacher or student accounts</h3>
          <p>
            Create your course. Share its link or QR code. Students open it, check the contents and
            import.
          </p>
          <div className="qc-teachers-options" aria-label="Course sharing example">
            <button aria-pressed={!updates} onClick={() => setUpdates(false)}>
              First share
            </button>
            <button aria-pressed={updates} onClick={() => setUpdates(true)}>
              Course updates
            </button>
          </div>
          <div className="qc-teachers-detail" aria-live="polite">
            <strong>
              {updates ? 'Republish to the same link' : 'One course, ready for everyone'}
            </strong>
            <p>
              {updates
                ? 'Add a lesson or correct a card, then republish. Students can receive the changes in their existing course.'
                : 'Send it through the channels your class already uses. There is no class roster to set up in Lacuna.'}
            </p>
          </div>
          <Link to="/share" className="qc-button">
            Open course sharing <Arrow />
          </Link>
        </div>
        <div
          className="qc-teachers-flow"
          role="img"
          aria-label="One teacher shares a course link; each student keeps their own study progress"
        >
          <div className="qc-teacher-course">
            <div className="qc-teacher-course-heading">
              <span className="qc-brand-dot" />
              <strong>Your biology course</strong>
            </div>
            <div className="qc-teacher-lessons">
              <span>Enzymes</span>
              <span>Cell structure</span>
              {updates && <span className="qc-teacher-new-lesson">Diffusion added</span>}
            </div>
            <div className="qc-teacher-material">Lessons · Notes · Cards · Questions</div>
          </div>
          <div className="qc-teacher-link">
            <span aria-hidden="true">↓</span>
            <strong>{updates ? 'Same course link' : 'Share link or QR code'}</strong>
          </div>
          <div className="qc-teacher-students">
            {['Student A', 'Student B', 'Student C'].map((student) => (
              <div className="qc-teacher-student" key={student}>
                <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <circle cx="16" cy="10" r="5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M6 28v-3a10 10 0 0 1 20 0v3" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                <strong>{student}</strong>
                <span>{updates ? 'Course updated' : 'Own course copy'}</span>
                <small>Own review history</small>
              </div>
            ))}
          </div>
          <p>
            {updates
              ? 'Existing review history is preserved'
              : 'Shared material. Individual progress.'}
          </p>
        </div>
      </div>
      <div className="qc-teachers-facts">
        <div>
          <strong>Teach a course, not a pile of sets.</strong>
          <p>
            Lessons keep explanations and practice connected. Students can see their progress across
            the course.
          </p>
        </div>
        <div>
          <strong>Each student studies at their own pace.</strong>
          <p>
            Reviews adapt to their answers. Study progress stays on their device; sharing does not
            create a teacher gradebook.
          </p>
        </div>
        <div>
          <strong>Keep the material up to date.</strong>
          <p>
            Updates to existing cards retain their review history. Sharing and updates need a
            connection; larger courses can travel as a course file.
          </p>
        </div>
      </div>
    </section>
  );
}
