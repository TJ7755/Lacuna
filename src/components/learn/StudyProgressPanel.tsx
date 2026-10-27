import type { StudyProgress } from '../../course/studyProgress';
import { ProgressBar } from '../ui/ProgressBar';

/** The current course evidence, refreshed at the activity boundary rather than while answering. */
export function StudyProgressPanel({ progress }: { progress: StudyProgress }) {
  const { exam, fsrs, priorities, otherTopics = [] } = progress;
  const visible = priorities.slice(0, 3);
  return (
    <section aria-label="Progress and priorities" className="study-progress-panel">
      {exam ? (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">{exam.name}</h3>
            <p className="text-sm text-ink-soft">
              {exam.daysRemaining === 0
                ? 'Today'
                : `${exam.daysRemaining} ${exam.daysRemaining === 1 ? 'day' : 'days'} to go`}
              {' · '}
              {new Date(exam.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </p>
          </div>
          {exam.value === null ? (
            <p className="mt-3 text-sm text-ink-soft">
              No card recall data for this assessment yet.
            </p>
          ) : (
            <>
              <div className="mt-3 flex items-baseline justify-between gap-4">
                <p className="text-sm text-ink-soft">{exam.label} on exam day</p>
                <p className="font-display text-2xl font-semibold tabular-nums">
                  {Math.round(exam.value * 100)}%
                </p>
              </div>
              <ProgressBar
                label={`${exam.label} on exam day`}
                value={exam.value}
                height={6}
                className="mt-2"
              />
              <p className="mt-2 text-sm text-ink-soft">
                {exam.securedCards} of {exam.totalCards} cards at 90% predicted recall. Forecast
                from current card memory; exam marks are separate.
              </p>
            </>
          )}
        </div>
      ) : (
        <div>
          <h3 className="font-semibold">FSRS progress</h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Fact label="Due now" value={fsrs.dueCards} />
            <Fact label="New" value={fsrs.newCards} />
            <Fact label="Learning" value={fsrs.learningCards} />
            <Fact label="Review" value={fsrs.reviewCards} />
          </dl>
          <p className="mt-3 text-sm text-ink-soft">
            {fsrs.recallNow === null
              ? 'No reviewed cards yet.'
              : `${Math.round(fsrs.recallNow * 100)}% estimated recall now in reviewed cards`}
            {fsrs.meanStability !== null &&
              ` · ${fsrs.meanStability.toFixed(1)} days average stability`}
          </p>
        </div>
      )}
      <div className="mt-5 border-t border-line pt-4">
        <h3 className="font-semibold">Study priorities</h3>
        {priorities.length ? (
          <>
            <ul className="mt-1 divide-y divide-line">
              {visible.map((priority) => (
                <Priority key={priority.conceptId} priority={priority} />
              ))}
            </ul>
            {priorities.length > visible.length && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer py-2 text-ink-soft">
                  {priorities.length - visible.length} more topics
                </summary>
                <ul className="divide-y divide-line">
                  {priorities.slice(3).map((priority) => (
                    <Priority key={priority.conceptId} priority={priority} />
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">No scheduled practice right now.</p>
        )}
        {otherTopics.length > 0 && (
          <details className="mt-3 text-sm" open={priorities.length === 0}>
            <summary className="cursor-pointer py-2 font-medium">
              Other topics and skills · {otherTopics.length}
            </summary>
            <ul className="divide-y divide-line">
              {otherTopics.map((priority) => (
                <Priority key={priority.conceptId} priority={priority} scheduled={false} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Priority({
  priority,
  scheduled = true,
}: {
  priority: StudyProgress['priorities'][number];
  scheduled?: boolean;
}) {
  const gapCount = priority.skills.filter((skill) => skill.latestOutcome === 'gap').length;
  return (
    <li className="py-3 text-sm">
      <h4 className="font-semibold">{priority.name}</h4>
      {!scheduled && <p className="mt-1 text-ink-faint">No scheduled practice</p>}
      <p className="mt-1 text-ink-soft">
        {`${priority.dueCards} ${priority.dueCards === 1 ? 'card' : 'cards'} due · ${priority.newCards} new · ${priority.questionCount} exam ${priority.questionCount === 1 ? 'question' : 'questions'} in pool`}
      </p>
      {(priority.knowledgeGap || priority.applicationGap) && (
        <p className="mt-1 text-ink-soft">
          {priority.knowledgeGap
            ? 'Review the knowledge behind these questions.'
            : 'Practise applying this knowledge.'}
        </p>
      )}
      {priority.skills.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-ink-soft">
            {priority.skills.length} exam {priority.skills.length === 1 ? 'skill' : 'skills'}
            {gapCount > 0 ? ` · ${gapCount} with an observed gap` : ''}
          </summary>
          <ul className="mt-2 space-y-2 pl-3">
            {priority.skills.map((skill) => (
              <li key={skill.id}>
                <span className="font-medium">{skill.name}</span>
                <span className="block text-ink-soft">
                  {skill.latestOutcome === undefined
                    ? 'Not yet assessed'
                    : `${skill.demonstratedCount} demonstrated · ${skill.gapCount} with gaps · latest: ${skill.latestOutcome === 'gap' ? 'gap observed' : 'demonstrated'}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 pl-3 text-xs text-ink-faint">
            Counts are assessed answers in this topic.
          </p>
        </details>
      )}
    </li>
  );
}
