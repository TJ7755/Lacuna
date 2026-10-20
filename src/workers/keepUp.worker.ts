import {
  dashboardKeepUpProjections,
  type KeepUpRequest,
  type KeepUpResponse,
} from '../state/dashboardKeepUp';

const ctx = globalThis as unknown as {
  postMessage(message: KeepUpResponse): void;
  onmessage: ((event: MessageEvent<KeepUpRequest>) => void) | null;
};

// The worker stays alive between requests so the per-course cache survives.
ctx.onmessage = (event) => {
  const { id, entries, history, now } = event.data;
  ctx.postMessage({ id, projections: dashboardKeepUpProjections(entries, history, now) });
};
