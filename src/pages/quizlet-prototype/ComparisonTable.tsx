import { Fragment, useState } from 'react';
import { categories, comparisonRows, sources, type Category } from './comparisonContent';

export function ComparisonTable() {
  const [category, setCategory] = useState<Category>('Everything');
  const [expanded, setExpanded] = useState<string | null>(null);
  const rows = comparisonRows.filter(
    (row) => category === 'Everything' || row.category === category,
  );
  return (
    <div className="qc-comparison">
      <div className="qc-table-toolbar">
        <div className="qc-segmented" aria-label="Comparison categories">
          {categories.map((item) => (
            <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <div
        className="qc-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Scrollable feature comparison"
      >
        <table aria-label="Lacuna and Quizlet feature comparison">
          <thead>
            <tr>
              <th scope="col">What matters to you</th>
              <th scope="col">
                <span className="qc-brand-dot" /> Lacuna
              </th>
              <th scope="col">Quizlet</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.feature}>
                <tr>
                  <th scope="row">
                    <button
                      aria-expanded={expanded === row.feature}
                      onClick={() => setExpanded(expanded === row.feature ? null : row.feature)}
                    >
                      {row.feature}
                      <span aria-hidden="true">{expanded === row.feature ? '−' : '+'}</span>
                    </button>
                  </th>
                  <td>{row.lacuna}</td>
                  <td>
                    {row.quizlet}
                    <a
                      href={sources[row.source].url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Source for ${row.feature}`}
                    >
                      Source ↗
                    </a>
                  </td>
                </tr>
                {expanded === row.feature && (
                  <tr className="qc-row-detail">
                    <td colSpan={3}>{row.note}</td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="qc-table-foot">
        <span>Checked 27 September 2026</span>
        <span>Tap a feature for the detail behind the comparison.</span>
      </div>
    </div>
  );
}
