// Unified export panel: a single export UI for full backups and card/review formats.
// Course share codes use the dedicated Course-facing Share page.

import { useState } from 'react';
import { m as motion } from 'motion/react';
import { DownloadIcon, FileTextIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { useToast } from '../ui/Toast';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import {
  exportCardsCsv,
  exportCardsTsv,
  exportCardsPlainText,
  exportCardsMarkdownTable,
  exportCardsJson,
  downloadTextFile,
  exportReviewHistoryCsv,
  exportReviewHistoryJson,
} from '../../db/export';
import { downloadBackup } from '../../db/portability';

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
  description: string;
  extension: string;
  mimeType: string;
  icon: React.ReactNode;
}

const EXPORT_FORMATS: ExportFormatDef[] = [
  {
    id: 'json-backup',
    label: 'Full backup',
    description: 'Complete database snapshot with all courses, cards, review history, and images.',
    extension: 'json',
    mimeType: 'application/json',
    icon: <DownloadIcon width={18} height={18} />,
  },
  {
    id: 'csv',
    label: 'CSV',
    description: 'Comma-separated values. Human-readable, compatible with spreadsheets.',
    extension: 'csv',
    mimeType: 'text/csv',
    icon: <FileTextIcon width={18} height={18} />,
  },
  {
    id: 'tsv',
    label: 'TSV',
    description: 'Tab-separated values. Compatible with Anki import.',
    extension: 'tsv',
    mimeType: 'text/tab-separated-values',
    icon: <FileTextIcon width={18} height={18} />,
  },
  {
    id: 'markdown-table',
    label: 'Markdown table',
    description: 'A GFM Markdown table with front, back, and tags columns.',
    extension: 'md',
    mimeType: 'text/markdown',
    icon: <FileTextIcon width={18} height={18} />,
  },
  {
    id: 'json-array',
    label: 'JSON array',
    description: 'A JSON array of card objects. Re-importable into Lacuna.',
    extension: 'json',
    mimeType: 'application/json',
    icon: <FileTextIcon width={18} height={18} />,
  },
  {
    id: 'plain-text',
    label: 'Plain text',
    description: 'Human-readable Q:/A: format with course, lesson and tag metadata.',
    extension: 'txt',
    mimeType: 'text/plain',
    icon: <FileTextIcon width={18} height={18} />,
  },
  {
    id: 'review-history-csv',
    label: 'Review history (CSV)',
    description: 'Every review log with timestamps, grades, and response times.',
    extension: 'csv',
    mimeType: 'text/csv',
    icon: <FileTextIcon width={18} height={18} />,
  },
  {
    id: 'review-history-json',
    label: 'Review history (JSON)',
    description: 'Review history as a JSON array of objects.',
    extension: 'json',
    mimeType: 'application/json',
    icon: <FileTextIcon width={18} height={18} />,
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface UnifiedExportPanelProps {
  /** Label shown above the format grid. */
  heading?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UnifiedExportPanel({ heading = 'Export your data' }: UnifiedExportPanelProps) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  const stamp = new Date().toISOString().slice(0, 10);
  const formats = EXPORT_FORMATS;

  async function handleExport(format: ExportFormatDef) {
    setBusy(true);
    try {
      switch (format.id) {
        case 'json-backup':
          await downloadBackup();
          break;
        case 'csv': {
          const csv = await exportCardsCsv();
          downloadTextFile(csv, `lacuna-cards-${stamp}.csv`, format.mimeType);
          break;
        }
        case 'tsv': {
          const tsv = await exportCardsTsv();
          downloadTextFile(tsv, `lacuna-cards-${stamp}.tsv`, format.mimeType);
          break;
        }
        case 'markdown-table': {
          const md = await exportCardsMarkdownTable();
          downloadTextFile(md, `lacuna-cards-${stamp}.md`, format.mimeType);
          break;
        }
        case 'json-array': {
          const json = await exportCardsJson();
          downloadTextFile(json, `lacuna-cards-${stamp}.json`, format.mimeType);
          break;
        }
        case 'plain-text': {
          const text = await exportCardsPlainText();
          downloadTextFile(text, `lacuna-cards-${stamp}.txt`, format.mimeType);
          break;
        }
        case 'review-history-csv': {
          const csv = await exportReviewHistoryCsv();
          downloadTextFile(csv, `lacuna-review-history-${stamp}.csv`, format.mimeType);
          break;
        }
        case 'review-history-json': {
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

  return (
    <div className="flex flex-col gap-5">
      {/* Eyebrow heading */}
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-faint">
        {heading}
      </p>

      {/* Format grid — rounded-2xl cards with soft shadows per SPEC §3.4 */}
      <div className="grid gap-3 sm:grid-cols-2">
        {formats.map((format, i) => (
          <motion.button
            key={format.id}
            type="button"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.2 * m,
              delay: Math.min(i * 0.03, 0.12) * m,
              ease: [0.16, 1, 0.3, 1],
            }}
            onClick={() => void handleExport(format)}
            disabled={busy}
            className={cn(
              'group flex items-start gap-3.5 rounded-2xl border border-line bg-surface p-4 text-left transition-all',
              'hover:border-line-strong hover:bg-surface-raised/40 hover:shadow-sm hover:shadow-black/5',
              'disabled:opacity-40 disabled:pointer-events-none',
            )}
          >
            <div className="mt-0.5 rounded-xl border border-line bg-surface-raised p-2 text-ink-faint transition-all group-hover:border-accent/30 group-hover:bg-accent-soft/30 group-hover:text-accent">
              {format.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink transition-colors group-hover:text-ink">
                {format.label}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                {format.description}
              </p>
            </div>
          </motion.button>
        ))}
      </div>

    </div>
  );
}
