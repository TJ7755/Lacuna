// Paste + auto-split flow for lines-mode sequences: paste a raw script, split it
// into speaker-tagged items via the pure `splitScript` parser, then let the author
// correct any misattributed lines in a preview before replacing the editor's item
// list. Mirrors LinkCardsDialog's modal shell (focus trap, Escape-to-close).

import { useMemo, useState } from 'react';
import { dialogKeyDown } from '../../hooks/dialogKeys';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { splitScript, type SplitScriptItem } from '../../db/scriptSplitter';
import { makeId } from '../../db/schema';
import { Button } from '../ui/Button';
import { TrashIcon } from '../ui/icons';
import type { SequenceItem } from '../../db/types';
import { DialogHeader, DialogPanel } from '../ui/DialogPanel';

interface ScriptPasteImportProps {
  onImport: (items: SequenceItem[]) => void;
  onCancel: () => void;
}

export function ScriptPasteImport({ onImport, onCancel }: ScriptPasteImportProps) {
  const trapRef = useFocusTrap(true, { autoFocusSelector: '[data-script-paste-input]' });
  const [raw, setRaw] = useState('');
  const [preview, setPreview] = useState<SplitScriptItem[] | null>(null);
  const [unmatchedCount, setUnmatchedCount] = useState(0);

  const distinctSpeakers = useMemo(() => {
    if (!preview) return [];
    const seen = new Set<string>();
    const order: string[] = [];
    for (const item of preview) {
      if (!seen.has(item.speaker)) {
        seen.add(item.speaker);
        order.push(item.speaker);
      }
    }
    return order;
  }, [preview]);

  function handleSplit() {
    const result = splitScript(raw, makeId);
    setPreview(result.items);
    setUnmatchedCount(result.unmatchedLines.length);
  }

  function updatePreviewItem(id: string, patch: Partial<SplitScriptItem>) {
    setPreview((prev) => prev?.map((item) => (item.id === id ? { ...item, ...patch } : item)) ?? null);
  }

  function deletePreviewItem(id: string) {
    setPreview((prev) => prev?.filter((item) => item.id !== id) ?? null);
  }

  function handleConfirm() {
    if (!preview || preview.length === 0) return;
    onImport(preview.map(({ id, speaker, value }) => ({ id, speaker, value })));
  }

  return (
    <DialogPanel
      label="Paste script"
      trapRef={trapRef}
      onBackdropClick={onCancel}
      className="max-h-[90vh] max-w-2xl"
      onKeyDown={dialogKeyDown({
        onCancel,
        onSubmit: () => {
          if (!preview) {
            if (raw.trim()) handleSplit();
          } else if (preview.length > 0) {
            handleConfirm();
          }
        },
      })}
    >
      <DialogHeader
        title="Paste script"
        description={
          <>
            Paste lines in the form &ldquo;NAME: line&rdquo; — each one becomes an item, tagged with
            its speaker.
          </>
        }
        onClose={onCancel}
        closeLabel="Close script paste"
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {!preview ? (
          <>
            <textarea
              data-script-paste-input
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={'ALICE: Hello there.\nBOB: General Kenobi.'}
              rows={12}
              className="w-full resize-y rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 font-mono text-sm outline-none focus:border-accent"
            />
          </>
        ) : (
          <div className="flex flex-col gap-3">
            {unmatchedCount > 0 && (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning-fg">
                {unmatchedCount} line{unmatchedCount === 1 ? '' : 's'} before the first recognised speaker
                {' '}
                {unmatchedCount === 1 ? 'was' : 'were'} skipped.
              </p>
            )}
            {preview.length === 0 ? (
              <p className="text-sm text-ink-faint">
                No &ldquo;NAME: line&rdquo; pattern was recognised. Go back and check the format.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {preview.map((item, i) => (
                  <div key={item.id} className="flex items-start gap-2 rounded-lg border border-line p-2.5">
                    <span className="mt-3.5 w-5 shrink-0 text-center text-xs text-ink-faint">{i + 1}</span>
                    <input
                      type="text"
                      value={item.speaker}
                      onChange={(e) => updatePreviewItem(item.id, { speaker: e.target.value })}
                      aria-label={`Speaker for line ${i + 1}`}
                      className="min-h-11 w-32 shrink-0 rounded-lg border border-line bg-transparent px-2 py-1.5 text-sm font-medium outline-none focus:border-accent"
                    />
                    <textarea
                      value={item.value}
                      onChange={(e) => updatePreviewItem(item.id, { value: e.target.value })}
                      aria-label={`Line ${i + 1} content`}
                      rows={1}
                      className="min-h-11 flex-1 resize-y rounded-lg border border-line bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => deletePreviewItem(item.id)}
                      title="Remove line"
                      aria-label={`Remove line ${i + 1}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-negative/10 hover:text-negative"
                    >
                      <TrashIcon width={14} height={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {distinctSpeakers.length > 0 && (
              <p className="text-xs text-ink-faint">
                Speakers found: {distinctSpeakers.join(', ')}. Pick which one is yours after importing.
              </p>
            )}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
        {preview ? (
          <Button variant="ghost" onClick={() => setPreview(null)}>Back</Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          {!preview ? (
            <Button variant="primary" disabled={!raw.trim()} onClick={handleSplit}>
              Split into lines
            </Button>
          ) : (
            <Button variant="primary" disabled={preview.length === 0} onClick={handleConfirm}>
              Use these {preview.length} line{preview.length === 1 ? '' : 's'}
            </Button>
          )}
        </div>
      </footer>
    </DialogPanel>
  );
}
