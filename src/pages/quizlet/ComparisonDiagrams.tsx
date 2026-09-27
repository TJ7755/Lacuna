import './ComparisonDiagrams.css';

function StudyDirection({ exam }: { exam: boolean }) {
  return (
    <div className={`qc-matrix-direction ${exam ? 'qc-matrix-exam' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 280 70" fill="none">
        <path d="M18 35H260" stroke="currentColor" strokeOpacity=".2" strokeDasharray="3 5" />
        {[18, 74, 130, 186].map((x, i) => (
          <g key={x}>
            <rect
              x={x - 9}
              y={exam ? 24 - i * 3 : 24}
              width="18"
              height="22"
              rx="4"
              fill="var(--qc-matrix-card)"
              stroke="currentColor"
              strokeOpacity=".5"
            />
            <path d={`M${x - 4} ${exam ? 32 - i * 3 : 32}h8`} stroke="currentColor" />
          </g>
        ))}
        {exam ? (
          <g>
            <rect x="230" y="9" width="40" height="48" rx="7" fill="currentColor" />
            <path
              d="M239 7v9m21-9v9m-22 11h24m-23 13 6 6 12-13"
              stroke="var(--qc-matrix-card)"
              strokeWidth="2"
            />
          </g>
        ) : (
          <g>
            <circle cx="250" cy="35" r="16" fill="var(--qc-matrix-card)" stroke="currentColor" />
            <path d="m243 35 5 5 9-10" stroke="currentColor" strokeWidth="2" />
          </g>
        )}
      </svg>
      <div>
        <span>{exam ? 'Reviews adapt' : 'Practise your set'}</span>
        <strong>{exam ? 'Exam day' : 'Build mastery'}</strong>
      </div>
    </div>
  );
}

const descriptions = {
  structure: [
    'Lacuna: course, lessons, notes, cards and questions',
    'Quizlet: folders organise sets and Study Guides',
  ],
  memory: [
    'Lacuna: review history updates a card’s memory model and next review',
    'Quizlet: recall ratings inform scheduled reviews',
  ],
  transfer: [
    'Lacuna: imported cards build a new review history',
    'Quizlet: text export includes terms and definitions, not review history',
  ],
} as const;

function Structure({ lacuna }: { lacuna: boolean }) {
  return (
    <div className="qc-diagram-tree">
      <div className="qc-diagram-root">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 6h7l2 3h9v11H3Z" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        {lacuna ? 'Biology course' : 'Biology folder'}
      </div>
      <div className="qc-diagram-branches">
        {lacuna ? (
          <>
            <div className="qc-diagram-lesson">
              <strong>
                Enzymes <small>Lesson</small>
              </strong>
              <div className="qc-diagram-resources">
                <span>Notes</span>
                <span>Cards</span>
                <span>Questions</span>
              </div>
            </div>
            <div className="qc-diagram-lesson">
              <strong>
                Cell structure <small>Lesson</small>
              </strong>
              <div className="qc-diagram-resources">
                <span>Notes</span>
                <span>Cards</span>
                <span>Questions</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="qc-diagram-set">
              <span className="qc-diagram-stack" aria-hidden="true" />
              <strong>
                Enzymes <small>Flashcard set</small>
              </strong>
            </div>
            <div className="qc-diagram-set">
              <span className="qc-diagram-stack" aria-hidden="true" />
              <strong>
                Cell structure <small>Flashcard set</small>
              </strong>
            </div>
            <div className="qc-diagram-set">
              <span className="qc-diagram-page" aria-hidden="true" />
              <strong>
                Biology <small>Study Guide</small>
              </strong>
            </div>
          </>
        )}
      </div>
      {lacuna && (
        <div className="qc-diagram-course-progress">
          <strong>Course-wide progress</strong>
          <span>Lessons + review history</span>
        </div>
      )}
    </div>
  );
}

function Memory({ lacuna }: { lacuna: boolean }) {
  return (
    <div className="qc-diagram-memory">
      <div className="qc-diagram-history">
        <span>{lacuna ? 'Review history' : 'Recall rating'}</span>
        <svg viewBox="0 0 160 28" fill="none" aria-hidden="true">
          <path d="M10 14h140" stroke="currentColor" strokeOpacity=".25" />
          {[10, 45, 80, 115, 150].map((x) => (
            <circle key={x} cx={x} cy="14" r="4" fill="currentColor" />
          ))}
        </svg>
      </div>
      <div className="qc-diagram-down" aria-hidden="true">
        ↓
      </div>
      <div className="qc-diagram-model">
        <strong>{lacuna ? 'Memory model' : 'Spaced repetition'}</strong>
        <span>{lacuna ? 'Stability + difficulty' : 'Based on what you remember'}</span>
      </div>
      <div className="qc-diagram-down" aria-hidden="true">
        ↓
      </div>
      <div className="qc-diagram-next">
        {lacuna ? 'Next review + exam-day prediction' : 'Scheduled review'}
      </div>
    </div>
  );
}

function Transfer({ lacuna }: { lacuna: boolean }) {
  return (
    <div className="qc-diagram-transfer">
      <div className="qc-diagram-file">
        <span className="qc-diagram-page" aria-hidden="true" />
        <div>
          <strong>{lacuna ? 'Imported cards' : 'Text export'}</strong>
          <small>Terms + definitions</small>
        </div>
      </div>
      <div className="qc-diagram-down" aria-hidden="true">
        ↓
      </div>
      <div className="qc-diagram-transfer-end">
        <strong>{lacuna ? 'New review history' : 'Review history stays behind'}</strong>
        <span>{lacuna ? 'Builds as you study in Lacuna' : 'Not included in the export'}</span>
      </div>
    </div>
  );
}

export const diagramFeatures = new Set([
  'Study direction',
  'Organising material',
  'Spaced repetition',
  'Review history',
]);

export function ComparisonDiagram({ feature, lacuna }: { feature: string; lacuna: boolean }) {
  if (feature === 'Study direction') return <StudyDirection exam={lacuna} />;
  const kind =
    feature === 'Organising material'
      ? 'structure'
      : feature === 'Spaced repetition'
        ? 'memory'
        : feature === 'Review history'
          ? 'transfer'
          : null;
  if (!kind) return null;
  return (
    <div
      className={`qc-feature-diagram ${lacuna ? 'qc-feature-diagram-lacuna' : ''}`}
      role="img"
      aria-label={descriptions[kind][lacuna ? 0 : 1]}
    >
      {kind === 'structure' ? (
        <Structure lacuna={lacuna} />
      ) : kind === 'memory' ? (
        <Memory lacuna={lacuna} />
      ) : (
        <Transfer lacuna={lacuna} />
      )}
    </div>
  );
}
