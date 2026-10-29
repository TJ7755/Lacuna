// Unified export panel: a single export UI for full backups and card/review formats.
// Course share codes use the dedicated Course-facing Share page.

import { useState } from 'react';
import { Button } from '../ui/Button';
import { DownloadIcon } from '../ui/icons';
import { useToast } from '../ui/Toast';

// ---------------------------------------------------------------------------
// Export format definitions
// ---------------------------------------------------------------------------

type ExportFormat =
  | 'json-backup'
  | 'csv'
  | 'tsv'
  | 'markdown-table'
  | 'json-array'
  | 'plain-text'
  | 'review-history-csv'
  | 'review-history-json';

interface ExportFormatDef {
  id: ExportFormat;
  label: string;
  /** Accessible name; the visible label alone repeats across the two groups. */
  name: string;
  description: string;
  mimeType: string;
}

const FULL_BACKUP: ExportFormatDef = {
  id: 'json-backup',
  label: 'Download',
  name: 'Download full backup',
  description: 'Every course, Card, Question, attempt, schedule and image, as JSON.',
  mimeType: 'application/json',
};

const CARD_FORMATS: ExportFormatDef[] = [
  {
    id: 'csv',
    label: 'CSV',
    name: 'Cards as CSV',
    description: 'Comma-separated values. Human-readable, compatible with spreadsheets.',
    mimeType: 'text/csv',
  },
  {
    id: 'tsv',
    label: 'TSV',
    name: 'Cards as TSV',
    description: 'Tab-separated values. Compatible with Anki import.',
    mimeType: 'text/tab-separated-values',
  },
  {
    id: 'markdown-table',
    label: 'Markdown',
    name: 'Cards as a Markdown table',
    description: 'A GFM Markdown table with front, back, and tags columns.',
    mimeType: 'text/markdown',
  },
  {
    id: 'json-array',
    label: 'JSON',
    name: 'Cards as a JSON array',
    description: 'A JSON array of card objects. Re-importable into Lacuna.',
    mimeType: 'application/json',
  },
  {
    id: 'plain-text',
    label: 'Plain text',
    name: 'Cards as plain text',
    description: 'Human-readable Q:/A: format with course, lesson and tag metadata.',
    mimeType: 'text/plain',
  },
];

const REVIEW_FORMATS: ExportFormatDef[] = [
  {
    id: 'review-history-csv',
    label: 'CSV',
    name: 'Review history as CSV',
    description: 'Every review log with timestamps, grades, and response times.',
    mimeType: 'text/csv',
  },
  {
    id: 'review-history-json',
    label: 'JSON',
    name: 'Review history as JSON',
    description: 'Review history as a JSON array of objects.',
    mimeType: 'application/json',
  },
];

export function UnifiedExportPanel() {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  const stamp = new Date().toISOString().slice(0, 10);

  async function handleExport(format: ExportFormatDef) {
    setBusy(true);
    try {
      switch (format.id) {
        case 'json-backup': {
          const { downloadBackup } = await import('../../db/portability');
          await downloadBackup();
          break;
        }
        case 'csv': {
          const { downloadTextFile, exportCardsCsv } = await import('../../db/export');
          const csv = await exportCardsCsv();
          downloadTextFile(csv, `lacuna-cards-${stamp}.csv`, format.mimeType);
          break;
        }
        case 'tsv': {
          const { downloadTextFile, exportCardsTsv } = await import('../../db/export');
          const tsv = await exportCardsTsv();
          downloadTextFile(tsv, `lacuna-cards-${stamp}.tsv`, format.mimeType);
          break;
        }
        case 'markdown-table': {
          const { downloadTextFile, exportCardsMarkdownTable } = await import('../../db/export');
          const md = await exportCardsMarkdownTable();
          downloadTextFile(md, `lacuna-cards-${stamp}.md`, format.mimeType);
          break;
        }
        case 'json-array': {
          const { downloadTextFile, exportCardsJson } = await import('../../db/export');
          const json = await exportCardsJson();
          downloadTextFile(json, `lacuna-cards-${stamp}.json`, format.mimeType);
          break;
        }
        case 'plain-text': {
          const { downloadTextFile, exportCardsPlainText } = await import('../../db/export');
          const text = await exportCardsPlainText();
          downloadTextFile(text, `lacuna-cards-${stamp}.txt`, format.mimeType);
          break;
        }
        case 'review-history-csv': {
          const { downloadTextFile, exportReviewHistoryCsv } = await import('../../db/export');
          const csv = await exportReviewHistoryCsv();
          downloadTextFile(csv, `lacuna-review-history-${stamp}.csv`, format.mimeType);
          break;
        }
        case 'review-history-json': {
          const { downloadTextFile, exportReviewHistoryJson } = await import('../../db/export');
          const json = await exportReviewHistoryJson();
          downloadTextFile(json, `lacuna-review-history-${stamp}.json`, format.mimeType);
          break;
        }
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Export failed.', 'negative');
    } finally {
      setBusy(false);
    }
  }

  function formatGroup(label: string, formats: ExportFormatDef[]) {
    return (
      <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-ink-faint">{label}</span>
        {formats.map((format) => (
          <Button
            key={format.id}
            variant="ghost"
            size="sm"
            aria-label={format.name}
            title={format.description}
            disabled={busy}
            onClick={() => void handleExport(format)}
          >
            {format.label}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-paper px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink">Full backup</div>
          <p className="text-xs text-ink-soft">{FULL_BACKUP.description}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          aria-label={FULL_BACKUP.name}
          disabled={busy}
          onClick={() => void handleExport(FULL_BACKUP)}
        >
          <DownloadIcon width={16} height={16} />
          {FULL_BACKUP.label}
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-ink/10 pt-3">
        {formatGroup('Cards', CARD_FORMATS)}
        {formatGroup('Review history', REVIEW_FORMATS)}
      </div>
    </div>
  );
}
