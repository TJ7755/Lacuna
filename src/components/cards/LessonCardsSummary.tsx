// Read-only cards summary for LessonView's study mode — card count, due
// count and mastery percentage, standing in for the editable CardList table
// (LessonCardsSection) that edit mode shows instead. The Study CTA already
// lives in the page header, so this section is purely informational.

interface LessonCardsSummaryProps {
  cardCount: number;
  dueCount: number;
  masteryPct: number;
  className?: string;
}

export function LessonCardsSummary({
  cardCount,
  dueCount,
  masteryPct,
  className,
}: LessonCardsSummaryProps) {
  return (
    <section className={className}>
      <h2 className="mb-4 font-display text-xl text-ink-soft">
        Cards <span className="text-ink-faint">({cardCount})</span>
      </h2>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-line px-4 py-3">
          <div className="text-2xl font-semibold tabular-nums text-ink">{cardCount}</div>
          <div className="text-xs text-ink-faint">Total</div>
        </div>
        <div className="rounded-xl border border-line px-4 py-3">
          <div className="text-2xl font-semibold tabular-nums text-ink">{dueCount}</div>
          <div className="text-xs text-ink-faint">Due</div>
        </div>
        <div className="rounded-xl border border-line px-4 py-3">
          <div className="text-2xl font-semibold tabular-nums text-ink">{masteryPct}%</div>
          <div className="text-xs text-ink-faint">Mastery</div>
        </div>
      </div>
    </section>
  );
}
