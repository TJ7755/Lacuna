import { InfoPopover } from './InfoPopover';
import { MAINTENANCE_HORIZON_DAYS } from '../../fsrs/horizon';

/** Shared definitions for the distinct evidence shown by lessons, practice and Progress. */
export function ProgressMeasureDefinitions() {
  return (
    <dl className="space-y-2">
      <div>
        <dt className="font-semibold text-ink">Learnt</dt>
        <dd>Reviewed at least once and no longer new. Recall can still fall before a test.</dd>
      </div>
      <div>
        <dt className="font-semibold text-ink">Secure</dt>
        <dd>
          The 90% predicted-recall threshold, measured at the next applicable test or{' '}
          {MAINTENANCE_HORIZON_DAYS} days ahead without a date. % secured counts cards meeting it.
        </dd>
      </div>
      <div>
        <dt className="font-semibold text-ink">Predicted recall</dt>
        <dd>
          A memory estimate if you stopped reviewing now, not an exam grade. Unreviewed cards count
          as zero.
        </dd>
      </div>
      <div>
        <dt className="font-semibold text-ink">Marks</dt>
        <dd>Marks awarded for answered exam questions, separate from card recall.</dd>
      </div>
    </dl>
  );
}

export function ProgressMeasuresInfo({ side }: { side?: 'top' | 'bottom' }) {
  return (
    <InfoPopover label="About progress" side={side}>
      <ProgressMeasureDefinitions />
    </InfoPopover>
  );
}
