import { useEffect, useSyncExternalStore } from 'react';
import { usagePageForRoute } from '@lacuna/protocol/usage';
import { router } from '../routes/router';
import { AnalyticsConsent } from './AnalyticsConsent';
import { installUsageCollector } from './collector';
import { usageAnalyticsAvailable } from './preference';

function currentLearnerPage(): boolean {
  const leaf = router.state.matches.at(-1)?.route;
  return Boolean(usagePageForRoute(leaf?.path, leaf?.index));
}

function AnalyticsRuntime() {
  const learnerPage = useSyncExternalStore(router.subscribe, currentLearnerPage);
  useEffect(() => installUsageCollector(router), []);
  return learnerPage ? <AnalyticsConsent /> : null;
}

export function HostedUsageAnalytics() {
  return usageAnalyticsAvailable() ? <AnalyticsRuntime /> : null;
}
