import { lazy } from 'react';
import { useCard } from '../../state/useData';
import type { Card, SchedulerConfig } from '../../db/types';
import { PageLoading, PageLoadingBoundary } from '../ui/PageLoadingBoundary';

const CardAnalytics = lazy(() =>
  import('./CardAnalytics').then((module) => ({ default: module.CardAnalytics })),
);

function HydratedAnalytics({
  cardId,
  schedulingConfig,
  motionMultiplier,
}: {
  cardId: string;
  schedulingConfig: SchedulerConfig;
  motionMultiplier: number;
}) {
  const card = useCard(cardId);
  if (card === undefined) return <PageLoading />;
  return card ? (
    <CardAnalytics
      card={card}
      schedulingConfig={schedulingConfig}
      motionMultiplier={motionMultiplier}
    />
  ) : (
    <p className="text-sm text-ink-soft">This card is no longer available.</p>
  );
}

/** Load canonical review events only after a stored card projection is expanded. */
export function ExpandedCardAnalytics({
  card,
  schedulingConfig,
  motionMultiplier,
}: {
  card: Card;
  schedulingConfig: SchedulerConfig;
  motionMultiplier: number;
}) {
  return (
    <PageLoadingBoundary>
      {card.history.length > 0 ? (
        <CardAnalytics
          card={card}
          schedulingConfig={schedulingConfig}
          motionMultiplier={motionMultiplier}
        />
      ) : (
        <HydratedAnalytics
          cardId={card.id}
          schedulingConfig={schedulingConfig}
          motionMultiplier={motionMultiplier}
        />
      )}
    </PageLoadingBoundary>
  );
}
