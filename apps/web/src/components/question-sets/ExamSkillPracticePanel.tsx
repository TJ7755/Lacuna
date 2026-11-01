import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  QuestionPracticeExhaustedError,
  startExamSkillPractice,
  type ExamSkillPracticeItem,
} from '../../questions/examSkillPractice';
import { undoConceptPracticeAttempt } from '../../questions/conceptPractice';
import type { TechniqueId } from '@lacuna/core/questions/techniqueTags';
import type { QuestionBankMetadata } from '@lacuna/core/questions/bankMetadata';
import type { QuestionSetAttemptRecord } from '@lacuna/core/questions/questionSetAttempts';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Select } from '../ui/Select';

export function ExamSkillPracticePanel({
  courseId,
  skills,
  recent,
  unfinished,
  disabled,
  blueprints = [],
}: {
  courseId: string;
  skills: ExamSkillPracticeItem[];
  recent?: QuestionSetAttemptRecord;
  unfinished?: QuestionSetAttemptRecord;
  disabled: boolean;
  blueprints?: QuestionBankMetadata['blueprint'][];
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fallback, setFallback] = useState<{ techniqueId?: TechniqueId } | null>(null);
  const [blueprint, setBlueprint] = useState<
    Partial<{ type: string; difficulty: string; context: string }>
  >({});
  const [selectedSkill, setSelectedSkill] = useState<TechniqueId | ''>('');
  const available = skills.filter((skill) => skill.availableCount > 0);
  const start = async (techniqueId?: TechniqueId, allowFamiliar = false) => {
    setBusy(true);
    setError('');
    setFallback(null);
    try {
      const { attempt } = await startExamSkillPractice(courseId, techniqueId, {
        allowFamiliar,
        blueprint,
      });
      await navigate(
        `/course/${courseId}/question-sets/${attempt.questionSetId}/attempts/${attempt.id}`,
        {
          state: {
            questionSetReturnTo: `/course/${courseId}/questions`,
            questionSetReturnLabel: 'Back to Questions',
          },
        },
      );
    } catch (cause) {
      if (
        cause instanceof QuestionPracticeExhaustedError &&
        cause.reason === 'no-unseen-questions'
      ) {
        setFallback({ techniqueId });
      } else setError(cause instanceof Error ? cause.message : 'Could not start skill practice.');
    } finally {
      setBusy(false);
    }
  };
  const undo = async () => {
    if (!recent) return;
    setBusy(true);
    setError('');
    try {
      await undoConceptPracticeAttempt(recent.id, recent.revisionId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not undo practice.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      aria-label="Exam-skill practice"
      aria-busy={busy}
      className="mb-6 min-w-0 rounded-xl border border-line p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Exam-skill practice</h2>
          <p className="text-sm text-ink-soft">
            Practise explicitly tagged exam techniques. Knowledge topics stay linked to their
            questions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={disabled || busy || !available.length}
            onClick={() => void start()}
          >
            Practise exam skills
          </Button>
        </div>
      </div>
      <p className="my-3 text-sm text-ink-soft">
        Questions vary where the bank allows. Written marks are self-assessed; this is practice
        evidence, not a mastery score.
      </p>
      {blueprints.length > 0 && (
        <details className="mb-3 text-sm">
          <summary>Practice boundaries</summary>
          <p className="my-2 text-ink-soft">
            Practice balances authored question types, difficulty and contexts. It does not apply
            official exam weightings.
          </p>
          <div className="flex flex-wrap gap-3">
            {(['type', 'difficulty', 'context'] as const).map((key) => (
              <label key={key} className="min-w-0">
                {key === 'type' ? 'Question type' : key === 'difficulty' ? 'Difficulty' : 'Context'}
                <select
                  className="ml-2 max-w-full rounded border border-line bg-surface p-2"
                  value={blueprint[key] ?? ''}
                  disabled={disabled || busy}
                  onChange={(event) => {
                    setBlueprint((previous) => {
                      const next = { ...previous };
                      if (event.target.value) next[key] = event.target.value;
                      else delete next[key];
                      return next;
                    });
                    setFallback(null);
                  }}
                >
                  <option value="">Any</option>
                  {[...new Set(blueprints.map((row) => row[key]))].sort().map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </details>
      )}
      {!available.length && (
        <p className="my-3 text-sm text-ink-soft">
          No exam skills are explicitly tagged for practice yet. Browse the question sets below.
        </p>
      )}
      <ul className="space-y-2">
        {available.slice(0, 6).map((skill) => (
          <li key={skill.techniqueId} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 flex-1 basis-48">
              {skill.name}{' '}
              <span className="text-sm text-ink-soft">
                ·{' '}
                {skill.readiness === 'unassessed'
                  ? 'Not yet assessed'
                  : skill.due
                    ? 'Due now'
                    : 'Scheduled'}{' '}
                · {skill.unseenCount} unseen / {skill.availableCount} available
                {skill.estimatedRecall !== null && skill.estimatedRecall !== undefined && (
                  <>
                    {' '}
                    · {Math.round(skill.estimatedRecall * 100)}% estimated recall
                    {skill.examDate ? ' at exam' : ' now'}
                  </>
                )}
              </span>
            </span>
            <Button
              size="sm"
              aria-label={`Practise ${skill.name}`}
              disabled={disabled || busy}
              onClick={() => void start(skill.techniqueId)}
            >
              Practise
            </Button>
          </li>
        ))}
      </ul>
      {available.length > 6 && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="All skills" className="min-w-0 max-w-full flex-1 basis-64">
            <Select
              className="mt-2 block w-full min-w-0 max-w-full"
              value={selectedSkill}
              onChange={(event) => setSelectedSkill(event.target.value as TechniqueId | '')}
              disabled={disabled || busy}
            >
              <option value="">Choose a skill</option>
              {available.map((skill) => (
                <option key={skill.techniqueId} value={skill.techniqueId}>
                  {skill.name} ·{' '}
                  {skill.readiness === 'unassessed'
                    ? 'Not yet assessed'
                    : skill.due
                      ? 'Due now'
                      : 'Scheduled'}{' '}
                  · {skill.unseenCount} unseen / {skill.availableCount} available
                  {skill.estimatedRecall !== null && skill.estimatedRecall !== undefined && (
                    <>
                      {' '}
                      · {Math.round(skill.estimatedRecall * 100)}% estimated recall
                      {skill.examDate ? ' at exam' : ' now'}
                    </>
                  )}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            disabled={disabled || busy || !selectedSkill}
            onClick={() => void start(selectedSkill || undefined)}
          >
            Practise selected skill
          </Button>
        </div>
      )}
      {busy && <p role="status">Starting practice…</p>}
      {fallback && (
        <div role="status" className="mt-4">
          <p>
            No unseen questions remain in this pool. Familiar practice repeats previously exposed
            content.
          </p>
          <Button
            disabled={disabled || busy}
            onClick={() => void start(fallback.techniqueId, true)}
          >
            Practise familiar questions
          </Button>
        </div>
      )}
      {unfinished && (
        <Button
          className="mt-3 mr-2"
          disabled={disabled || busy}
          onClick={() =>
            void navigate(
              `/course/${courseId}/question-sets/${unfinished.questionSetId}/attempts/${unfinished.id}`,
              {
                state: {
                  questionSetReturnTo: `/course/${courseId}/questions`,
                  questionSetReturnLabel: 'Back to Questions',
                },
              },
            )
          }
        >
          {unfinished.conceptPractice
            ? 'Resume Concept application practice'
            : 'Resume question practice'}
        </Button>
      )}
      {recent && (
        <Button className="mt-3" size="sm" disabled={disabled || busy} onClick={() => void undo()}>
          Undo latest Concept application practice
        </Button>
      )}
      {error && (
        <p role="alert" className="qs-error">
          {error}
        </p>
      )}
    </section>
  );
}
