/**
 * CardEditor — modal for creating and editing basic, cloze, and image occlusion cards.
 *
 * Creates a new card when `card` is omitted; edits an existing card when
 * `card` is provided. The card type selector is disabled in edit mode.
 */

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Card } from '../../db/repositories/cards';
import type { Note } from '../../db/repositories/notes';
import type { Tag } from '../../db/repositories/tags';
import { addTagToCard } from '../../db/repositories/tags';
import {
  getLinkedNotes,
  linkCardToNote,
  unlinkCardFromNote,
} from '../../db/repositories/cardNoteLinks';
import { useCardStore } from '../../store/cards';
import { useNoteStore } from '../../store/notes';
import { validateCloze, renderCloze } from '../../lib/cloze';
import {
  suggestAlternativePhrasings,
  LlmNotConfiguredError,
} from '../../lib/llm/service';
import type { OcclusionData } from '../../types';
import { UI } from '../../ui-strings';
import { MarkdownPreview } from './MarkdownPreview';
import { ClozeHighlighter } from './ClozeHighlighter';
import { ImageOcclusionForm } from './ImageOcclusionForm';
import { TagInput } from '../tags/TagInput';
import styles from './CardEditor.module.css';

type CardType = 'basic' | 'cloze' | 'image_occlusion';

interface CardEditorProps {
  deckId: string;
  card?: Card;
  onClose: () => void;
}

function getInitialType(card: Card | undefined): CardType {
  if (card?.card_type === 'cloze') return 'cloze';
  if (card?.card_type === 'image_occlusion') return 'image_occlusion';
  return 'basic';
}

export function CardEditor({ deckId, card, onClose }: CardEditorProps) {
  const isEdit = !!card;
  const [cardType, setCardType] = useState<CardType>(getInitialType(card));
  const [front, setFront] = useState(card?.front ?? '');
  const [back, setBack] = useState(card?.back ?? '');
  const [clozeText, setClozeText] = useState(card?.cloze_text ?? '');
  const [imageUrl, setImageUrl] = useState<string>(
    card?.card_type === 'image_occlusion' ? (card.image_url ?? '') : '',
  );
  const [occlusionData, setOcclusionData] = useState<OcclusionData>(
    card?.card_type === 'image_occlusion'
      ? Array.isArray(card.occlusion_data)
        ? (card.occlusion_data as OcclusionData)
        : []
      : [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingTags, setPendingTags] = useState<Tag[]>([]);
  const [loadingAlternatives, setLoadingAlternatives] = useState(false);
  const [alternativeError, setAlternativeError] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<
    Array<{ front: string; back: string }>
  >([]);
  const [linkedNotes, setLinkedNotes] = useState<Note[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linksError, setLinksError] = useState<string | null>(null);
  const [selectedLinkNoteId, setSelectedLinkNoteId] = useState('');

  const {
    createCard,
    updateCard,
    createImageOcclusionCard,
    updateImageOcclusionCard,
  } = useCardStore();
  const { notes: availableNotes } = useNoteStore();
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timeout = setTimeout(() => firstFieldRef.current?.focus(), 50);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!card) {
      setLinkedNotes([]);
      return;
    }

    let cancelled = false;
    setLinksLoading(true);
    setLinksError(null);

    void getLinkedNotes(card.id)
      .then((notes) => {
        if (!cancelled) {
          setLinkedNotes(notes);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLinksError(err instanceof Error ? err.message : UI.common.error);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLinksLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [card]);

  const clozeValidationError = clozeText.trim()
    ? validateCloze(clozeText)
    : null;

  const validate = (): string | null => {
    if (cardType === 'basic') {
      if (!front.trim()) return UI.cards.frontRequired;
      if (!back.trim()) return UI.cards.backRequired;
    } else if (cardType === 'cloze') {
      if (!clozeText.trim()) return UI.cards.clozeRequired;
      if (clozeValidationError)
        return UI.cards.clozeInvalid(clozeValidationError);
    } else {
      if (!imageUrl) return UI.cards.occlusionNoRegions;
      if (occlusionData.length === 0) return UI.cards.occlusionNoRegions;
    }
    return null;
  };

  const handleOcclusionChange = (url: string, data: OcclusionData) => {
    setImageUrl(url);
    setOcclusionData(data);
  };

  const handleSuggestAlternatives = async () => {
    setLoadingAlternatives(true);
    setAlternativeError(null);
    setAlternatives([]);

    try {
      const results = await suggestAlternativePhrasings({
        front,
        back,
      });
      setAlternatives(results);
    } catch (err) {
      if (err instanceof LlmNotConfiguredError) {
        setAlternativeError(UI.settings.llmNotConfiguredHint);
      } else {
        setAlternativeError(
          err instanceof Error ? err.message : UI.common.error,
        );
      }
    } finally {
      setLoadingAlternatives(false);
    }
  };

  const handleLinkNote = async (noteId: string) => {
    if (!card || !noteId) {
      return;
    }

    setLinksError(null);
    setSelectedLinkNoteId('');

    try {
      await linkCardToNote(card.id, noteId);
      const refreshed = await getLinkedNotes(card.id);
      setLinkedNotes(refreshed);
    } catch (err) {
      setLinksError(err instanceof Error ? err.message : UI.common.error);
    }
  };

  const handleUnlinkNote = async (noteId: string) => {
    if (!card) {
      return;
    }

    setLinksError(null);

    try {
      await unlinkCardFromNote(card.id, noteId);
      const refreshed = await getLinkedNotes(card.id);
      setLinkedNotes(refreshed);
    } catch (err) {
      setLinksError(err instanceof Error ? err.message : UI.common.error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      if (cardType === 'image_occlusion') {
        if (isEdit) {
          await updateImageOcclusionCard(card.id, {
            imageUrl,
            occlusionData,
          });
        } else {
          const newCard = await createImageOcclusionCard({
            deckId,
            imageUrl,
            occlusionData,
          });
          for (const tag of pendingTags) {
            await addTagToCard(newCard.id, tag.name);
          }
        }
      } else if (isEdit) {
        await updateCard(card.id, {
          front: cardType === 'basic' ? front.trim() : '',
          back: cardType === 'basic' ? back.trim() : '',
          clozeText: cardType === 'cloze' ? clozeText.trim() : undefined,
        });
      } else {
        const newCard = await createCard({
          deckId,
          cardType,
          front: cardType === 'basic' ? front.trim() : '',
          back: cardType === 'basic' ? back.trim() : '',
          clozeText: cardType === 'cloze' ? clozeText.trim() : undefined,
        });
        for (const tag of pendingTags) {
          await addTagToCard(newCard.id, tag.name);
        }
      }
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : UI.common.error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const title = isEdit ? UI.cards.editCard : UI.cards.addCard;

  const isSubmitDisabled =
    submitting ||
    (cardType === 'cloze' &&
      !!clozeValidationError &&
      clozeText.trim() !== '') ||
    (cardType === 'image_occlusion' &&
      (!imageUrl || occlusionData.length === 0));
  const linkedNoteIds = new Set(linkedNotes.map((note) => note.id));
  const availableLinkNotes = availableNotes.filter(
    (note) => !linkedNoteIds.has(note.id),
  );

  return (
    <AnimatePresence>
      <>
        <motion.div
          className={styles.backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={handleBackdropClick}
          aria-hidden="true"
        />
        <div
          className={styles.wrapper}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={handleBackdropClick}
        >
          <motion.div
            className={`${styles.modal} ${cardType === 'image_occlusion' ? styles.modalWide : ''}`}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <div className={styles.header}>
              <h2 className={styles.title}>{title}</h2>
              <button
                className={styles.closeButton}
                type="button"
                onClick={onClose}
                aria-label={UI.common.close}
              >
                x
              </button>
            </div>

            <form className={styles.body} onSubmit={handleSubmit}>
              {/* Type selector */}
              <div className={styles.field}>
                <label className={styles.label} htmlFor="card-type">
                  {UI.cards.typeSelectorLabel}
                </label>
                <div className={styles.typeSelector}>
                  <button
                    type="button"
                    className={`${styles.typeButton} ${cardType === 'basic' ? styles.typeActive : ''}`}
                    onClick={() => setCardType('basic')}
                    disabled={isEdit}
                  >
                    {UI.cards.typeBasic}
                  </button>
                  <button
                    type="button"
                    className={`${styles.typeButton} ${cardType === 'cloze' ? styles.typeActive : ''}`}
                    onClick={() => setCardType('cloze')}
                    disabled={isEdit}
                  >
                    {UI.cards.typeCloze}
                  </button>
                  <button
                    type="button"
                    className={`${styles.typeButton} ${cardType === 'image_occlusion' ? styles.typeActive : ''}`}
                    onClick={() => setCardType('image_occlusion')}
                    disabled={isEdit}
                  >
                    {UI.cards.typeImageOcclusion}
                  </button>
                </div>
              </div>

              {cardType === 'basic' && (
                <>
                  {/* Front */}
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="card-front">
                      {UI.cards.frontLabel}
                    </label>
                    <textarea
                      id="card-front"
                      ref={firstFieldRef}
                      className={styles.textarea}
                      value={front}
                      onChange={(e) => setFront(e.target.value)}
                      rows={3}
                      spellCheck
                    />
                    {front.trim() && (
                      <div className={styles.previewBlock}>
                        <span className={styles.previewLabel}>
                          {UI.cards.previewLabel}
                        </span>
                        <MarkdownPreview
                          content={front}
                          className={styles.previewContent}
                        />
                      </div>
                    )}
                  </div>

                  {/* Back */}
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="card-back">
                      {UI.cards.backLabel}
                    </label>
                    <textarea
                      id="card-back"
                      className={styles.textarea}
                      value={back}
                      onChange={(e) => setBack(e.target.value)}
                      rows={3}
                      spellCheck
                    />
                    {back.trim() && (
                      <div className={styles.previewBlock}>
                        <span className={styles.previewLabel}>
                          {UI.cards.previewLabel}
                        </span>
                        <MarkdownPreview
                          content={back}
                          className={styles.previewContent}
                        />
                      </div>
                    )}
                  </div>

                  {isEdit && (
                    <div className={styles.alternativesSection}>
                      <button
                        type="button"
                        className={styles.alternativesButton}
                        onClick={() => void handleSuggestAlternatives()}
                        disabled={
                          loadingAlternatives || !front.trim() || !back.trim()
                        }
                      >
                        {UI.llm.suggestAlternatives}
                      </button>

                      {loadingAlternatives && (
                        <p className={styles.hint}>{UI.llm.generating}</p>
                      )}

                      {alternativeError && (
                        <p className={styles.fieldError}>{alternativeError}</p>
                      )}

                      {alternatives.length > 0 && (
                        <div className={styles.alternativesList}>
                          <p className={styles.previewLabel}>
                            {UI.llm.alternatives}
                          </p>
                          {alternatives.map((item, index) => (
                            <div key={index} className={styles.alternativeItem}>
                              <div className={styles.alternativeText}>
                                <p>{item.front}</p>
                                <p>{item.back}</p>
                              </div>
                              <button
                                type="button"
                                className={styles.applyAlternativeButton}
                                onClick={() => {
                                  setFront(item.front);
                                  setBack(item.back);
                                }}
                              >
                                {UI.llm.applyAlternative}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {cardType === 'cloze' && (
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="card-cloze">
                    {UI.cards.clozeLabel}
                  </label>
                  <textarea
                    id="card-cloze"
                    ref={firstFieldRef}
                    className={styles.textarea}
                    value={clozeText}
                    onChange={(e) => setClozeText(e.target.value)}
                    rows={4}
                    spellCheck
                    aria-describedby="cloze-hint"
                  />
                  <p id="cloze-hint" className={styles.hint}>
                    {UI.cards.clozeHint}
                  </p>

                  {clozeText.trim() && (
                    <div className={styles.previewBlock}>
                      <span className={styles.previewLabel}>
                        {UI.cards.previewLabel}
                      </span>
                      <div className={styles.clozeHighlight}>
                        <ClozeHighlighter text={clozeText} />
                      </div>
                      {!clozeValidationError && (
                        <p className={styles.clozeRendered}>
                          {renderCloze(clozeText, 1)}
                        </p>
                      )}
                    </div>
                  )}

                  {clozeValidationError && (
                    <p className={styles.fieldError}>
                      {UI.cards.clozeInvalid(clozeValidationError)}
                    </p>
                  )}
                </div>
              )}

              {cardType === 'image_occlusion' && (
                <ImageOcclusionForm
                  imageUrl={imageUrl}
                  occlusionData={occlusionData}
                  onChange={handleOcclusionChange}
                  validationError={
                    formError && cardType === 'image_occlusion'
                      ? formError
                      : null
                  }
                />
              )}

              {cardType !== 'image_occlusion' && formError && (
                <p className={styles.error}>{formError}</p>
              )}

              <div className={styles.field}>
                <label className={styles.label}>{UI.cards.tags}</label>
                <div className={styles.tagInputField}>
                  {isEdit ? (
                    <TagInput cardId={card.id} />
                  ) : (
                    <TagInput
                      pendingTags={pendingTags}
                      onPendingChange={setPendingTags}
                    />
                  )}
                </div>
              </div>

              {isEdit && (
                <div className={styles.linkedNotesSection}>
                  <p className={styles.linkedNotesTitle}>
                    {UI.cards.linkedNotes}
                  </p>

                  {linksLoading && (
                    <p className={styles.hint}>{UI.common.loading}</p>
                  )}
                  {linksError && (
                    <p className={styles.fieldError}>{linksError}</p>
                  )}

                  {!linksLoading && linkedNotes.length === 0 && (
                    <p className={styles.hint}>{UI.cards.noLinkedNotes}</p>
                  )}

                  {!linksLoading && linkedNotes.length > 0 && (
                    <ul className={styles.linkedNotesList}>
                      {linkedNotes.map((note) => (
                        <li key={note.id} className={styles.linkedNoteItem}>
                          <span className={styles.linkedNoteTitle}>
                            {note.title.trim() || UI.notes.untitled}
                          </span>
                          <button
                            type="button"
                            className={styles.unlinkButton}
                            onClick={() => void handleUnlinkNote(note.id)}
                          >
                            {UI.cards.unlink}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className={styles.linkedNoteSelectRow}>
                    <label
                      className={styles.label}
                      htmlFor="linked-note-select"
                    >
                      {UI.cards.addLink}
                    </label>
                    <select
                      id="linked-note-select"
                      className={styles.linkedNoteSelect}
                      value={selectedLinkNoteId}
                      onChange={(event) => {
                        const noteId = event.target.value;
                        setSelectedLinkNoteId('');
                        if (noteId) {
                          void handleLinkNote(noteId);
                        }
                      }}
                      disabled={linksLoading || availableLinkNotes.length === 0}
                    >
                      <option value="">{UI.cards.chooseNote}</option>
                      {availableLinkNotes.map((note) => (
                        <option key={note.id} value={note.id}>
                          {note.title.trim() || UI.notes.untitled}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className={styles.footer}>
                <button
                  className={styles.cancelButton}
                  type="button"
                  onClick={onClose}
                >
                  {UI.common.cancel}
                </button>
                <button
                  className={styles.submitButton}
                  type="submit"
                  disabled={isSubmitDisabled}
                >
                  {UI.cards.saveCard}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      </>
    </AnimatePresence>
  );
}
