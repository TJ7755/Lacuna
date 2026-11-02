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
import { StepSwap } from '../ui/StepSwap';

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'done'; ids: ReadonlySet<string>; stopped?: 'failed' | 'cancelled' };

/**
 * Jev classifies when the author asks, once the set is written, rather than while they type.
 * Confident tags count at once, unsure ones wait as outlined suggestions, and the author's own decisions are
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
    <AppLink to={`/course/${content.courseId}/settings?section=techniques`}>Add techniques</AppLink>
  ) : !settings.enabled ? (
    'Jev is off'
  ) : status.state === 'paused' ? (
    'Jev is paused'
  ) : !hasPoints ? (
    'Nothing to classify'
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
  const running = phase.kind === 'running';
  // The status keeps one line and the button one width, whatever state the run is in.
  const statusKey = running ? 'running' : blocked ? 'blocked' : summary ? 'done' : 'idle';
  return (
    <div className="qs-classify-bar" role="region" aria-label="Classify techniques">
      <Button
        variant="secondary"
        size="sm"
        disabled={!running && Boolean(blocked)}
        onClick={() => (running ? controller.current?.abort() : void run())}
      >
        <span className="qs-classify-label">
          <span data-shown={!running || undefined}>Classify techniques</span>
          <span data-shown={running || undefined}>Stop</span>
        </span>
      </Button>
      <div role="status" className="qs-classify-status">
        <StepSwap stepKey={statusKey}>
          {phase.kind === 'running' ? (
            <span className="tabular-nums">
              {phase.done}/{phase.total}
            </span>
          ) : blocked ? (
            blocked
          ) : summary ? (
            <ClassificationResult
              summary={summary}
              stopped={phase.kind === 'done' ? phase.stopped : undefined}
              onCountKnowledge={() =>
                phase.kind === 'done' &&
                session.update((set) => countTaggedKnowledgeAsExamTechnique(set, phase.ids))
              }
            />
          ) : null}
        </StepSwap>
      </div>
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
  const parts = [
    stopped === 'failed' ? 'Failed' : stopped === 'cancelled' ? 'Stopped' : null,
    `${summary.tagged}/${summary.classified} tagged`,
    summary.unsure ? `${summary.unsure} unsure` : null,
  ].filter(Boolean);
  return (
    <>
      {parts.join(' · ')}
      {summary.knowledge > 0 && (
        <span className="is-warning" title="Knowledge points do not count towards techniques">
          {' · '}
          {summary.knowledge} not counted{' '}
          <button type="button" onClick={onCountKnowledge}>
            Count {summary.knowledge === 1 ? 'it' : 'them'}
          </button>
        </span>
      )}
    </>
  );
}
