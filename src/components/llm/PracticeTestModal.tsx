import { useMemo, useState } from 'react';
import type { CardWithStateRow } from '../../store/cards';
import type { Note } from '../../db/repositories/notes';
import {
  generatePracticeTest,
  LlmNotConfiguredError,
  type PracticeTest,
} from '../../lib/llm/service';
import { tiptapToPlainText } from '../../lib/tiptapUtils';
import { UI } from '../../ui-strings';
import styles from './PracticeTestModal.module.css';

type TestFormat = 'multiple_choice' | 'short_answer';

interface PracticeTestModalProps {
  subject: string;
  cards: CardWithStateRow[];
  notes: Note[];
  onClose: () => void;
}

export function PracticeTestModal({
  subject,
  cards,
  notes,
  onClose,
}: PracticeTestModalProps) {
  const [format, setFormat] = useState<TestFormat>('multiple_choice');
  const [questionCount, setQuestionCount] = useState(5);
  const [useCards, setUseCards] = useState(true);
  const [useNotes, setUseNotes] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<PracticeTest | null>(null);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [notConfigured, setNotConfigured] = useState(false);

  const sourceText = useMemo(() => {
    const chunks: string[] = [];

    if (useCards) {
      for (const item of cards) {
        if (item.card.card_type === 'cloze' && item.card.cloze_text) {
          chunks.push(item.card.cloze_text);
        } else {
          const front = item.card.front.trim();
          const back = item.card.back.trim();
          if (front || back) {
            chunks.push(`${front}\n${back}`.trim());
          }
        }
      }
    }

    if (useNotes) {
      for (const note of notes) {
        const text = tiptapToPlainText(note.content);
        if (text) {
          chunks.push(text);
        }
      }
    }

    return chunks.join('\n\n');
  }, [cards, notes, useCards, useNotes]);

  const handleGenerate = async () => {
    if (!sourceText.trim()) {
      setError(UI.common.noResults);
      return;
    }

    setLoading(true);
    setError(null);
    setNotConfigured(false);
    setTest(null);

    try {
      const generated = await generatePracticeTest({
        text: sourceText,
        subject,
        questionCount,
        format,
      });
      setTest(generated);
      setRevealed({});
    } catch (err) {
      if (err instanceof LlmNotConfiguredError) {
        setNotConfigured(true);
        return;
      }

      setError(err instanceof Error ? err.message : UI.common.error);
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className={styles.wrapper}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.backdrop} />
      <section className={styles.modal}>
        <header className={styles.header}>
          <h2 className={styles.title}>{UI.llm.practiceTest}</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
          >
            {UI.common.close}
          </button>
        </header>

        <div className={styles.formRow}>
          <label className={styles.label}>{UI.llm.practiceTestFormat}</label>
          <div className={styles.segmented}>
            <button
              type="button"
              className={
                format === 'multiple_choice'
                  ? styles.segmentActive
                  : styles.segment
              }
              onClick={() => setFormat('multiple_choice')}
            >
              {UI.llm.multipleChoice}
            </button>
            <button
              type="button"
              className={
                format === 'short_answer'
                  ? styles.segmentActive
                  : styles.segment
              }
              onClick={() => setFormat('short_answer')}
            >
              {UI.llm.shortAnswer}
            </button>
          </div>
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="question-count">
            {UI.llm.questionCount}
          </label>
          <input
            id="question-count"
            className={styles.input}
            type="number"
            min={1}
            max={20}
            value={questionCount}
            onChange={(event) =>
              setQuestionCount(
                Math.max(1, Math.min(20, Number(event.target.value) || 1)),
              )
            }
          />
        </div>

        <fieldset className={styles.sourceBox}>
          <legend className={styles.label}>{UI.notes.linkedNotes}</legend>
          <label className={styles.sourceOption}>
            <input
              type="checkbox"
              checked={useCards}
              onChange={(e) => setUseCards(e.target.checked)}
            />
            {UI.cards.cardCount(cards.length)}
          </label>
          <label className={styles.sourceOption}>
            <input
              type="checkbox"
              checked={useNotes}
              onChange={(e) => setUseNotes(e.target.checked)}
            />
            {UI.notes.linkedNotes}
          </label>
        </fieldset>

        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => void handleGenerate()}
          disabled={loading || (!useCards && !useNotes)}
        >
          {loading ? UI.llm.generating : UI.llm.generateTest}
        </button>

        {notConfigured && (
          <p className={styles.error}>{UI.settings.llmNotConfiguredHint}</p>
        )}
        {error && <p className={styles.error}>{error}</p>}

        {test && (
          <div className={styles.results}>
            {test.questions.map((question, index) => (
              <article key={index} className={styles.questionCard}>
                <h3 className={styles.questionTitle}>{question.question}</h3>

                {format === 'multiple_choice' && question.options && (
                  <ol className={styles.optionsList}>
                    {question.options.map((option, optionIndex) => (
                      <li key={optionIndex}>{option}</li>
                    ))}
                  </ol>
                )}

                {format === 'short_answer' && (
                  <textarea className={styles.answerInput} rows={3} />
                )}

                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() =>
                    setRevealed((prev) => ({
                      ...prev,
                      [index]: !prev[index],
                    }))
                  }
                >
                  {UI.llm.revealAnswer}
                </button>

                {revealed[index] && (
                  <p className={styles.answer}>{question.answer}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
