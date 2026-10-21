import { quotaCommand } from '../ai/quota.js';

export const DEFAULT_JEV_MONTHLY_INPUT_TOKEN_LIMIT = 50_000_000;
export const JEV_USAGE_REFRESH_MS = 60_000;
const RECORD = `
for i = 1, 2 do redis.call('INCRBY', KEYS[i], ARGV[1]) end
for i = 3, 4 do redis.call('INCR', KEYS[i]) end
return 1
`;

export function loadJevLimit(value: string | undefined): number | null {
  if (value === undefined) return DEFAULT_JEV_MONTHLY_INPUT_TOKEN_LIMIT;
  if (!/^\d+$/.test(value)) return null;
  const limit = Number(value);
  return Number.isSafeInteger(limit) ? limit : null;
}

export function createJevUsageStore(
  url: string,
  token: string,
  fetcher: typeof fetch = fetch,
  now = Date.now,
) {
  const command = quotaCommand(url, token, fetcher);
  let cached: {
    month: string;
    total: number;
    refreshedAt: number;
    pending: Promise<void> | null;
  } | null = null;
  const current = () => {
    const month = new Date(now()).toISOString().slice(0, 7);
    if (cached?.month !== month)
      cached = { month, total: 0, refreshedAt: -Infinity, pending: null };
    return cached;
  };
  return {
    allowed(limit: number): boolean {
      return limit === 0 || current().total <= limit;
    },
    refresh(): Promise<void> | null {
      const state = current();
      if (state.pending || now() - state.refreshedAt < JEV_USAGE_REFRESH_MS) return null;
      state.refreshedAt = now();
      state.pending = command(['GET', `lacuna:jev:month:${state.month}:input-tokens`])
        .then((result) => {
          const total = result === null ? 0 : Number(result);
          if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid Jev usage.');
          // Do not discard this instance's usage when a concurrent refresh returns an older total.
          state.total = Math.max(state.total, total);
        })
        .finally(() => {
          state.pending = null;
        });
      return state.pending;
    },
    async record(inputTokens: number, at = now()): Promise<void> {
      if (!Number.isSafeInteger(inputTokens) || inputTokens < 0)
        throw new Error('Invalid Jev usage.');
      const day = new Date(at).toISOString().slice(0, 10);
      const month = day.slice(0, 7);
      const state = current();
      if (state.month === month) state.total += inputTokens;
      await command([
        'EVAL',
        RECORD,
        4,
        `lacuna:jev:month:${month}:input-tokens`,
        `lacuna:jev:day:${day}:input-tokens`,
        `lacuna:jev:month:${month}:calls`,
        `lacuna:jev:day:${day}:calls`,
        inputTokens,
      ]);
    },
  };
}

let shared: { url: string; token: string; store: ReturnType<typeof createJevUsageStore> } | null =
  null;
export function getJevUsageStore(url: string, token: string) {
  if (!shared || shared.url !== url || shared.token !== token)
    shared = { url, token, store: createJevUsageStore(url, token) };
  return shared.store;
}
