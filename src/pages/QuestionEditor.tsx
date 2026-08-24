import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MarkSchemeEditor } from '../components/items/MarkSchemeEditor';
import {
  NumericAnswerEditor,
  numericAnswerSpecIsValid,
} from '../components/items/NumericAnswerEditor';
import { MarkdownEditor } from '../components/markdown/MarkdownEditor';
import { useCourseQuestionData, useQuestionRecord } from '../components/questions/useQuestionData';
import { Button } from '../components/ui/Button';
import { DelayedFallback } from '../components/ui/DelayedFallback';
import { TagInput } from '../components/ui/TagInput';
import { useToast } from '../components/ui/Toast';
import { ChevronLeftIcon, PlusIcon, TrashIcon } from '../components/ui/icons';
import type { ItemFixture, NumericAnswerSpec } from '../db/types';
import { compileMarkScheme, serialiseMarkScheme } from '../items/markSchemeCompiler';
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

type EditorKind = 'fixed' | 'generated';
type AnswerKind = 'numeric' | 'working';

const EMPTY_NUMERIC_ANSWER: NumericAnswerSpec = { kind: 'exact', value: '' };
const DEFAULT_GENERATOR_CONFIG: Record<string, string | number | boolean> = {
  minimumRootMagnitude: 1,
  maximumRootMagnitude: 5,
  maximumLeadingCoefficient: 2,
  allowRepeatedRoots: false,
};

const inputClass =
  'min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';

export function QuestionEditor() {
  const { courseId, questionId } = useParams<{ courseId: string; questionId?: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();
  const course = useCourse(courseId);
  const lessons = useLessons(courseId);
  const data = useCourseQuestionData(courseId);
  const record = useQuestionRecord(questionId);
  const editing = Boolean(questionId);

  const [loaded, setLoaded] = useState(false);
  const [kind, setKind] = useState<EditorKind>('fixed');
  const [name, setName] = useState('');
  const [lessonId, setLessonId] = useState<string>('');
  const [targetConceptId, setTargetConceptId] = useState('');
  const [prerequisiteConceptIds, setPrerequisiteConceptIds] = useState<string[]>([]);
  const [newConceptName, setNewConceptName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [suspended, setSuspended] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [explanation, setExplanation] = useState('');
  const [answerKind, setAnswerKind] = useState<AnswerKind>('numeric');
  const [numericAnswer, setNumericAnswer] = useState<NumericAnswerSpec>(EMPTY_NUMERIC_ANSWER);
  const [workingSource, setWorkingSource] = useState('');
  const [workingFixtures, setWorkingFixtures] = useState<ItemFixture[]>([]);
  const [generatorConfig, setGeneratorConfig] = useState(DEFAULT_GENERATOR_CONFIG);
  const [saving, setSaving] = useState(false);
  const workingCompilation = useMemo(() => compileMarkScheme(workingSource), [workingSource]);
  const generator = questionGeneratorRegistry.list()[0];

  useEffect(() => {
    if (loaded || data === undefined || (editing && record === undefined)) return;
    if (!editing) {
      setTargetConceptId(data.concepts[0]?.id ?? '');
      setLoaded(true);
      return;
    }
    if (!record) {
      setLoaded(true);
      return;
    }
    const { question, conceptSet } = record;
    setKind(question.kind);
    setName(question.name);
    setLessonId(question.primaryLessonId ?? '');
    setTargetConceptId(conceptSet.targetConceptIds[0] ?? '');
    setPrerequisiteConceptIds(conceptSet.prerequisiteConceptIds);
    setTags(question.tags);
    setSuspended(question.suspended);
    if (question.kind === 'fixed') {
      setPrompt(question.prompt);
      setExplanation(question.explanation);
      setAnswerKind(question.payload.kind);
      if (question.payload.kind === 'numeric') {
        setNumericAnswer(question.payload.answer);
      } else {
        setWorkingSource(serialiseMarkScheme(question.payload.scheme));
        setWorkingFixtures(question.payload.fixtures ?? []);
      }
    } else {
      setGeneratorConfig(question.generatorConfig as Record<string, string | number | boolean>);
    }
    setLoaded(true);
  }, [data, editing, loaded, record]);

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
      notify(questionId ? 'Question updated.' : 'Question created.', 'positive');
      navigate(`/course/${courseId}/questions`);
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
      setTargetConceptId(concept.id);
      setNewConceptName('');
      notify('Concept created.', 'positive');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not create the Concept.', 'negative');
    }
  };

  const remove = async () => {
    if (
      !questionId ||
      !courseId ||
      !window.confirm('Delete this Question definition? Its attempt evidence will be retained.')
    )
      return;
    await deleteQuestion(questionId);
    notify('Question deleted.', 'positive');
    navigate(`/course/${courseId}/questions`);
  };

  if (
    course === undefined ||
    lessons === undefined ||
    data === undefined ||
    (editing && record === undefined) ||
    !loaded
  ) {
    return (
      <DelayedFallback>
        <div className="mx-auto max-w-4xl px-6 py-10">
          <div className="h-12 w-72 animate-pulse rounded-xl bg-ink/10" />
        </div>
      </DelayedFallback>
    );
  }
  if (course === null || (editing && record === null)) {
    return <div className="p-10 text-ink-soft">This Question could not be found.</div>;
  }

  const tagSuggestions = [...new Set(data.questions.flatMap((question) => question.tags))].sort();

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 pb-28 md:px-10">
      <Link
        to={`/course/${courseId}/questions`}
        className="mb-7 inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition hover:text-ink"
      >
        <ChevronLeftIcon width={16} height={16} />
        Questions
      </Link>

      <header className="mb-8">
        <p className="mb-2 text-xs uppercase tracking-[0.18em] text-ink-faint">
          {editing ? 'Edit definition' : 'New definition'}
        </p>
        <h1 className="font-display text-4xl tracking-tight md:text-5xl">
          {editing ? 'Edit Question' : 'Create a Question'}
        </h1>
      </header>

      <div className="space-y-8">
        {!editing && (
          <fieldset>
            <legend className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-faint">
              Question form
            </legend>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-ink/5 p-1">
              {(['fixed', 'generated'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={kind === option}
                  onClick={() => setKind(option)}
                  className={`min-h-11 rounded-lg px-4 text-sm transition ${
                    kind === option
                      ? 'bg-surface text-ink shadow-sm'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {option === 'fixed' ? 'Fixed problem' : 'Generated family'}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <section className="grid gap-5 rounded-2xl border border-line bg-surface p-5 md:grid-cols-2 md:p-6">
          <label className="block md:col-span-2">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-ink-faint">
              Name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Completing the square"
              className={inputClass}
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-ink-faint">
              Lesson
            </span>
            <select
              value={lessonId}
              onChange={(event) => setLessonId(event.target.value)}
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
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-ink-faint">
              Primary skill practised
            </span>
            <select
              value={targetConceptId}
              onChange={(event) => {
                const nextTarget = event.target.value;
                setTargetConceptId(nextTarget);
                setPrerequisiteConceptIds((current) => current.filter((id) => id !== nextTarget));
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
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-ink-faint">
              Add a Concept
            </span>
            <div className="flex gap-2">
              <input
                value={newConceptName}
                onChange={(event) => setNewConceptName(event.target.value)}
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
              <legend className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-faint">
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
                          setPrerequisiteConceptIds((current) =>
                            selected
                              ? current.filter((id) => id !== concept.id)
                              : [...current, concept.id],
                          )
                        }
                        className={`min-h-11 rounded-full border px-4 text-sm transition ${
                          selected
                            ? 'border-accent bg-accent-soft text-accent'
                            : 'border-line-strong text-ink-soft hover:text-ink'
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

        {kind === 'fixed' ? (
          <>
            <MarkdownEditor
              label="Prompt"
              value={prompt}
              onChange={setPrompt}
              minRows={7}
              placeholder="Apply the idea in a concrete problem."
              onError={(message) => notify(message, 'negative')}
            />
            <div>
              <div className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-faint">
                Answer type
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['numeric', 'working'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={answerKind === option}
                    onClick={() => setAnswerKind(option)}
                    className={`min-h-11 rounded-lg border px-4 text-sm transition ${
                      answerKind === option
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-line-strong text-ink-soft'
                    }`}
                  >
                    {option === 'numeric' ? 'Numeric answer' : 'Show working'}
                  </button>
                ))}
              </div>
            </div>
            {answerKind === 'numeric' ? (
              <NumericAnswerEditor value={numericAnswer} onChange={setNumericAnswer} />
            ) : (
              <MarkSchemeEditor
                value={workingSource}
                onChange={setWorkingSource}
                fixtures={workingFixtures}
                onFixturesChange={setWorkingFixtures}
              />
            )}
            <MarkdownEditor
              label="Worked explanation"
              value={explanation}
              onChange={setExplanation}
              minRows={7}
              placeholder="Show why the answer follows, not merely what it is."
              onError={(message) => notify(message, 'negative')}
            />
          </>
        ) : generator ? (
          <section className="rounded-2xl border border-line bg-surface p-5 md:p-6">
            <p className="text-xs uppercase tracking-[0.14em] text-ink-faint">Built-in family</p>
            <h2 className="mt-2 font-display text-2xl text-ink">{generator.name}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{generator.summary}</p>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {generator.configurationFields.map((field) =>
                field.kind === 'boolean' ? (
                  <label
                    key={field.key}
                    className="flex min-h-11 items-center gap-3 rounded-xl border border-line-strong px-4"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(generatorConfig[field.key])}
                      onChange={(event) =>
                        setGeneratorConfig((current) => ({
                          ...current,
                          [field.key]: event.target.checked,
                        }))
                      }
                      className="accent-accent"
                    />
                    <span className="text-sm text-ink">{field.label}</span>
                  </label>
                ) : (
                  <label key={field.key} className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-ink-faint">
                      {field.label}
                    </span>
                    <input
                      type="number"
                      min={field.minimum}
                      max={field.maximum}
                      step="1"
                      value={Number(generatorConfig[field.key])}
                      onChange={(event) =>
                        setGeneratorConfig((current) => ({
                          ...current,
                          [field.key]: Number(event.target.value),
                        }))
                      }
                      className={inputClass}
                    />
                  </label>
                ),
              )}
            </div>
          </section>
        ) : null}

        <section>
          <div className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-faint">Tags</div>
          <TagInput
            tags={tags}
            onChange={setTags}
            suggestions={tagSuggestions}
            placeholder="Add tags…"
          />
        </section>
        {editing && (
          <label className="flex min-h-11 items-center gap-3 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={suspended}
              onChange={(event) => setSuspended(event.target.checked)}
              className="accent-accent"
            />
            Suspend this Question
          </label>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/90 px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          {editing ? (
            <Button type="button" variant="danger" onClick={() => void remove()}>
              <TrashIcon width={16} height={16} />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" variant="primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save Question' : 'Create Question'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function fixedPayload(
  answerKind: AnswerKind,
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
