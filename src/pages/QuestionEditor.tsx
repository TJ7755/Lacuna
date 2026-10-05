import { Skeleton } from '../components/ui/Skeleton';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MarkSchemeEditor } from '../components/items/MarkSchemeEditor';
import {
  NumericAnswerEditor,
  numericAnswerSpecIsValid,
} from '../components/items/NumericAnswerEditor';
import { MarkdownEditor } from '../components/markdown/MarkdownEditor';
import { QuestionSegmented } from '../components/questions/QuestionSegmented';
import { GeneratedQuestionConfiguration } from '../components/questions/GeneratedQuestionConfiguration';
import { useCourseQuestionData, useQuestionRecord } from '../components/questions/useQuestionData';
import { Button } from '../components/ui/Button';
import { ConfirmInlineSwap } from '../components/ui/ConfirmInline';
import { DelayedFallback } from '../components/ui/DelayedFallback';
import { NavigationGuard } from '../components/ui/NavigationGuard';
import { TagInput } from '../components/ui/TagInput';
import { StepSwap } from '../components/ui/StepSwap';
import { useToast } from '../components/ui/Toast';
import { motionTransition } from '../components/ui/motion';
import { ChevronLeftIcon, PlusIcon, TrashIcon } from '../components/ui/icons';
import type { ItemFixture, NumericAnswerSpec } from '../db/types';
import { compileMarkScheme } from '../items/markSchemeCompiler';
import { questionGeneratorRegistry } from '../questions/generators';
import {
  createConcept,
  createFixedQuestion,
  createGeneratedQuestion,
  deleteQuestion,
  updateFixedQuestion,
  updateGeneratedQuestion,
} from '../questions/repository';
import type { QuestionPayload } from '../questions/types';
import { useCourse, useLessons } from '../state/useCourseData';
import { speedMultiplier, useMotionSpeed } from '../state/motionSpeed';
import {
  newQuestionState,
  questionDraftKey,
  questionStateFromRecord,
  type QuestionAnswerKind,
  useQuestionDraft,
} from './questionDraft';

const inputClass =
  'min-h-12 w-full rounded-[14px] border-[1.5px] border-line-strong bg-surface px-4 py-2.5 text-ink outline-none transition focus:border-ink';
const labelClass = 'mb-2 block text-[13px] font-bold text-ink-soft';
const cardClass =
  'rounded-3xl bg-surface shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_16px_40px_-28px_hsl(var(--ink)/0.22)]';

export function QuestionEditor() {
  const { courseId, questionId } = useParams<{ courseId: string; questionId?: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();
  const course = useCourse(courseId);
  const lessons = useLessons(courseId);
  const data = useCourseQuestionData(courseId);
  const record = useQuestionRecord(questionId);
  const editing = Boolean(questionId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const draft = useQuestionDraft(questionDraftKey(courseId ?? 'missing', questionId));
  const {
    kind,
    name,
    newConceptName = '',
    lessonId,
    targetConceptId,
    prerequisiteConceptIds,
    tags,
    suspended,
    prompt,
    explanation,
    answerKind,
    numericAnswer,
    workingSource,
    workingFixtures,
    generatorConfig,
  } = draft.state;
  const [saving, setSaving] = useState(false);
  const [motionSpeed] = useMotionSpeed();
  const motionMultiplier = speedMultiplier(motionSpeed);
  const workingCompilation = useMemo(() => compileMarkScheme(workingSource), [workingSource]);
  const generator = questionGeneratorRegistry.list()[0];

  useEffect(() => {
    if (draft.loaded || data === undefined || (editing && record === undefined)) return;
    if (!editing) {
      draft.initialise(newQuestionState(data.concepts[0]?.id ?? ''));
      return;
    }
    if (!record) {
      draft.initialise(newQuestionState(''));
      return;
    }
    draft.initialise(questionStateFromRecord(record.question, record.conceptSet));
  }, [data, draft, editing, record]);

  const save = async () => {
    if (!courseId || !targetConceptId || !name.trim()) {
      notify('Add a name and choose the primary skill practised.', 'negative');
      return;
    }
    setSaving(true);
    try {
      const shared = {
        name,
        primaryLessonId: lessonId || null,
        tags,
        suspended,
        targetConceptId,
        prerequisiteConceptIds,
      };
      if (kind === 'fixed') {
        const payload = fixedPayload(
          answerKind,
          numericAnswer,
          workingCompilation,
          workingFixtures,
        );
        if (!prompt.trim() || !explanation.trim() || !payload) {
          notify(
            'A fixed Question needs a prompt, valid answer and worked explanation.',
            'negative',
          );
          return;
        }
        if (questionId) {
          await updateFixedQuestion(questionId, { ...shared, prompt, payload, explanation });
        } else {
          await createFixedQuestion({ courseId, ...shared, prompt, payload, explanation });
        }
      } else {
        if (!generator) throw new Error('No built-in Question generator is available.');
        if (questionId) {
          await updateGeneratedQuestion(questionId, {
            ...shared,
            generatorKey: generator.key,
            generatorVersion: generator.version,
            generatorConfig,
          });
        } else {
          await createGeneratedQuestion({
            courseId,
            ...shared,
            generatorKey: generator.key,
            generatorVersion: generator.version,
            generatorConfig,
          });
        }
      }
      draft.finish();
      notify(questionId ? 'Question updated.' : 'Question created.', 'positive');
      void navigate(`/course/${courseId}/questions?view=individual`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save the Question.', 'negative');
    } finally {
      setSaving(false);
    }
  };

  const addConcept = async () => {
    if (!courseId || !newConceptName.trim()) return;
    try {
      const concept = await createConcept(courseId, newConceptName);
      draft.update({ targetConceptId: concept.id, newConceptName: '' });
      notify('Concept created.', 'positive');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not create the Concept.', 'negative');
    }
  };

  const remove = async () => {
    if (!questionId || !courseId) return;
    await deleteQuestion(questionId);
    draft.finish();
    notify('Question deleted.', 'positive');
    void navigate(`/course/${courseId}/questions?view=individual`);
  };

  if (
    course === undefined ||
    lessons === undefined ||
    data === undefined ||
    (editing && record === undefined) ||
    !draft.loaded
  ) {
    return (
      <DelayedFallback>
        <div className="mx-auto max-w-4xl px-6 py-10">
          <Skeleton className="h-12 w-72 rounded-xl bg-ink/10" />
        </div>
      </DelayedFallback>
    );
  }
  if (course === null || (editing && record === null)) {
    return <div className="p-10 text-ink-soft">This Question could not be found.</div>;
  }

  const tagSuggestions = [...new Set(data.questions.flatMap((question) => question.tags))].sort();
  const saveLabel = saving ? 'Saving…' : editing ? 'Save Question' : 'Create Question';

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 pb-32 md:px-10">
      <NavigationGuard
        active={draft.shouldBlock}
        onAttempt={draft.flushDraft}
        title="Leave this Question?"
        message="Your unsaved changes are kept as a draft and can be restored when you return."
      />
      <Link
        to={`/course/${courseId}/questions`}
        className="mb-7 inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition hover:text-ink"
      >
        <ChevronLeftIcon width={16} height={16} />
        Questions
      </Link>

      <header className="mb-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight md:text-[44px]">
          {editing ? 'Edit Question' : 'Create a Question'}
        </h1>
      </header>

      {draft.draftPrompt && (
        <section
          role="status"
          className="mb-8 flex flex-col gap-4 rounded-3xl bg-accent-soft p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-ink">A saved draft from a previous session was found.</p>
          <div className="flex gap-2">
            <Button type="button" variant="primary" onClick={draft.restoreDraft}>
              Restore draft
            </Button>
            <Button type="button" onClick={draft.discardDraft}>
              Discard draft
            </Button>
          </div>
        </section>
      )}

      <div className="space-y-8">
        {!editing && (
          <fieldset>
            <legend className={labelClass}>
              Question form
            </legend>
            <QuestionSegmented
              label="Question form"
              value={kind}
              onChange={(option) => draft.update({ kind: option })}
              options={[
                { value: 'fixed', label: 'Fixed problem' },
                { value: 'generated', label: 'Generated family' },
              ]}
            />
          </fieldset>
        )}

        <section className={`grid gap-5 p-6 md:grid-cols-2 md:p-7 ${cardClass}`}>
          <label className="block md:col-span-2">
            <span className={labelClass}>
              Name
            </span>
            <input
              value={name}
              onChange={(event) => draft.update({ name: event.target.value })}
              placeholder="Completing the square"
              className={inputClass}
              autoFocus
            />
          </label>
          <label className="block">
            <span className={labelClass}>
              Lesson
            </span>
            <select
              value={lessonId}
              onChange={(event) => draft.update({ lessonId: event.target.value })}
              className={inputClass}
            >
              <option value="">No primary Lesson</option>
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>
              Primary skill practised
            </span>
            <select
              value={targetConceptId}
              onChange={(event) => {
                const nextTarget = event.target.value;
                draft.update((current) => ({
                  targetConceptId: nextTarget,
                  prerequisiteConceptIds: current.prerequisiteConceptIds.filter(
                    (id) => id !== nextTarget,
                  ),
                }));
              }}
              className={inputClass}
            >
              <option value="">Choose a Concept</option>
              {data.concepts.map((concept) => (
                <option key={concept.id} value={concept.id}>
                  {concept.name}
                </option>
              ))}
            </select>
          </label>
          <div className="md:col-span-2">
            <span className={labelClass}>
              Add a Concept
            </span>
            <div className="flex gap-2">
              <input
                value={newConceptName}
                onChange={(event) => draft.update({ newConceptName: event.target.value })}
                placeholder="A single piece of knowledge"
                className={inputClass}
              />
              <Button
                type="button"
                onClick={() => void addConcept()}
                disabled={!newConceptName.trim()}
              >
                <PlusIcon width={16} height={16} />
                Add
              </Button>
            </div>
          </div>
          {data.concepts.filter((concept) => concept.id !== targetConceptId).length > 0 && (
            <fieldset className="md:col-span-2">
              <legend className={labelClass}>
                Prerequisite Concepts
              </legend>
              <div className="flex flex-wrap gap-2">
                {data.concepts
                  .filter((concept) => concept.id !== targetConceptId)
                  .map((concept) => {
                    const selected = prerequisiteConceptIds.includes(concept.id);
                    return (
                      <button
                        key={concept.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          draft.update((current) => ({
                            prerequisiteConceptIds: selected
                              ? current.prerequisiteConceptIds.filter((id) => id !== concept.id)
                              : [...current.prerequisiteConceptIds, concept.id],
                          }))
                        }
                        className={`min-h-11 rounded-full px-4 text-sm font-semibold transition ${
                          selected
                            ? 'bg-accent-soft text-accent-ink'
                            : 'bg-ink/[0.06] text-ink-soft hover:text-ink'
                        }`}
                      >
                        {concept.name}
                      </button>
                    );
                  })}
              </div>
            </fieldset>
          )}
        </section>

        <StepSwap stepKey={kind} direction={kind === 'generated' ? 1 : -1} className="space-y-8">
          {kind === 'fixed' ? (
            <>
              <MarkdownEditor
                label="Prompt"
                value={prompt}
                onChange={(value) => draft.update({ prompt: value })}
                minRows={7}
                placeholder="Apply the idea in a concrete problem."
                onError={(message) => notify(message, 'negative')}
              />
              <div>
                <div className={labelClass}>
                  Answer type
                </div>
                <QuestionSegmented
                  label="Answer type"
                  value={answerKind}
                  onChange={(option) => draft.update({ answerKind: option })}
                  options={[
                    { value: 'numeric', label: 'Numeric answer' },
                    { value: 'working', label: 'Show working' },
                  ]}
                />
              </div>
              <StepSwap stepKey={answerKind} direction={answerKind === 'working' ? 1 : -1}>
                {answerKind === 'numeric' ? (
                  <NumericAnswerEditor
                    value={numericAnswer}
                    onChange={(value) => draft.update({ numericAnswer: value })}
                  />
                ) : (
                  <MarkSchemeEditor
                    value={workingSource}
                    onChange={(value) => draft.update({ workingSource: value })}
                    fixtures={workingFixtures}
                    onFixturesChange={(value) => draft.update({ workingFixtures: value })}
                  />
                )}
              </StepSwap>
              <MarkdownEditor
                label="Worked explanation"
                value={explanation}
                onChange={(value) => draft.update({ explanation: value })}
                minRows={7}
                placeholder="Show why the answer follows, not merely what it is."
                onError={(message) => notify(message, 'negative')}
              />
            </>
          ) : generator ? (
            <GeneratedQuestionConfiguration
              generator={generator}
              configuration={generatorConfig}
              onChange={(value) => draft.update({ generatorConfig: value })}
            />
          ) : null}
        </StepSwap>

        <section>
          <div className={labelClass}>Tags</div>
          <TagInput
            tags={tags}
            onChange={(value) => draft.update({ tags: value })}
            suggestions={tagSuggestions}
            placeholder="Add tags…"
          />
        </section>
        {editing && (
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-ink-soft">
            <input
              type="checkbox"
              checked={suspended}
              onChange={(event) => draft.update({ suspended: event.target.checked })}
              className="accent-accent"
            />
            Suspend this Question
          </label>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 bg-paper/90 px-6 py-4 backdrop-blur-xl sm:bottom-0">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          {editing ? (
            <ConfirmInlineSwap
              active={confirmingDelete}
              message="Delete this Question definition? Its attempt evidence will be retained."
              confirmLabel="Delete"
              onConfirm={() => void remove()}
              onCancel={() => setConfirmingDelete(false)}
            >
              <Button type="button" variant="danger" onClick={() => setConfirmingDelete(true)}>
                <TrashIcon width={16} height={16} />
                Delete
              </Button>
            </ConfirmInlineSwap>
          ) : (
            <span />
          )}
          <Button
            type="button"
            variant="primary"
            onClick={() => void save()}
            disabled={saving}
            aria-label={saveLabel}
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={saveLabel}
                aria-hidden="true"
                initial={motionMultiplier > 0 ? { opacity: 0, y: 3 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={motionMultiplier > 0 ? { opacity: 0, y: -3 } : undefined}
                transition={motionTransition('feedback', motionMultiplier)}
              >
                {saveLabel}
              </motion.span>
            </AnimatePresence>
          </Button>
        </div>
      </div>
    </div>
  );
}

function fixedPayload(
  answerKind: QuestionAnswerKind,
  numericAnswer: NumericAnswerSpec,
  workingCompilation: ReturnType<typeof compileMarkScheme>,
  fixtures: ItemFixture[],
): QuestionPayload | null {
  if (answerKind === 'numeric') {
    if (!numericAnswerSpecIsValid(numericAnswer)) return null;
    return { v: 1, kind: 'numeric', answer: numericAnswer };
  }
  if (
    workingCompilation.lines.length === 0 ||
    workingCompilation.lines.some((line) => line.kind === 'error')
  )
    return null;
  return {
    v: 1,
    kind: 'working',
    scheme: workingCompilation.lines.map((line) => {
      if (line.kind === 'error') throw new Error('Invalid mark scheme.');
      return line.value;
    }),
    fixtures,
  };
}
