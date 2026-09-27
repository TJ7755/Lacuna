import { Fragment, useState } from 'react';
import { categories, comparisonRows, sources, type Category } from './comparisonContent';
import './ComparisonMatrix.css';

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

export function ComparisonMatrix() {
  const [category, setCategory] = useState<Category>('Everything');
  const [expanded, setExpanded] = useState<string | null>(null);
  const ordered = [...comparisonRows].sort(
    (a, b) => Number(b.feature === 'Study direction') - Number(a.feature === 'Study direction'),
  );
  const rows = ordered.filter((row) => category === 'Everything' || row.category === category);
  return (
    <div className="qc-matrix">
      <div className="qc-matrix-filters" aria-label="Comparison categories">
        {categories.map((item) => (
          <button
            key={item}
            aria-pressed={category === item}
            onClick={() => {
              setCategory(item);
              setExpanded(null);
            }}
          >
            {item}
          </button>
        ))}
      </div>
      <table aria-label="Lacuna and Quizlet feature comparison">
        <thead>
          <tr>
            <th scope="col">
              <span>Feature</span>
            </th>
            <th scope="col">
              <span className="qc-brand-dot" />
              Lacuna
            </th>
            <th scope="col">Quizlet</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isExam = row.feature === 'Study direction';
            const isOpen = expanded === row.feature;
            const detailId = `qc-matrix-${row.feature.toLowerCase().replaceAll(' ', '-')}`;
            return (
              <Fragment key={row.feature}>
                <tr className={isExam ? 'qc-matrix-featured' : undefined}>
                  <th scope="row">
                    <button
                      aria-expanded={isOpen}
                      aria-controls={detailId}
                      onClick={() => setExpanded(isOpen ? null : row.feature)}
                    >
                      <span>
                        {row.feature}
                        {isExam && <small>What are you working towards?</small>}
                      </span>
                      <span className="qc-matrix-expand" aria-hidden="true">
                        {isOpen ? '−' : '+'}
                      </span>
                    </button>
                  </th>
                  <td>
                    <span>{row.lacuna}</span>
                    {isExam && <StudyDirection exam />}
                  </td>
                  <td>
                    <span>{row.quizlet}</span>
                    {isExam && <StudyDirection exam={false} />}
                  </td>
                </tr>
                <tr id={detailId} className="qc-matrix-detail" hidden={!isOpen}>
                  <td colSpan={3}>
                    <div>
                      <p>{row.note}</p>
                      <a href={sources[row.source].url} target="_blank" rel="noreferrer">
                        Quizlet source <span aria-hidden="true">↗</span>
                      </a>
                    </div>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <div className="qc-matrix-foot">
        Checked 27 September 2026 · Select a feature for details and sources.
      </div>
    </div>
  );
}
