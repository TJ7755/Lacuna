import { Skeleton } from '../components/ui/Skeleton';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLink as Link } from '../components/ui/AppLink';
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
import { Toggle } from '../components/ui/Toggle';
import { StepSwap } from '../components/ui/StepSwap';
import { useToast } from '../components/ui/Toast';
import { motionTransition } from '../components/ui/motion';
import { ChevronLeftIcon, TrashIcon } from '../components/ui/icons';
import {
  FieldError,
  QuestionMetadataFields,
  questionLabelClass as labelClass,
} from '../components/questions/QuestionMetadataFields';
import { useEditorKeys } from '../hooks/dialogKeys';
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
import { canEditLessons } from '../course/lessonViewMode';
import { speedMultiplier, useMotionSpeed } from '../state/motionSpeed';
import {
  newQuestionState,
  questionDraftKey,
  questionStateFromRecord,
  type QuestionAnswerKind,
  useQuestionDraft,
} from './questionDraft';

export function QuestionEditor() {
  const { courseId, questionId } = useParams<{ courseId: string; questionId?: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();
  const course = useCourse(courseId);
  const editable = Boolean(course && canEditLessons(course));
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

  // Field messages appear once a save has been attempted, and update as the fields change.
  const [attempted, setAttempted] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const explanationRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const conceptRef = useRef<HTMLSelectElement>(null);
  const payload =
    kind === 'fixed'
      ? fixedPayload(answerKind, numericAnswer, workingCompilation, workingFixtures)
      : undefined;
  const allErrors = {
    prompt: kind === 'fixed' && !prompt.trim() ? 'Add a prompt.' : undefined,
    answer: kind === 'fixed' && !payload ? 'Add a valid answer.' : undefined,
    explanation: kind === 'fixed' && !explanation.trim() ? 'Add a worked explanation.' : undefined,
    name: !name.trim() ? 'Add a name.' : undefined,
    concept: !targetConceptId ? 'Choose the primary skill practised.' : undefined,
  };
  const errors: Partial<typeof allErrors> = attempted ? allErrors : {};

  /** Where a new Question's entry starts: its prompt, or its name for a generated family. */
  const focusEntry = () =>
    (kind === 'fixed' ? promptRef.current : nameRef.current)?.focus({ preventScroll: true });
  const entryFocused = useRef(false);
  useEffect(() => {
    if (!draft.loaded || entryFocused.current) return;
    entryFocused.current = true;
    focusEntry();
    // Only on first load; later changes of form keep the user's focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.loaded]);

  /** `another` starts a fresh Question in the same lesson, Concept and form. */
  const save = async (another = false) => {
    if (!editable || saving || !courseId) return;
    setAttempted(true);
    const first = (
      [
        ['prompt', promptRef.current],
        [
          'answer',
          answerRef.current?.querySelector<HTMLElement>('input, textarea, select, button'),
        ],
        ['explanation', explanationRef.current],
        ['name', nameRef.current],
        ['concept', conceptRef.current],
      ] as const
    ).find(([key]) => allErrors[key]);
    if (first) {
      first[1]?.focus();
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
      if (kind === 'fixed' && payload) {
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
      notify(questionId ? 'Question updated.' : 'Question created.', 'positive');
      if (another && !questionId) {
        setAttempted(false);
        draft.startAnother({
          ...newQuestionState(targetConceptId),
          kind,
          lessonId,
          answerKind,
          tags,
        });
        requestAnimationFrame(focusEntry);
        return;
      }
      draft.finish();
      void navigate(`/course/${courseId}/questions?view=individual`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save the Question.', 'negative');
    } finally {
      setSaving(false);
    }
  };
  const editorKeys = useEditorKeys({
    onCancel: () => void navigate(`/course/${courseId}/questions?view=individual`),
    onSubmit: () => void save(!editing),
  });

  const addConcept = async () => {
    if (!editable || !courseId || !newConceptName.trim()) return;
    try {
      const concept = await createConcept(courseId, newConceptName);
      draft.update({ targetConceptId: concept.id, newConceptName: '' });
      notify('Concept created.', 'positive');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not create the Concept.', 'negative');
    }
  };

  const remove = async () => {
    if (!editable || !questionId || !courseId) return;
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
    <div className="mx-auto max-w-4xl px-6 py-8 pb-32 md:px-10" {...editorKeys}>
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
            <legend className="mb-2 font-display text-base text-ink">Question form</legend>
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

        <StepSwap stepKey={kind} direction={kind === 'generated' ? 1 : -1} className="space-y-8">
          {kind === 'fixed' ? (
            <>
              <div>
                <MarkdownEditor
                  label="Prompt"
                  value={prompt}
                  onChange={(value) => draft.update({ prompt: value })}
                  minRows={7}
                  placeholder="Apply the idea in a concrete problem."
                  onError={(message) => notify(message, 'negative')}
                  inputRef={promptRef}
                  ariaInvalid={errors.prompt ? true : undefined}
                  ariaDescribedBy={errors.prompt ? 'question-prompt-error' : undefined}
                />
                <FieldError id="question-prompt-error" message={errors.prompt} />
              </div>
              <div>
                <div className={labelClass}>Answer type</div>
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
              <div ref={answerRef}>
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
                <FieldError id="question-answer-error" message={errors.answer} />
              </div>
              <div>
                <MarkdownEditor
                  label="Worked explanation"
                  value={explanation}
                  onChange={(value) => draft.update({ explanation: value })}
                  minRows={7}
                  placeholder="Show why the answer follows, not merely what it is."
                  onError={(message) => notify(message, 'negative')}
                  inputRef={explanationRef}
                  ariaInvalid={errors.explanation ? true : undefined}
                  ariaDescribedBy={errors.explanation ? 'question-explanation-error' : undefined}
                />
                <FieldError id="question-explanation-error" message={errors.explanation} />
              </div>
            </>
          ) : generator ? (
            <GeneratedQuestionConfiguration
              generator={generator}
              configuration={generatorConfig}
              onChange={(value) => draft.update({ generatorConfig: value })}
            />
          ) : null}
        </StepSwap>

        <QuestionMetadataFields
          state={draft.state}
          update={draft.update}
          lessons={lessons}
          concepts={data.concepts}
          onAddConcept={() => void addConcept()}
          editable={editable}
          errors={errors}
          nameRef={nameRef}
          conceptRef={conceptRef}
        />

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
          <Toggle
            checked={suspended}
            onChange={(suspended) => draft.update({ suspended })}
            label="Suspend this Question"
          />
        )}
      </div>

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 bg-paper/90 px-6 py-4 backdrop-blur-xl sm:bottom-0">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          {editable && editing ? (
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
          <div className="flex flex-wrap justify-end gap-2">
            {!editing && (
              <Button
                type="button"
                onClick={() => void save(true)}
                disabled={!editable || saving}
                title="Save and add another (Ctrl/Cmd+Enter)"
              >
                Save &amp; add another
              </Button>
            )}
            <Button
              type="button"
              variant="primary"
              onClick={() => void save()}
              disabled={!editable || saving}
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
