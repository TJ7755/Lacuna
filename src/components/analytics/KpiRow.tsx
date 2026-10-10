import { CountUp } from '../ui/Celebration';

export interface Kpi {
  label: string;
  /** Null shows a dash, for a figure that does not exist yet. */
  value: number | null;
  unit?: string;
}

/** The headline row: a few big figures in the display face, each with a short label. */
export function KpiRow({
  items,
  multiplier,
  label,
}: {
  items: Kpi[];
  multiplier: number;
  label: string;
}) {
  return (
    <section
      aria-label={label}
      className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4"
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-col gap-1.5 rounded-3xl bg-surface px-5 py-5 shadow-card md:px-6"
        >
          <span className="text-sm text-ink-soft">{item.label}</span>
          <span className="font-display text-[34px] font-semibold leading-none tracking-tight text-ink tabular-nums md:text-[38px]">
            {item.value === null ? (
              '–'
            ) : (
              <>
                <CountUp value={item.value} multiplier={multiplier} />
                {item.unit && (
                  <span className="ml-1 text-lg font-semibold text-ink-soft">{item.unit}</span>
                )}
              </>
            )}
          </span>
        </div>
      ))}
    </section>
  );
}
