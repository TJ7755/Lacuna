import { Fragment, useState } from 'react';
import { categories, comparisonRows, sources, type Category } from './comparisonContent';
import './ComparisonMatrix.css';
import { ComparisonDiagram, diagramFeatures } from './ComparisonDiagrams';

function priority(feature: string) {
  return feature === 'Study direction' ? 0 : feature === 'Organising material' ? 1 : 2;
}

export function ComparisonMatrix() {
  const [category, setCategory] = useState<Category>('Everything');
  const [expanded, setExpanded] = useState<string | null>(null);
  const ordered = [...comparisonRows].sort((a, b) => priority(a.feature) - priority(b.feature));
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
            const illustrated = diagramFeatures.has(row.feature);
            const isOpen = expanded === row.feature;
            const detailId = `qc-matrix-${row.feature.toLowerCase().replaceAll(' ', '-')}`;
            return (
              <Fragment key={row.feature}>
                <tr className={illustrated ? 'qc-matrix-featured' : undefined}>
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
                    <ComparisonDiagram feature={row.feature} lacuna />
                  </td>
                  <td>
                    <span>
                      {row.feature === 'Organising material'
                        ? 'Sets and Study Guides in folders'
                        : row.quizlet}
                    </span>
                    <ComparisonDiagram feature={row.feature} lacuna={false} />
                  </td>
                </tr>
                <tr id={detailId} className="qc-matrix-detail" hidden={!isOpen}>
                  <td colSpan={3}>
                    <div>
                      <p>{row.note}</p>
                      <a
                        href={
                          row.feature === 'Organising material'
                            ? sources.folders.url
                            : sources[row.source].url
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
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
