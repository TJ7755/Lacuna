import { useEffect, useRef, useState } from 'react';
import type { QuestionSet } from '@lacuna/core/questions/questionSets';
import type { CourseTechnique } from '@lacuna/core/questions/techniqueTags';
import { classifyTechniques, useJevSettings, useJevStatus } from '../../jev';
import type { QuestionSetDraftSession } from '../../questions/questionSetDraftSession';
import {
  applyClassification,
  classificationRequests,
  classificationSummary,
  classificationTargets,
  classificationTechniques,
  countTaggedKnowledgeAsExamTechnique,
  type ClassificationOutcome,
} from '../../questions/techniqueClassification';
import { AppLink } from '../ui/AppLink';
import { Button } from '../ui/Button';

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'done'; ids: ReadonlySet<string>; stopped?: 'failed' | 'cancelled' };

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Jev classifies when the author asks, once the set is written, rather than while they type.
 * Confident tags count at once, unsure ones wait in amber, and the author's own decisions are
 * never replaced.
 */
export function TechniqueClassifyBar({
  content,
  session,
  catalogue,
}: {
  content: QuestionSet;
  session: QuestionSetDraftSession;
  catalogue: readonly CourseTechnique[];
}) {
  const settings = useJevSettings();
  const status = useJevStatus();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const techniques = classificationTechniques(catalogue);
  const targets = classificationTargets(content);
  const hasPoints = content.questions.length > 0 && targets.length > 0;
  const blocked = !techniques.length ? (
    <>
      Add techniques to this course to classify.{' '}
      <AppLink to={`/course/${content.courseId}/settings?section=techniques`}>
        Manage techniques
      </AppLink>
    </>
  ) : !settings.enabled ? (
    'Turn on Jev in Settings to classify.'
  ) : status.state === 'paused' ? (
    'Jev is paused. Try again later.'
  ) : !hasPoints ? (
    'Every point has your own choices, or there are no mark schemes yet.'
  ) : null;
  const run = async () => {
    const work = new AbortController();
    controller.current = work;
    const requests = classificationRequests(targets, techniques);
    const ids = new Set<string>();
    setPhase({ kind: 'running', done: 0, total: targets.length });
    let done = 0;
    for (const chunk of requests) {
      const result = await classifyTechniques(
        { purpose: 'technique-classification', techniques, points: chunk.map((row) => row.point) },
        work.signal,
      );
      if (work.signal.aborted || !result) {
        if (controller.current === work)
          setPhase({ kind: 'done', ids, stopped: work.signal.aborted ? 'cancelled' : 'failed' });
        return;
      }
      const outcomes: ClassificationOutcome[] = chunk.map((target, index) => ({
        target,
        ...result.points[index],
      }));
      try {
        session.update((set) => {
          const next = applyClassification(set, outcomes, result.model);
          next.applied.forEach((id) => ids.add(id));
          return next.content;
        });
      } catch {
        // The draft refused the change (for example, it is publishing); end the run cleanly.
        if (controller.current === work) setPhase({ kind: 'done', ids, stopped: 'failed' });
        controller.current = null;
        return;
      }
      done += chunk.length;
      setPhase({ kind: 'running', done, total: targets.length });
    }
    controller.current = null;
    setPhase({ kind: 'done', ids });
  };
  const summary = phase.kind === 'done' ? classificationSummary(content, phase.ids) : null;
  return (
    <div className="qs-classify-bar" role="region" aria-label="Classify techniques">
      {phase.kind === 'running' ? (
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              controller.current?.abort();
            }}
          >
            Stop
          </Button>
          <p role="status" className="qs-classify-status">
            Jev is classifying… {phase.done} of {plural(phase.total, 'point')}
          </p>
        </>
      ) : (
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={Boolean(blocked)}
            onClick={() => void run()}
          >
            Classify techniques
          </Button>
          <div role="status" className="qs-classify-status">
            {blocked ? (
              <p>{blocked}</p>
            ) : summary ? (
              <ClassificationResult
                summary={summary}
                stopped={phase.kind === 'done' ? phase.stopped : undefined}
                onCountKnowledge={() =>
                  phase.kind === 'done' &&
                  session.update((set) => countTaggedKnowledgeAsExamTechnique(set, phase.ids))
                }
              />
            ) : (
              <p>
                Jev tags {plural(targets.length, 'point')} you have not decided. Your own choices
                are kept.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ClassificationResult({
  summary,
  stopped,
  onCountKnowledge,
}: {
  summary: ReturnType<typeof classificationSummary>;
  stopped?: 'failed' | 'cancelled';
  onCountKnowledge: () => void;
}) {
  return (
    <>
      <p>
        {stopped === 'failed'
          ? 'Jev stopped before finishing. '
          : stopped === 'cancelled'
            ? 'Stopped. '
            : ''}
        {summary.classified
          ? `Tagged ${summary.tagged} of ${plural(summary.classified, 'point')}.`
          : 'No points were classified.'}
        {summary.unsure > 0 &&
          ` Jev was unsure about ${plural(summary.unsure, 'point')}: confirm the amber techniques.`}
      </p>
      {summary.knowledge > 0 && (
        <p className="is-warning">
          {summary.knowledge === 1
            ? 'One tagged point tests'
            : `${summary.knowledge} tagged points test`}{' '}
          Knowledge, so {summary.knowledge === 1 ? 'its techniques do' : 'their techniques do'} not
          count.{' '}
          <button type="button" onClick={onCountKnowledge}>
            Count {summary.knowledge === 1 ? 'it' : 'them'} as exam technique
          </button>
        </p>
      )}
    </>
  );
}
