import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ConceptPracticeExhaustedError,
  startConceptPractice,
  undoConceptPracticeAttempt,
  type ConceptPracticeItem,
} from '../../questions/conceptPractice';
import type { QuestionBankMetadata } from '../../questions/bankMetadata';
import type { QuestionSetAttemptRecord } from '../../questions/questionSetAttempts';
import { Button } from '../ui/Button';

export function ConceptPracticePanel({
  courseId,
  skills,
  recent,
  unfinished,
  disabled,
  blueprints = [],
}: {
  courseId: string;
  skills: ConceptPracticeItem[];
  recent?: QuestionSetAttemptRecord;
  unfinished?: QuestionSetAttemptRecord;
  disabled: boolean;
  blueprints?: QuestionBankMetadata['blueprint'][];
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fallback, setFallback] = useState<{ conceptId?: string; mode: 'due' | 'mixed' } | null>(
    null,
  );
  const [blueprint, setBlueprint] = useState<
    Partial<{ type: string; difficulty: string; context: string }>
  >({});
  const [selectedSkill, setSelectedSkill] = useState('');
  const available = skills.filter((skill) => skill.availableCount > 0);
  const due = available.filter((skill) => skill.due);
  const start = async (
    conceptId?: string,
    allowFamiliar = false,
    mode: 'due' | 'mixed' = 'due',
  ) => {
    setBusy(true);
    setError('');
    setFallback(null);
    try {
      const { attempt } = await startConceptPractice(courseId, conceptId, {
        allowFamiliar,
        mode,
        blueprint,
      });
      await navigate(
        `/course/${courseId}/question-sets/${attempt.questionSetId}/attempts/${attempt.id}`,
        {
          state: {
            questionSetReturnTo: `/course/${courseId}/questions`,
            questionSetReturnLabel: 'Back to skills',
          },
        },
      );
    } catch (cause) {
      if (
        cause instanceof ConceptPracticeExhaustedError &&
        cause.reason === 'no-unseen-questions'
      ) {
        setFallback({ conceptId, mode });
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
  if (!available.length) return null;
  return (
    <section
      aria-label="Skill practice"
      aria-busy={busy}
      className="mb-6 min-w-0 rounded-xl border border-line p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Skill practice</h2>
          <p className="text-sm text-ink-soft">
            {due.length} {due.length === 1 ? 'skill' : 'skills'} due · Application practice is
            separate from recall cards.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={disabled || busy || !due.length}
            onClick={() => void start()}
          >
            Practise due skills
          </Button>
          <Button disabled={disabled || busy} onClick={() => void start(undefined, false, 'mixed')}>
            Mixed practice
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
            Mixed practice balances authored question types, difficulty and contexts. It does not
            apply official exam weightings.
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
      <ul className="space-y-2">
        {available.slice(0, 6).map((skill) => (
          <li key={skill.conceptId} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {skill.name}{' '}
              <span className="text-sm text-ink-soft">
                · {skill.due ? 'due' : 'scheduled'} · {skill.unseenCount} unseen
              </span>
            </span>
            <Button
              size="sm"
              disabled={disabled || busy}
              onClick={() => void start(skill.conceptId)}
            >
              Practise {skill.name}
            </Button>
          </li>
        ))}
      </ul>
      {available.length > 6 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label>
            All skills
            <select
              className="ml-2 max-w-full rounded border border-line bg-surface p-2"
              value={selectedSkill}
              onChange={(event) => setSelectedSkill(event.target.value)}
              disabled={disabled || busy}
            >
              <option value="">Choose a skill</option>
              {available.map((skill) => (
                <option key={skill.conceptId} value={skill.conceptId}>
                  {skill.name} · {skill.due ? 'due' : 'scheduled'} · {skill.unseenCount} unseen
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={disabled || busy || !selectedSkill}
            onClick={() => void start(selectedSkill)}
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
            onClick={() => void start(fallback.conceptId, true, fallback.mode)}
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
                  questionSetReturnLabel: 'Back to skills',
                },
              },
            )
          }
        >
          Resume skill practice
        </Button>
      )}
      {recent && (
        <Button className="mt-3" size="sm" disabled={disabled || busy} onClick={() => void undo()}>
          Undo latest skill practice
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
