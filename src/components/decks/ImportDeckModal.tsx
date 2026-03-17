import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createCard } from '../../db/repositories/cards';
import { createDeck } from '../../db/repositories/decks';
import type { Deck } from '../../db/repositories/decks';
import {
  importDeckFromApkg,
  importDeckFromJson,
  parsePastedCards,
} from '../../lib/deckImport';
import { parseApkg } from '../../lib/apkgImport';
import { UI } from '../../ui-strings';
import { useDeckStore } from '../../store/decks';
import styles from './ImportDeckModal.module.css';

type ImportTab = 'paste' | 'json' | 'apkg';
type Delimiter = '\t' | ';' | ',';

const TAB_ORDER: ImportTab[] = ['paste', 'json', 'apkg'];

interface ImportDeckModalProps {
  isOpen: boolean;
  onClose: () => void;
  allDecks: Deck[];
}

function countDeckNodes(node: { children: unknown[] }): number {
  const children = node.children as Array<{ children: unknown[] }>;
  return children.reduce((sum, child) => sum + 1 + countDeckNodes(child), 0);
}

function countCards(node: { cards: unknown[]; children: unknown[] }): number {
  const children = node.children as Array<{
    cards: unknown[];
    children: unknown[];
  }>;
  return (
    node.cards.length +
    children.reduce((sum, child) => sum + countCards(child), 0)
  );
}

export function ImportDeckModal({
  isOpen,
  onClose,
  allDecks,
}: ImportDeckModalProps) {
  const { fetchDecks } = useDeckStore();
  const [tab, setTab] = useState<ImportTab>('paste');
  const tabRefs = useRef<Record<ImportTab, HTMLButtonElement | null>>({
    paste: null,
    json: null,
    apkg: null,
  });

  const [pasteText, setPasteText] = useState('');
  const [delimiter, setDelimiter] = useState<Delimiter>('\t');
  const [targetDeckId, setTargetDeckId] = useState('');
  const [newDeckName, setNewDeckName] = useState('');

  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [jsonPreview, setJsonPreview] = useState<{
    deckName: string;
    cardCount: number;
    subDeckCount: number;
  } | null>(null);

  const [apkgFile, setApkgFile] = useState<File | null>(null);
  const [apkgPreview, setApkgPreview] = useState<{
    deckNames: string[];
    cardCount: number;
  } | null>(null);

  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [apkgLogLines, setApkgLogLines] = useState<string[]>([]);
  const [jsonParsing, setJsonParsing] = useState(false);
  const [apkgParsing, setApkgParsing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTab('paste');
    setPasteText('');
    setDelimiter('\t');
    setTargetDeckId('');
    setNewDeckName('');
    setJsonFile(null);
    setJsonPreview(null);
    setApkgFile(null);
    setApkgPreview(null);
    setResultMessage(null);
    setError(null);
    setSubmitting(false);
    setApkgLogLines([]);
    setJsonParsing(false);
    setApkgParsing(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    tabRefs.current[tab]?.focus();
  }, [isOpen, tab]);

  const parsedPaste = useMemo(
    () => parsePastedCards(pasteText, delimiter),
    [pasteText, delimiter],
  );

  const pastePreview = parsedPaste.cards.slice(0, 5);

  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleImportPaste = async () => {
    setSubmitting(true);
    setError(null);
    setResultMessage(null);

    try {
      let deckId = targetDeckId;
      if (targetDeckId === '__new__') {
        const trimmedName = newDeckName.trim();
        if (!trimmedName) {
          throw new Error(UI.decks.deckName);
        }
        const created = await createDeck({ name: trimmedName });
        deckId = created.id;
      }

      if (!deckId) {
        throw new Error(UI.decks.importTargetDeck);
      }

      for (const card of parsedPaste.cards) {
        await createCard({
          deckId,
          cardType: 'basic',
          front: card.front,
          back: card.back,
        });
      }

      await fetchDecks();

      const importedMessage = UI.decks.importSuccess(parsedPaste.cards.length);
      const skippedMessage =
        parsedPaste.skipped > 0
          ? ` ${UI.decks.importCardsSkipped(parsedPaste.skipped)}`
          : '';
      setResultMessage(`${importedMessage}.${skippedMessage}`.trim());
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : UI.common.error,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleJsonFileSelect = async (file: File | null) => {
    setJsonFile(file);
    setJsonPreview(null);
    setError(null);
    setJsonParsing(false);

    if (!file) return;

    try {
      setJsonParsing(true);
      const payload = JSON.parse(await file.text()) as {
        deck?: { name: string; cards: unknown[]; children: unknown[] };
      };

      if (!payload.deck) {
        throw new Error(UI.decks.importInvalidJson);
      }

      setJsonPreview({
        deckName: payload.deck.name,
        cardCount: countCards(payload.deck),
        subDeckCount: countDeckNodes(payload.deck),
      });
    } catch (previewError) {
      setError(
        previewError instanceof Error ? previewError.message : UI.common.error,
      );
    } finally {
      setJsonParsing(false);
    }
  };

  const handleImportJson = async () => {
    if (!jsonFile) return;
    setSubmitting(true);
    setError(null);
    setResultMessage(null);

    try {
      const result = await importDeckFromJson(jsonFile);
      await fetchDecks();

      if (result.errors.length > 0) {
        setError(result.errors.join(' '));
      }

      setResultMessage(
        `${UI.decks.importSuccess(result.imported)}${
          result.updated > 0
            ? ` (${UI.decks.importUpdated(result.updated)})`
            : ''
        }`,
      );
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : UI.common.error,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleApkgFileSelect = async (file: File | null) => {
    setApkgFile(file);
    setApkgPreview(null);
    setError(null);
    setApkgParsing(false);

    if (!file) return;

    try {
      setApkgParsing(true);
      const parsed = await parseApkg(file);
      setApkgPreview({
        deckNames: Array.from(new Set(parsed.decks.map((deck) => deck.path))),
        cardCount: parsed.notes.length,
      });
    } catch (previewError) {
      setError(
        previewError instanceof Error ? previewError.message : UI.common.error,
      );
    } finally {
      setApkgParsing(false);
    }
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = TAB_ORDER.indexOf(tab);

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      const next = TAB_ORDER[(currentIndex + 1) % TAB_ORDER.length];
      setTab(next);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const next =
        TAB_ORDER[(currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length];
      setTab(next);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setTab(TAB_ORDER[0]);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setTab(TAB_ORDER[TAB_ORDER.length - 1]);
    }
  };

  const importedLines = apkgLogLines.filter((line) =>
    line.toLowerCase().includes('imported note'),
  );
  const skippedLines = apkgLogLines.filter((line) =>
    line.toLowerCase().includes('skipped note'),
  );
  const infoLines = apkgLogLines.filter(
    (line) =>
      !line.toLowerCase().includes('imported note') &&
      !line.toLowerCase().includes('skipped note'),
  );

  const handleImportApkg = async () => {
    if (!apkgFile) return;
    setSubmitting(true);
    setError(null);
    setResultMessage(null);

    try {
      const result = await importDeckFromApkg(apkgFile);
      await fetchDecks();

      const skippedSuffix =
        result.skipped > 0
          ? ` ${UI.decks.importCardsSkipped(result.skipped)}`
          : '';
      setResultMessage(
        `${UI.decks.importSuccess(result.imported)}.${skippedSuffix}`.trim(),
      );
      setApkgLogLines(result.warnings);
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : UI.common.error,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
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
            aria-label={UI.decks.importDeck}
            onClick={handleBackdropClick}
          >
            <motion.div
              className={styles.modal}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <div className={styles.header}>
                <h2 className={styles.title}>{UI.decks.importDeck}</h2>
                <button
                  className={styles.closeButton}
                  type="button"
                  onClick={onClose}
                  aria-label={UI.common.close}
                >
                  x
                </button>
              </div>

              <div
                className={styles.tabRow}
                role="tablist"
                aria-label={UI.decks.importTabsLabel}
                aria-describedby="import-tabs-shortcuts"
                onKeyDown={handleTabKeyDown}
              >
                <button
                  ref={(element) => {
                    tabRefs.current.paste = element;
                  }}
                  type="button"
                  className={tab === 'paste' ? styles.tabActive : styles.tab}
                  onClick={() => setTab('paste')}
                  id="import-tab-paste"
                  role="tab"
                  aria-selected={tab === 'paste'}
                  aria-controls="import-panel-paste"
                  aria-keyshortcuts="ArrowLeft ArrowRight Home End Enter Space"
                  tabIndex={tab === 'paste' ? 0 : -1}
                >
                  {UI.decks.importTabPaste}
                </button>
                <button
                  ref={(element) => {
                    tabRefs.current.json = element;
                  }}
                  type="button"
                  className={tab === 'json' ? styles.tabActive : styles.tab}
                  onClick={() => setTab('json')}
                  id="import-tab-json"
                  role="tab"
                  aria-selected={tab === 'json'}
                  aria-controls="import-panel-json"
                  aria-keyshortcuts="ArrowLeft ArrowRight Home End Enter Space"
                  tabIndex={tab === 'json' ? 0 : -1}
                >
                  {UI.decks.importTabJson}
                </button>
                <button
                  ref={(element) => {
                    tabRefs.current.apkg = element;
                  }}
                  type="button"
                  className={tab === 'apkg' ? styles.tabActive : styles.tab}
                  onClick={() => setTab('apkg')}
                  id="import-tab-apkg"
                  role="tab"
                  aria-selected={tab === 'apkg'}
                  aria-controls="import-panel-apkg"
                  aria-keyshortcuts="ArrowLeft ArrowRight Home End Enter Space"
                  tabIndex={tab === 'apkg' ? 0 : -1}
                >
                  {UI.decks.importTabApkg}
                </button>
              </div>

              <p id="import-tabs-shortcuts" className={styles.visuallyHidden}>
                {UI.decks.importTabsKeyboardHint}
              </p>

              {tab === 'paste' && (
                <div
                  className={styles.body}
                  id="import-panel-paste"
                  role="tabpanel"
                  aria-labelledby="import-tab-paste"
                >
                  <label className={styles.label} htmlFor="paste-cards-input">
                    {UI.decks.importTabPaste}
                  </label>
                  <textarea
                    id="paste-cards-input"
                    className={styles.textarea}
                    value={pasteText}
                    onChange={(event) => setPasteText(event.target.value)}
                  />

                  <div className={styles.field}>
                    <span className={styles.label}>
                      {UI.decks.importDelimiterLabel}
                    </span>
                    <div className={styles.radioRow}>
                      <label className={styles.radioLabel}>
                        <input
                          type="radio"
                          checked={delimiter === '\t'}
                          onChange={() => setDelimiter('\t')}
                        />
                        {UI.decks.importDelimiterTab}
                      </label>
                      <label className={styles.radioLabel}>
                        <input
                          type="radio"
                          checked={delimiter === ';'}
                          onChange={() => setDelimiter(';')}
                        />
                        {UI.decks.importDelimiterSemicolon}
                      </label>
                      <label className={styles.radioLabel}>
                        <input
                          type="radio"
                          checked={delimiter === ','}
                          onChange={() => setDelimiter(',')}
                        />
                        {UI.decks.importDelimiterComma}
                      </label>
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label
                      className={styles.label}
                      htmlFor="target-deck-select"
                    >
                      {UI.decks.importTargetDeck}
                    </label>
                    <select
                      id="target-deck-select"
                      className={styles.select}
                      value={targetDeckId}
                      onChange={(event) => setTargetDeckId(event.target.value)}
                    >
                      <option value="">{UI.decks.importTargetDeck}</option>
                      {allDecks.map((deck) => (
                        <option key={deck.id} value={deck.id}>
                          {deck.path}
                        </option>
                      ))}
                      <option value="__new__">{UI.decks.importNewDeck}</option>
                    </select>

                    {targetDeckId === '__new__' && (
                      <input
                        className={styles.input}
                        type="text"
                        value={newDeckName}
                        onChange={(event) => setNewDeckName(event.target.value)}
                        placeholder={UI.decks.deckName}
                      />
                    )}
                  </div>

                  <p className={styles.previewCount}>
                    {UI.decks.importCardsDetected(parsedPaste.cards.length)}
                  </p>
                  {parsedPaste.skipped > 0 && (
                    <p className={styles.previewSkipped}>
                      {UI.decks.importCardsSkipped(parsedPaste.skipped)}
                    </p>
                  )}

                  <div className={styles.previewList}>
                    {pastePreview.map((card, index) => (
                      <p key={index} className={styles.previewItem}>
                        {UI.decks.importPreviewPair(card.front, card.back)}
                      </p>
                    ))}
                  </div>

                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => void handleImportPaste()}
                    disabled={
                      parsedPaste.cards.length === 0 ||
                      submitting ||
                      !targetDeckId ||
                      (targetDeckId === '__new__' &&
                        newDeckName.trim().length === 0)
                    }
                  >
                    {UI.decks.importDeck}
                  </button>
                </div>
              )}

              {tab === 'json' && (
                <div
                  className={styles.body}
                  id="import-panel-json"
                  role="tabpanel"
                  aria-labelledby="import-tab-json"
                >
                  <input
                    className={styles.fileInput}
                    type="file"
                    accept=".json,application/json"
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] ?? null;
                      void handleJsonFileSelect(nextFile);
                    }}
                  />

                  {jsonFile && (
                    <p className={styles.previewItem}>{jsonFile.name}</p>
                  )}

                  {jsonParsing && (
                    <p className={styles.previewStatus}>
                      {UI.decks.importPreviewParsing}
                    </p>
                  )}

                  {jsonPreview && (
                    <div className={styles.previewPanel}>
                      <p className={styles.previewItem}>
                        {jsonPreview.deckName}
                      </p>
                      <p className={styles.previewItem}>
                        {UI.decks.importCardsDetected(jsonPreview.cardCount)}
                      </p>
                      <p className={styles.previewItem}>
                        {UI.decks.importSubDeckCount(jsonPreview.subDeckCount)}
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => void handleImportJson()}
                    disabled={!jsonFile || submitting || jsonParsing}
                  >
                    {UI.decks.importDeck}
                  </button>
                </div>
              )}

              {tab === 'apkg' && (
                <div
                  className={styles.body}
                  id="import-panel-apkg"
                  role="tabpanel"
                  aria-labelledby="import-tab-apkg"
                >
                  <input
                    className={styles.fileInput}
                    type="file"
                    accept=".apkg"
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] ?? null;
                      void handleApkgFileSelect(nextFile);
                    }}
                  />

                  {apkgFile && (
                    <p className={styles.previewItem}>{apkgFile.name}</p>
                  )}

                  {apkgParsing && (
                    <p className={styles.previewStatus}>
                      {UI.decks.importPreviewParsing}
                    </p>
                  )}

                  {apkgPreview && (
                    <div className={styles.previewPanel}>
                      <p className={styles.previewItem}>
                        {UI.decks.importCardsDetected(apkgPreview.cardCount)}
                      </p>
                      <div className={styles.previewList}>
                        {apkgPreview.deckNames.slice(0, 8).map((deckName) => (
                          <p key={deckName} className={styles.previewItem}>
                            {deckName}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className={styles.warning}>{UI.decks.importAnkiWarning}</p>

                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => void handleImportApkg()}
                    disabled={!apkgFile || submitting || apkgParsing}
                  >
                    {UI.decks.importDeck}
                  </button>

                  {apkgLogLines.length > 0 && (
                    <div className={styles.logPanel}>
                      <h3 className={styles.logHeading}>
                        {UI.decks.importAnkiLog}
                      </h3>

                      {importedLines.length > 0 && (
                        <div className={styles.logSection}>
                          <p className={styles.logSectionTitle}>
                            {UI.decks.importLogImported(importedLines.length)}
                          </p>
                          {importedLines.map((line, index) => (
                            <p
                              key={`${line}-${index}`}
                              className={styles.logLine}
                            >
                              {line}
                            </p>
                          ))}
                        </div>
                      )}

                      {skippedLines.length > 0 && (
                        <div className={styles.logSection}>
                          <p className={styles.logSectionTitle}>
                            {UI.decks.importLogSkipped(skippedLines.length)}
                          </p>
                          {skippedLines.map((line, index) => (
                            <p
                              key={`${line}-${index}`}
                              className={styles.logLine}
                            >
                              {line}
                            </p>
                          ))}
                        </div>
                      )}

                      {infoLines.length > 0 && (
                        <div className={styles.logSection}>
                          <p className={styles.logSectionTitle}>
                            {UI.decks.importLogInfo}
                          </p>
                          {infoLines.map((line, index) => (
                            <p
                              key={`${line}-${index}`}
                              className={styles.logLine}
                            >
                              {line}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {error && <p className={styles.error}>{error}</p>}
              {resultMessage && (
                <p className={styles.success}>{resultMessage}</p>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
