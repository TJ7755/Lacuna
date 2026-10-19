import type { ReactNode } from 'react';
import { PAGE_FRAME } from '../components/course/coursePageLayout';
import { buttonClassName } from '../components/ui/buttonStyles';
import { SectionCard } from '../components/ui/SectionCard';
import './teacherWorkspace.css';

/** The teacher presentation accepts local management content only from the in-app caller. */
export function TeacherHomeView({ children }: { children?: ReactNode }) {
  return (
    <main className={`teacher-workspace ${PAGE_FRAME} min-h-screen py-6 text-ink md:py-10`}>
      <header className="teacher-masthead">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-display text-4xl font-semibold tracking-tight">Gaps</h1>
          <p className="text-ink-soft">Daily class reports</p>
        </div>
        <a href="https://getlacuna.app/#/" className={buttonClassName('secondary')}>
          Open Lacuna
        </a>
      </header>
      {children ?? <TeacherEmptyState standalone />}
      <footer className="teacher-footer text-sm text-ink-soft">
        <details>
          <summary>About daily reports and pupil privacy</summary>
          <div className="mt-3 max-w-2xl space-y-2">
            <p>
              Pupils choose whether to share results. Reporting requires an enabled pupil build and
              relay; connecting a class does not turn it on.
            </p>
            <p>
              Reports cover the latest completed UTC day when pupils open Lacuna online. Missed days
              are not backfilled. No report does not mean no study.
            </p>
            <p>
              Names are self-reported, not verified identity or attendance. The relay retains
              encrypted reports for 84 days; physical deletion may lag.
            </p>
            <a
              href="https://github.com/TJ7755/Lacuna/blob/master/docs/gaps-school-notice.md"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              School data notice
            </a>
          </div>
        </details>
      </footer>
    </main>
  );
}

export function TeacherJourney({
  current,
  onSelect,
  disabled = false,
}: {
  current?: 1 | 2 | 3;
  onSelect?(step: 2 | 3): void;
  disabled?: boolean;
}) {
  return (
    <ol className="teacher-journey" aria-label="Class steps">
      {['Connect a class', 'Give pupils a code', 'Read daily results'].map((label, index) => (
        <li key={label} aria-current={index + 1 === current ? 'step' : undefined}>
          {onSelect && index > 0 ? (
            <button
              type="button"
              disabled={disabled}
              className={`${buttonClassName(index + 1 === current ? 'inverse' : 'secondary')} teacher-step-link`}
              aria-label={index === 1 ? 'Share class code' : 'Daily results'}
              aria-pressed={index + 1 === current}
              onClick={() => onSelect(index === 1 ? 2 : 3)}
            >
              <span className="teacher-step" aria-hidden="true">
                {index + 1}
              </span>
              <span>{label}</span>
            </button>
          ) : (
            <>
              <span className="teacher-step" aria-hidden="true">
                {index + 1}
              </span>
              <span>{label}</span>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

export function TeacherEmptyState({ standalone = false }: { standalone?: boolean }) {
  return (
    <SectionCard aria-labelledby="empty-heading">
      <h2 id="empty-heading" className="font-display text-2xl">
        {standalone ? 'Connect your first class' : 'No published courses here'}
      </h2>
      <p className="mt-3 max-w-2xl text-sm text-ink-soft">
        Open the Share page on the device where you published your course and choose Connect to
        Gaps. Gaps and Lacuna use separate browser storage; your existing courses are kept.
      </p>
      <a href="https://getlacuna.app/#/share" className={`${buttonClassName('secondary')} mt-5`}>
        Open sharing on the main site
      </a>
    </SectionCard>
  );
}
