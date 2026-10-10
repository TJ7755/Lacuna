import { m as motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { formatQuestionMeta, type AttemptMark, type QuestionBankSummary } from '../../questions/bankSummary';
import { cn } from '../ui/cn';
import { ClockIcon, EditIcon } from '../ui/icons';
import { MOTION_EASING } from '../ui/motion';

const MARK_CLASS: Record<AttemptMark, string> = {
  right: 'bg-positive',
  wrong: 'bg-warning',
  none: 'bg-ink/10',
};

const MARK_LABEL: Record<AttemptMark, string> = {
  right: 'right',
  wrong: 'wrong',
  none: 'not attempted',
};

export interface QuestionBankCardProps {
  name: string;
  topic: string;
  description: string | null;
  descriptionWarning?: boolean;
  due: { label: string; today: boolean };
  summary: QuestionBankSummary;
  editHref: string;
  index: number;
  multiplier: number;
}

/** One Question in the bank: where it sits, when it is due, how recent attempts went. */
export function QuestionBankCard({
  name,
  topic,
  description,
  descriptionWarning = false,
  due,
  summary,
  editHref,
  index,
  multiplier,
}: QuestionBankCardProps) {
  const meta = formatQuestionMeta(summary);
  // Cards rise in with a capped stagger so a long bank never makes the page wait.
  const delay = Math.min(index, 7) * 0.04 * multiplier;
  const history = summary.marks.map((mark) => MARK_LABEL[mark]).join(', ');
  return (
    <motion.article
      initial={multiplier > 0 ? { opacity: 0, y: 14 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.46 * multiplier, delay, ease: MOTION_EASING.emphasised }}
      className="flex flex-col gap-3 rounded-3xl bg-surface px-6 py-5 shadow-card"
    >
      <div className="flex items-center gap-2 text-[13px]">
        <span className="min-w-0 truncate font-bold text-ink-soft">{topic}</span>
        <span
          className={cn(
            'ml-auto shrink-0 font-bold',
            due.today ? 'text-ink' : 'font-normal text-ink-faint',
          )}
        >
          {due.label}
        </span>
      </div>
      <h2 className="text-lg font-bold leading-tight text-ink">{name}</h2>
      {description && (
        <p
          className={cn(
            'truncate text-[15px]',
            descriptionWarning ? 'text-warning-fg' : 'text-ink-soft',
          )}
        >
          {description}
        </p>
      )}
      <div className="mt-auto flex items-center gap-2.5 pt-1.5">
        <span role="img" aria-label={`Last five attempts: ${history}`} className="flex gap-[3px]">
          {summary.marks.map((mark, markIndex) => (
            <motion.span
              key={markIndex}
              initial={multiplier > 0 && mark !== 'none' ? { scale: 0 } : false}
              animate={{ scale: 1 }}
              transition={{
                type: 'spring',
                stiffness: 520 / Math.max(multiplier, 0.01) ** 2,
                damping: 24 / Math.max(multiplier, 0.01),
                delay: delay + (0.2 + markIndex * 0.05) * multiplier,
              }}
              className={cn('size-2 rounded-[2px]', MARK_CLASS[mark])}
            />
          ))}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-faint">{summary.record}</span>
        {meta && (
          <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] text-ink-soft">
            <ClockIcon width={14} height={14} aria-hidden="true" />
            {meta}
          </span>
        )}
        <Link
          to={editHref}
          aria-label={`Edit ${name}`}
          className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-ink/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <EditIcon width={16} height={16} />
        </Link>
      </div>
    </motion.article>
  );
}
