export function quotaCommand(
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
    const body = (await response.json()) as { result?: unknown; error?: unknown };
    if (body.error !== undefined) throw new Error('AI quota store rejected the operation.');
    return body.result;
  };
}
