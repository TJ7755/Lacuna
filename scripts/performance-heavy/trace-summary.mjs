import { readFile } from 'node:fs/promises';

// Timeline durations are inclusive. Only CPU sample weights below are aggregated;
// nested timeline events and different threads must not be added together.
const { traceEvents: events } = JSON.parse(await readFile(process.argv[2], 'utf8'));
const navigation = events.find((event) => event.name === 'navigationStart'
  && event.args?.data?.documentLoaderURL?.startsWith('app:'));
if (navigation) {
  const paint = events.find((event) => event.name === 'firstContentfulPaint'
    && event.args?.data?.navigationId === navigation.args.data.navigationId
    && event.args?.frame === navigation.args.frame);
  const commit = events.find((event) => event.name === 'CommitLoad'
    && event.pid === navigation.pid && event.ts >= navigation.ts
    && event.args?.data?.frame === navigation.args.frame);
  console.log(JSON.stringify({ navigation: navigation.args.data.documentLoaderURL,
    commitMs: commit && (commit.ts - navigation.ts) / 1000,
    firstContentfulPaintMs: paint && (paint.ts - navigation.ts) / 1000,
    commitToPaintMs: paint && commit && (paint.ts - commit.ts) / 1000 }, null, 2));
}
const profiles = new Map();
for (const event of events) {
  if (event.name !== 'ProfileChunk') continue;
  const key = `${event.pid}:${event.id}`;
  const profile = profiles.get(key) ?? { nodes: new Map(), weights: new Map() };
  profiles.set(key, profile);
  const data = event.args.data;
  for (const node of data.cpuProfile?.nodes ?? []) profile.nodes.set(node.id, node);
  for (const [index, id] of (data.cpuProfile?.samples ?? []).entries()) {
    profile.weights.set(id, (profile.weights.get(id) ?? 0) + (data.timeDeltas?.[index] ?? 0));
  }
}
const weights = new Map();
for (const profile of profiles.values()) {
  for (const [id, weight] of profile.weights) {
    const frame = profile.nodes.get(id)?.callFrame;
    if (!frame) continue;
    const location = frame.url
      ? `${frame.url}:${(frame.lineNumber ?? -1) + 1}:${(frame.columnNumber ?? -1) + 1}`
      : '[injected/native]';
    const label = `${frame.functionName || '(anonymous)'} ${location}`;
    weights.set(label, (weights.get(label) ?? 0) + weight / 1000);
  }
}
console.log(JSON.stringify({ sampledSelfTime: [...weights].sort((a, b) => b[1] - a[1]).slice(0, 30),
  longestEvents: events.filter((event) => event.ph === 'X' && event.dur >= 50_000)
    .sort((a, b) => b.dur - a.dur).slice(0, 15)
    .map((event) => ({ name: event.name, pid: event.pid, tid: event.tid,
      durationMs: event.dur / 1000, data: event.args?.data })) }, null, 2));
