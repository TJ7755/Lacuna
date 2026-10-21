// Run manually: TYPESAFE_API_KEY=... bun scripts/jev-smoke.ts
import { callJevChoice } from '../server/jev/provider';

const key = process.env.TYPESAFE_API_KEY;
if (!key) throw new Error('TYPESAFE_API_KEY is required.');
const result = await callJevChoice({
  state: 'Water moves across a partially permeable membrane down its water potential gradient.',
  instructions: 'Which process does this describe?',
  options: { osmosis: 'Osmosis', respiration: 'Respiration', none: 'None of these' },
}, key, AbortSignal.timeout(30_000));
// eslint-disable-next-line no-console
console.log(JSON.stringify(result, null, 2));
