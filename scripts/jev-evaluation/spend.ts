// Reviewed 2026-11-01: https://docs.typesafe.ai/models (models.md unavailable via web).
export const pricing = { 'jev-1.14.0': 42, 'jev-1.13.0': 42 } as const;
// Nanodollars: $42 per billion input tokens; output is free. The provider enforces
// 64,000 tokens without long context. Bytes are not an exact token count.
export const worstCost = 64000 * 42;
export function budget(cap: string | undefined, model: string, maximum: number) {
  if (!Object.hasOwn(pricing, model)) throw new Error('Unreviewed model pricing.');
  if (!cap || !/^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(cap)) throw new Error('Invalid USD cap.');
  const [whole, fraction = ''] = cap.split('.');
  const nanoUsd = Number(BigInt(whole) * 1000000000n + BigInt(fraction.padEnd(9, '0')));
  if (!Number.isSafeInteger(nanoUsd)) throw new Error('Invalid USD cap.');
  const requests = Math.min(maximum, Math.floor(nanoUsd / worstCost));
  if (requests < 1) throw new Error('Cap cannot fund one worst-case request.');
  return { capNanoUsd: nanoUsd, currency: 'USD', requests, worstRequestNanoUsd: worstCost };
}
export function guardRequest(
  url: Parameters<typeof fetch>[0],
  options: RequestInit | undefined,
  model: string,
) {
  if (String(url) !== 'https://api.typesafe.ai/v1/systemone' || options?.method !== 'POST')
    throw new Error('Unexpected paid endpoint.');
  if (new Headers(options.headers).has('typesafe-danger-zone-long-context'))
    throw new Error('Long context is forbidden.');
  if (
    !Object.hasOwn(pricing, model) ||
    typeof options.body !== 'string' ||
    JSON.parse(options.body).model !== model
  )
    throw new Error('Unreviewed request model.');
}
