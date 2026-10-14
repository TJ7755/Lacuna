import { createHash, randomUUID } from 'node:crypto';

const RESERVE_SCRIPT = `
redis.call('ZREMRANGEBYSCORE', KEYS[5], '-inf', ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[6], '-inf', ARGV[2])
local values = {}
for i = 1, 4 do values[i] = tonumber(redis.call('GET', KEYS[i]) or '0') end
if values[1] >= tonumber(ARGV[3]) or values[2] >= tonumber(ARGV[4]) or
   values[3] >= tonumber(ARGV[5]) or values[4] >= tonumber(ARGV[6]) or
   redis.call('ZCARD', KEYS[5]) >= tonumber(ARGV[7]) or
   redis.call('ZCARD', KEYS[6]) >= tonumber(ARGV[8]) then return 0 end
for i = 1, 4 do
  redis.call('INCR', KEYS[i])
  local ttl = {172800, 3024000, 172800, 120}
  redis.call('EXPIRE', KEYS[i], ttl[i])
end
redis.call('ZADD', KEYS[5], ARGV[9], ARGV[1])
redis.call('ZADD', KEYS[6], ARGV[9], ARGV[1])
redis.call('EXPIRE', KEYS[5], 60)
redis.call('EXPIRE', KEYS[6], 60)
return 1
`;

const RELEASE_SCRIPT = `
redis.call('ZREM', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
return 1
`;

const ATTEMPT_SCRIPT = `
local minute = redis.call('INCR', KEYS[1])
if minute == 1 then redis.call('EXPIRE', KEYS[1], 120) end
local day = redis.call('INCR', KEYS[2])
if day == 1 then redis.call('EXPIRE', KEYS[2], 172800) end
if minute > tonumber(ARGV[1]) or day > tonumber(ARGV[2]) then return 0 end
return 1
`;

export interface AiQuotaLimits {
  userDaily: number;
  userMonthly: number;
  globalDaily: number;
  userMinute: number;
  userConcurrent: number;
  globalConcurrent: number;
}

export const DEFAULT_AI_QUOTA_LIMITS: AiQuotaLimits = {
  userDaily: 50,
  userMonthly: 600,
  globalDaily: 1_000,
  userMinute: 6,
  userConcurrent: 2,
  globalConcurrent: 12,
};

function quotaCommand(
  url: string,
  token: string,
  fetcher: typeof fetch,
): (parts: readonly (string | number)[]) => Promise<unknown> {
  if (!/^https:\/\//.test(url) || !token) throw new Error('A secure quota store is required.');
  return async (parts) => {
    const response = await fetcher(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(parts),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error('AI quota store is unavailable.');
    const body = await response.json() as { result?: unknown; error?: unknown };
    if (body.error !== undefined) throw new Error('AI quota store rejected the operation.');
    return body.result;
  };
}

/** Access-code exchanges allowed per client address; real clients exchange about once an hour. */
export const SESSION_EXCHANGE_LIMITS = { perMinute: 10, perDay: 100 };

export interface SessionExchangeLimiter {
  allow(clientAddress: string): Promise<boolean>;
}

export function createSessionExchangeLimiter(
  url: string,
  token: string,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): SessionExchangeLimiter {
  const command = quotaCommand(url, token, fetcher);
  return {
    async allow(clientAddress) {
      const timestamp = now();
      const day = new Date(timestamp).toISOString().slice(0, 10);
      const minute = Math.floor(timestamp / 60_000);
      // Hash the address so the store never holds learners' IP addresses.
      const address = createHash('sha256').update(`lacuna-ai-session-ip-v1\0${clientAddress}`).digest('hex');
      const granted = await command([
        'EVAL', ATTEMPT_SCRIPT, 2,
        `lacuna:ai:session:minute:${address}:${minute}`,
        `lacuna:ai:session:day:${address}:${day}`,
        SESSION_EXCHANGE_LIMITS.perMinute, SESSION_EXCHANGE_LIMITS.perDay,
      ]);
      return granted === 1;
    },
  };
}

export interface AiQuotaStore {
  reserve(credentialId: string): Promise<(() => Promise<void>) | null>;
}

export function createAiQuotaStore(
  url: string,
  token: string,
  limits: AiQuotaLimits = DEFAULT_AI_QUOTA_LIMITS,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): AiQuotaStore {
  const command = quotaCommand(url, token, fetcher);

  return {
    async reserve(credentialId) {
      const timestamp = now();
      const date = new Date(timestamp);
      const day = date.toISOString().slice(0, 10);
      const month = day.slice(0, 7);
      const minute = Math.floor(timestamp / 60_000);
      const identifier = randomUUID();
      const userActive = `lacuna:ai:active:user:${credentialId}`;
      const globalActive = 'lacuna:ai:active:global';
      const granted = await command([
        'EVAL', RESERVE_SCRIPT, 6,
        `lacuna:ai:day:user:${credentialId}:${day}`,
        `lacuna:ai:month:user:${credentialId}:${month}`,
        `lacuna:ai:day:global:${day}`,
        `lacuna:ai:minute:user:${credentialId}:${minute}`,
        userActive, globalActive,
        identifier, timestamp, limits.userDaily, limits.userMonthly,
        limits.globalDaily, limits.userMinute, limits.userConcurrent,
        limits.globalConcurrent, timestamp + 60_000,
      ]);
      if (granted !== 1) return null;
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        await command(['EVAL', RELEASE_SCRIPT, 2, userActive, globalActive, identifier]);
      };
    },
  };
}
