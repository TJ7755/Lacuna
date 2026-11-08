import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { usagePageForRoute } from '@lacuna/protocol/usage';
import { router } from '../routes/router';
import { AnalyticsConsent } from './AnalyticsConsent';
import { installUsageCollector } from './collector';

function currentLearnerPage(): boolean {
  const leaf = router.state.matches.at(-1)?.route;
  return Boolean(usagePageForRoute(leaf?.path, leaf?.index));
}

export function HostedUsageAnalytics({ children }: { children: ReactNode }) {
  const learnerPage = useSyncExternalStore(router.subscribe, currentLearnerPage);
  useEffect(() => installUsageCollector(router), []);
  return (
    <>
      {learnerPage && <AnalyticsConsent />}
      {children}
    </>
  );
}
