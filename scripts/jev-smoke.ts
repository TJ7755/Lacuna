// Run manually with TYPESAFE_API_KEY in the environment. Makes two paid requests.
import { callJevDecision } from '../server/jev/provider';
const key = process.env.TYPESAFE_API_KEY;
if (!key) throw new Error('TYPESAFE_API_KEY is required.');
for (const request of [
  {
    purpose: 'typed-equivalence',
    prompt: 'What crosses the membrane in osmosis?',
    expected: 'Water',
    answer: 'Water molecules',
  },
  {
    purpose: 'mark-allocation',
    prompt: 'Describe osmosis.',
    criterion:
      'Water moves through a partially permeable membrane down its water potential gradient.',
    explanation: 'One mark for water, one for the membrane and direction.',
    maxMarks: 2,
    answer: 'Water moves through a partially permeable membrane from high to low water potential.',
  },
] as const) {
  const result = await callJevDecision(request, key, AbortSignal.timeout(30_000));
  console.log(JSON.stringify(result, null, 2));
}
