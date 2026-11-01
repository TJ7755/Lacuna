import { randomUUID } from 'node:crypto';
import { quotaCommand } from '../ai/quota.js';

const DEFAULT_JEV_MONTHLY_INPUT_TOKEN_LIMIT = 50_000_000;
export const DEFAULT_JEV_MONTHLY_REQUEST_LIMIT = 100_000;
const JEV_INSTALLATION_LIMITS = { daily: 100, minute: 20, concurrent: 2 };
const JEV_MAINTAINER_LIMITS = { daily: 1000, minute: 60, concurrent: 4 };
const JEV_GLOBAL_CONCURRENT_LIMIT = 20;
// Jev 1.14 has a documented 64k-token total request context without long-context mode.
const JEV_REQUEST_INPUT_TOKEN_RESERVATION = 65_536;
const LEASE_MS = 60_000;
const RESERVE = `
local now = tonumber(ARGV[1])
for i = 3, 4 do redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now) end
if tonumber(redis.call('GET', KEYS[5]) or '0') + tonumber(redis.call('GET', KEYS[9]) or '0') + tonumber(ARGV[10]) > tonumber(ARGV[6]) then return {-4, 0} end
if tonumber(redis.call('GET', KEYS[6]) or '0') >= tonumber(ARGV[7]) then return {-5, 0} end
if tonumber(redis.call('GET', KEYS[1]) or '0') >= tonumber(ARGV[3]) then return {-1, 0} end
if tonumber(redis.call('GET', KEYS[2]) or '0') >= tonumber(ARGV[4]) then return {-2, 0} end
for i = 3, 4 do
  local limit = i == 3 and tonumber(ARGV[5]) or tonumber(ARGV[8])
  if redis.call('ZCARD', KEYS[i]) >= limit then
    local first = redis.call('ZRANGE', KEYS[i], 0, 0, 'WITHSCORES')
    return {i == 3 and -3 or -6, math.max(1, tonumber(first[2]) - now)}
  end
end
redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], 172800)
redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[2], 120)
for i = 6, 7 do redis.call('INCR', KEYS[i]) end
for i = 3, 4 do
  redis.call('ZADD', KEYS[i], ARGV[9], ARGV[2])
  redis.call('EXPIRE', KEYS[i], 120)
end
redis.call('SET', KEYS[8], '1', 'EX', 172800)
redis.call('INCRBY', KEYS[9], ARGV[10])
return {1, 0}
`;
const SETTLE = `
if redis.call('DEL', KEYS[1]) == 0 then return 0 end
for i = 2, 3 do redis.call('ZREM', KEYS[i], ARGV[1]) end
local actual = tonumber(ARGV[2])
if actual >= 0 then
  for i = 4, 5 do redis.call('INCRBY', KEYS[i], actual) end
  if actual <= tonumber(ARGV[3]) then
    redis.call('DECRBY', KEYS[6], ARGV[3])
  else
    redis.call('INCRBY', KEYS[6], ARGV[4])
    return -1
  end
end
return 1
`;

export type JevQuotaReason =
  | 'installation-day'
  | 'installation-minute'
  | 'installation-concurrent'
  | 'monthly-tokens'
  | 'monthly-requests'
  | 'global-concurrent';
export interface JevQuotaOptions {
  monthlyTokens: number;
  monthlyRequests: number;
  maintainer: boolean;
}

export function loadJevLimit(
  value: string | undefined,
  fallback = DEFAULT_JEV_MONTHLY_INPUT_TOKEN_LIMIT,
): number | null {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit > 0 ? limit : null;
}

export function createJevUsageStore(
  url: string,
  token: string,
  fetcher: typeof fetch = fetch,
  now = Date.now,
) {
  const command = quotaCommand(url, token, fetcher);
  return {
    async reserve(
      id: string,
      options: JevQuotaOptions,
    ): Promise<
      | { allowed: false; reason: JevQuotaReason; retryAt: number }
      | { allowed: true; settle: (inputTokens: number | null) => Promise<void> }
    > {
      const timestamp = now();
      const date = new Date(timestamp);
      const day = date.toISOString().slice(0, 10);
      const month = day.slice(0, 7);
      const minute = Math.floor(timestamp / 60_000);
      const lease = randomUUID();
      const installationActive = `lacuna:jev:active:installation:${id}`;
      const globalActive = 'lacuna:jev:active:global';
      const receipt = `lacuna:jev:reservation:${lease}`;
      const monthTokens = `lacuna:jev:month:${month}:input-tokens`;
      const dayTokens = `lacuna:jev:day:${day}:input-tokens`;
      const reservedTokens = `lacuna:jev:month:${month}:reserved-input-tokens`;
      const limits = options.maintainer ? JEV_MAINTAINER_LIMITS : JEV_INSTALLATION_LIMITS;
      const result = await command([
        'EVAL',
        RESERVE,
        9,
        `lacuna:jev:installation:${id}:day:${day}`,
        `lacuna:jev:installation:${id}:minute:${minute}`,
        installationActive,
        globalActive,
        monthTokens,
        `lacuna:jev:month:${month}:calls`,
        `lacuna:jev:day:${day}:calls`,
        receipt,
        reservedTokens,
        timestamp,
        lease,
        limits.daily,
        limits.minute,
        limits.concurrent,
        options.monthlyTokens,
        options.monthlyRequests,
        JEV_GLOBAL_CONCURRENT_LIMIT,
        timestamp + LEASE_MS,
        JEV_REQUEST_INPUT_TOKEN_RESERVATION,
      ]);
      if (
        !Array.isArray(result) ||
        result.length !== 2 ||
        !Number.isInteger(result[0]) ||
        !Number.isSafeInteger(result[1]) ||
        result[1] < 0
      )
        throw new Error('Invalid Jev quota response.');
      const [code, delay] = result as [number, number];
      if (code !== 1) {
        const reasons: Record<number, JevQuotaReason> = {
          [-1]: 'installation-day',
          [-2]: 'installation-minute',
          [-3]: 'installation-concurrent',
          [-4]: 'monthly-tokens',
          [-5]: 'monthly-requests',
          [-6]: 'global-concurrent',
        };
        const reason = reasons[code];
        if (!reason) throw new Error('Invalid Jev quota response.');
        const retryAt =
          code === -1
            ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
            : code === -2
              ? (minute + 1) * 60_000
              : code === -4 || code === -5
                ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
                : timestamp + Math.min(delay, LEASE_MS);
        return { allowed: false, reason, retryAt };
      }
      return {
        allowed: true,
        async settle(inputTokens) {
          if (inputTokens !== null && (!Number.isSafeInteger(inputTokens) || inputTokens < 0))
            throw new Error('Invalid Jev usage.');
          const result = await command([
            'EVAL',
            SETTLE,
            6,
            receipt,
            installationActive,
            globalActive,
            monthTokens,
            dayTokens,
            reservedTokens,
            lease,
            inputTokens ?? -1,
            JEV_REQUEST_INPUT_TOKEN_RESERVATION,
            options.monthlyTokens,
          ]);
          if (result === -1) throw new Error('Jev provider usage exceeded its context bound.');
          if (result !== 0 && result !== 1) throw new Error('Invalid Jev settlement response.');
        },
      };
    },
  };
}

export const getJevUsageStore = createJevUsageStore;
