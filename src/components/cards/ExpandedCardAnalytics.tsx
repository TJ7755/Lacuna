import { lazy, Suspense } from 'react';
import { useCard } from '../../state/useData';
import type { Card, SchedulerConfig } from '../../db/types';

const CardAnalytics = lazy(() =>
  import('./CardAnalytics').then((module) => ({ default: module.CardAnalytics })),
);

function Analytics({
  card,
  schedulingConfig,
  motionMultiplier,
}: {
  card: Card;
  schedulingConfig: SchedulerConfig;
  motionMultiplier: number;
}) {
  return (
    <Suspense fallback={<div className="h-32 animate-pulse rounded-xl bg-ink/[0.03]" />}>
      <CardAnalytics
        card={card}
        schedulingConfig={schedulingConfig}
        motionMultiplier={motionMultiplier}
      />
    </Suspense>
  );
}

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
  return card ? (
    <Analytics
      card={card}
      schedulingConfig={schedulingConfig}
      motionMultiplier={motionMultiplier}
    />
  ) : (
    <div className="h-32 animate-pulse rounded-xl bg-ink/[0.03]" />
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
  return card.history.length > 0 ? (
    <Analytics
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
  );
}
