import { expect, test } from 'vitest';
import { budget, guardRequest, worstCost } from './spend';
test('floors currency budgets and fails closed', () => {
  expect(budget('0.005375999', 'jev-1.14.0', 100).requests).toBe(1);
  expect(budget('0.005376', 'jev-1.14.0', 100).requests).toBe(2);
  expect(worstCost).toBe(2688000);
  for (const cap of [undefined, '0', '-1', 'NaN', '0.002687999'])
    expect(() => budget(cap, 'jev-1.14.0', 1)).toThrow();
  expect(() => budget('1', 'jev-latest', 1)).toThrow();
});
test('fetch boundary forbids long context in every header representation', () => {
  for (const headers of [
    new Headers({ 'TypeSafe-Danger-Zone-Long-Context': 'true' }),
    { 'TYPESAFE-DANGER-ZONE-LONG-CONTEXT': 'false' },
    [['typesafe-danger-zone-long-context', 'true']] as [string, string][],
  ])
    expect(() =>
      guardRequest(
        'https://api.typesafe.ai/v1/systemone',
        { method: 'POST', headers, body: JSON.stringify({ model: 'jev-1.14.0' }) },
        'jev-1.14.0',
      ),
    ).toThrow();
});
