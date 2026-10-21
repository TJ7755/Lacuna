import { quotaCommand } from '../ai/quota.js';

export const DEFAULT_JEV_MONTHLY_INPUT_TOKEN_LIMIT = 50_000_000;
// The pinned model's documented per-request context is 64k. No long-context header is sent.
// Reserve the whole context, then settle to usage.input_tokens, to avoid concurrent overspend.
export const JEV_INPUT_TOKEN_RESERVATION = 65_536;
const RESERVE = `
local used = tonumber(redis.call('GET', KEYS[1]) or '0')
local pending = tonumber(redis.call('GET', KEYS[2]) or '0')
if tonumber(ARGV[1]) > 0 and used + pending + tonumber(ARGV[2]) > tonumber(ARGV[1]) then return 0 end
redis.call('INCRBY', KEYS[2], ARGV[2])
for i = 3, 4 do redis.call('INCR', KEYS[i]) end
return 1
`;
const SETTLE = `
redis.call('DECRBY', KEYS[2], ARGV[1])
redis.call('INCRBY', KEYS[1], ARGV[2])
redis.call('INCRBY', KEYS[3], ARGV[2])
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
  return {
    async reserve(limit: number): Promise<null | ((inputTokens: number) => Promise<void>)> {
      const day = new Date(now()).toISOString().slice(0, 10);
      const month = day.slice(0, 7);
      const monthTokens = `lacuna:jev:month:${month}:input-tokens`;
      const pending = `lacuna:jev:month:${month}:reserved-input-tokens`;
      const granted = await command([
        'EVAL',
        RESERVE,
        4,
        monthTokens,
        pending,
        `lacuna:jev:day:${day}:calls`,
        `lacuna:jev:month:${month}:calls`,
        limit,
        JEV_INPUT_TOKEN_RESERVATION,
      ]);
      if (granted !== 1) return null;
      let settled = false;
      return async (inputTokens) => {
        if (settled) return;
        if (
          !Number.isSafeInteger(inputTokens) ||
          inputTokens < 0 ||
          inputTokens > JEV_INPUT_TOKEN_RESERVATION
        )
          throw new Error('Invalid Jev usage.');
        await command([
          'EVAL',
          SETTLE,
          3,
          monthTokens,
          pending,
          `lacuna:jev:day:${day}:input-tokens`,
          JEV_INPUT_TOKEN_RESERVATION,
          inputTokens,
        ]);
        settled = true;
      };
    },
  };
}
