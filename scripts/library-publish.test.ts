import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createHandler } from '../apps/relay/src/relay';
import { MemoryStore } from '../apps/relay/src/store';
import { getShareBytes, mintShare, parseShareManifest } from '../apps/web/src/shareLinks/client';
import { runPublication } from './library-publish';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true })));
});

function artefact(revision = 1) {
  return `${JSON.stringify(
    {
      format: 'lacuna-course',
      version: 1,
      assets: [],
      payload: {
        v: 2,
        at: 1000,
        li: 'synthetic-lineage',
        rv: revision,
        course: { n: 'Synthetic course', o: 0, c: 1, sm: 1, um: 'open' },
        lessons: [
          {
            i: 'lesson-1',
            n: 'Lesson',
            o: 0,
            c: 1,
            notes: [{ oi: 'note-1', n: 'Note', c: 'Text' }],
            cards: [{ id: 'card-1', k: 0, f: `Front ${revision}`, b: 'Back' }],
          },
        ],
      },
    },
    null,
    2,
  )}\n`;
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'lacuna-publication-'));
  directories.push(directory);
  const input = join(directory, 'approved.lacuna');
  const credentials = join(directory, 'owner.json');
  const text = artefact();
  await writeFile(input, text);
  const handle = createHandler(new MemoryStore());
  const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
    const request = new Request(url, init);
    if (init?.body instanceof Blob) request.headers.set('Content-Length', String(init.body.size));
    return handle(request);
  }) as typeof fetch;
  const relayUrl = 'http://localhost:4999';
  const owner = await mintShare(relayUrl, fetchImpl);
  await writeFile(credentials, JSON.stringify({ relayUrl, writeToken: owner.writeToken }));
  const args = [
    '--artefact',
    input,
    '--course-id',
    'synthetic',
    '--share',
    `https://getlacuna.app/#/s/${owner.shareId}`,
    '--credentials',
    credentials,
  ];
  const hash = createHash('sha256').update(text).digest('hex');
  return { input, text, args, hash, fetchImpl, relayUrl, ...owner };
}

it('publishes the approved frozen bytes and derives a credential-free record from the verified upload', async () => {
  const f = await fixture();
  const result = await runPublication([...f.args, '--approved-sha256', f.hash], {}, f.fetchImpl);
  expect(result).toMatchObject({
    status: 'published',
    courseId: 'synthetic',
    revision: 1,
    sha256: f.hash,
    review: 'operator-approved',
    counts: { cards: 1, notes: 1, lessons: 1 },
  });
  expect(JSON.stringify(result)).not.toContain(f.writeToken);
  const payload = await getShareBytes({ ...f, slot: 'payload' });
  expect(Buffer.from(payload!.bytes).toString()).toBe(f.text);
  const meta = await getShareBytes({ ...f, slot: 'meta' });
  expect(parseShareManifest(meta!.bytes)).toMatchObject({
    lineageId: 'synthetic-lineage',
    revision: 1,
    byteSize: Buffer.byteLength(f.text),
    publishedAt: 1000,
  });
  expect(await readFile(f.input, 'utf8')).toBe(f.text);
});

it('dry-runs without writes, skips unchanged bytes and publishes a reviewed higher revision', async () => {
  const f = await fixture();
  const writes: string[] = [];
  const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'PUT') writes.push(String(url));
    return f.fetchImpl(url, init);
  }) as typeof fetch;
  const dry = await runPublication([...f.args, '--dry-run'], {}, fetchImpl);
  expect(dry).toMatchObject({
    status: 'dry-run',
    review: 'unreviewed',
    currentSha256: null,
    changes: { payload: true, manifest: true },
  });
  expect(writes).toEqual([]);
  await runPublication([...f.args, '--approved-sha256', f.hash], {}, fetchImpl);
  expect(writes.map((url) => url.split('/').pop())).toEqual(['payload', 'meta']);
  writes.length = 0;
  expect(
    await runPublication([...f.args, '--approved-sha256', f.hash], {}, fetchImpl),
  ).toMatchObject({ status: 'skipped' });
  expect(writes).toEqual([]);
  const next = artefact(2);
  await writeFile(f.input, next);
  await expect(
    runPublication([...f.args, '--approved-sha256', f.hash], {}, fetchImpl),
  ).rejects.toThrow(/matching the exact frozen bytes/);
  const approved = createHash('sha256').update(next).digest('hex');
  expect(await runPublication([...f.args, '--dry-run'], {}, fetchImpl)).toMatchObject({
    currentSha256: f.hash,
    changes: { payload: true, manifest: true },
  });
  expect(writes).toEqual([]);
  expect(
    await runPublication([...f.args, '--approved-sha256', approved], {}, fetchImpl),
  ).toMatchObject({ status: 'published', revision: 2, sha256: approved });
  expect(Buffer.from((await getShareBytes({ ...f, slot: 'payload' }))!.bytes).toString()).toBe(
    next,
  );
});

it.each(['payload', 'meta'] as const)(
  'recovers a rejected %s write without repeating an accepted payload',
  async (slot) => {
    const f = await fixture();
    const writes: string[] = [];
    let fail = true;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        writes.push(String(url).split('/').pop()!);
        if (fail && String(url).endsWith(`/${slot}`)) {
          fail = false;
          return new Response(JSON.stringify({ error: f.writeToken }), { status: 503 });
        }
      }
      return f.fetchImpl(url, init);
    }) as typeof fetch;
    const args = [...f.args, '--approved-sha256', f.hash];
    const failure = await runPublication(args, {}, fetchImpl).catch((error: Error) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toContain(f.writeToken);
    expect(String(failure)).toMatch(
      slot === 'meta'
        ? /manifest upload.*manifest outcome may be unknown/
        : /payload upload \(outcome may be unknown\)/,
    );
    writes.length = 0;
    expect(await runPublication(args, {}, fetchImpl)).toMatchObject({ status: 'published' });
    expect(writes).toEqual(slot === 'meta' ? ['meta'] : ['payload', 'meta']);
    expect(await runPublication(args, {}, fetchImpl)).toMatchObject({ status: 'skipped' });
  },
);

it.each(['payload', 'meta'] as const)(
  'recovers an accepted %s whose response was lost',
  async (slot) => {
    const f = await fixture();
    let lost = false;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const response = await f.fetchImpl(url, init);
      if (!lost && init?.method === 'PUT' && String(url).endsWith(`/${slot}`)) {
        lost = true;
        throw new Error(f.writeToken);
      }
      return response;
    }) as typeof fetch;
    const args = [...f.args, '--approved-sha256', f.hash];
    await expect(runPublication(args, {}, fetchImpl)).rejects.toThrow(/outcome may be unknown/);
    expect(await runPublication(args, {}, fetchImpl)).toMatchObject({
      status: slot === 'meta' ? 'skipped' : 'published',
    });
  },
);

it.each(['payload', 'meta'] as const)(
  'reports concurrent %s conflicts without retrying a stale conditional write',
  async (slot) => {
    const f = await fixture();
    let attempts = 0;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'PUT' && String(url).endsWith(`/${slot}`)) {
        attempts++;
        return new Response(null, { status: 412 });
      }
      return f.fetchImpl(url, init);
    }) as typeof fetch;
    await expect(
      runPublication([...f.args, '--approved-sha256', f.hash], {}, fetchImpl),
    ).rejects.toThrow(/Concurrent publication conflict.*no automatic overwrite/);
    expect(attempts).toBe(1);
    expect(await getShareBytes({ ...f, slot: 'meta' })).toBeNull();
    expect((await getShareBytes({ ...f, slot: 'payload' })) !== null).toBe(slot === 'meta');
  },
);

it.each([false, true])(
  'rejects changed verification bytes after the manifest write (compressed: %s)',
  async (compressed) => {
    const f = await fixture();
    if (compressed) {
      f.text += ' '.repeat(4_300_000);
      f.hash = createHash('sha256').update(f.text).digest('hex');
      await writeFile(f.input, f.text);
    }
    let published = false;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const response = await f.fetchImpl(url, init);
      if (init?.method === 'PUT' && String(url).endsWith('/meta')) published = true;
      if (published && init?.method === 'GET' && String(url).endsWith('/payload')) {
        return new Response('corrupt', { headers: { ETag: '"changed"' } });
      }
      return response;
    }) as typeof fetch;
    await expect(
      runPublication([...f.args, '--approved-sha256', f.hash], {}, fetchImpl),
    ).rejects.toThrow(/verification.*not verified/);
    expect(
      await runPublication([...f.args, '--approved-sha256', f.hash], {}, f.fetchImpl),
    ).toMatchObject({ status: 'skipped' });
  },
);

it('refuses changed bytes at the same revision, lineage forks and rollback', async () => {
  const f = await fixture();
  await runPublication([...f.args, '--approved-sha256', f.hash], {}, f.fetchImpl);
  for (const text of [
    artefact().replace('Front 1', 'Changed'),
    artefact(2).replace('synthetic-lineage', 'other-lineage'),
  ]) {
    await writeFile(f.input, text);
    const approved = createHash('sha256').update(text).digest('hex');
    await expect(
      runPublication([...f.args, '--approved-sha256', approved], {}, f.fetchImpl),
    ).rejects.toThrow(/Revision conflict|Lineage mismatch/);
    expect(Buffer.from((await getShareBytes({ ...f, slot: 'payload' }))!.bytes).toString()).toBe(
      f.text,
    );
  }
  const next = artefact(2);
  await writeFile(f.input, next);
  await runPublication(
    [...f.args, '--approved-sha256', createHash('sha256').update(next).digest('hex')],
    {},
    f.fetchImpl,
  );
  await writeFile(f.input, f.text);
  await expect(
    runPublication([...f.args, '--approved-sha256', f.hash], {}, f.fetchImpl),
  ).rejects.toThrow(/Revision conflict/);
});

it('preserves a competing payload when its generation wins the race', async () => {
  const f = await fixture();
  const competitor = artefact(2);
  let raced = false;
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    if (!raced && init?.method === 'PUT' && String(url).endsWith('/payload')) {
      raced = true;
      await f.fetchImpl(url, { ...init, body: new Blob([competitor]) });
    }
    return f.fetchImpl(url, init);
  }) as typeof fetch;
  await expect(
    runPublication([...f.args, '--approved-sha256', f.hash], {}, fetchImpl),
  ).rejects.toThrow(/HTTP 412/);
  expect(Buffer.from((await getShareBytes({ ...f, slot: 'payload' }))!.bytes).toString()).toBe(
    competitor,
  );
  expect(await getShareBytes({ ...f, slot: 'meta' })).toBeNull();
  await expect(
    runPublication([...f.args, '--approved-sha256', f.hash], {}, f.fetchImpl),
  ).rejects.toThrow(/Revision conflict/);
});

it('repairs only the manifest after an interrupted higher revision', async () => {
  const f = await fixture();
  await runPublication([...f.args, '--approved-sha256', f.hash], {}, f.fetchImpl);
  const next = artefact(2);
  await writeFile(f.input, next);
  const args = [...f.args, '--approved-sha256', createHash('sha256').update(next).digest('hex')];
  const fetchImpl = ((url: string | URL | Request, init?: RequestInit) =>
    init?.method === 'PUT' && String(url).endsWith('/meta')
      ? Promise.resolve(new Response(null, { status: 503 }))
      : f.fetchImpl(url, init)) as typeof fetch;
  await expect(runPublication(args, {}, fetchImpl)).rejects.toThrow(/manifest upload/);
  expect(await runPublication([...f.args, '--dry-run'], {}, f.fetchImpl)).toMatchObject({
    changes: { payload: false, manifest: true },
  });
  const before = await getShareBytes({ ...f, slot: 'payload' });
  expect(await runPublication(args, {}, f.fetchImpl)).toMatchObject({
    status: 'published',
    revision: 2,
  });
  expect((await getShareBytes({ ...f, slot: 'payload' }))!.generation).toBe(before!.generation);
});

it('rejects invalid artefacts and credentials without writing or disclosing secrets', async () => {
  const f = await fixture();
  const writes: string[] = [];
  const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'PUT') writes.push(String(url));
    return f.fetchImpl(url, init);
  }) as typeof fetch;
  for (const text of [
    '{}',
    f.text.replace('synthetic-lineage', ''),
    f.text.replace(
      '"assets": []',
      '"assets": [{"hash":"' +
        'a'.repeat(64) +
        '","data":"YmFk","mimeType":"image/png","createdAt":1}]',
    ),
  ]) {
    await writeFile(f.input, text);
    await expect(runPublication([...f.args, '--dry-run'], {}, fetchImpl)).rejects.toThrow(
      /Invalid frozen/,
    );
  }
  await writeFile(f.input, f.text);
  await expect(runPublication(f.args, {}, fetchImpl)).rejects.toThrow(/requires --approved-sha256/);
  const linkedRepository = join(dirname(f.input), 'linked-repository');
  await symlink(resolve('.'), linkedRepository, 'junction');
  await expect(
    runPublication(
      [...f.args.slice(0, -1), join(linkedRepository, 'package.json'), '--dry-run'],
      {},
      fetchImpl,
    ),
  ).rejects.toThrow(/outside the repository/);
  await expect(
    runPublication(
      [...f.args, '--approved-sha256', f.hash, '--credentials', 'package.json'],
      {},
      fetchImpl,
    ),
  ).rejects.toThrow(/Usage/);
  const withoutFile = f.args.slice(0, -2);
  await expect(
    runPublication([...withoutFile, '--credentials', 'package.json', '--dry-run'], {}, fetchImpl),
  ).rejects.toThrow(/outside the repository/);
  const denied = (
    await runPublication(
      [...withoutFile, '--dry-run'],
      { LACUNA_RELAY_URL: f.relayUrl, LACUNA_WRITE_TOKEN: 'f'.repeat(64) },
      fetchImpl,
    ).catch((error: Error) => error)
  ).toString();
  expect(denied).toContain('HTTP 401');
  expect(denied).not.toContain('f'.repeat(64));
  expect(writes).toEqual([]);
});

it('derives practice counts from validated Question sets without inventing legacy statistics', async () => {
  const f = await fixture();
  const file = JSON.parse(f.text);
  file.payload.v = 4;
  file.payload.concepts = [];
  file.payload.questions = [];
  file.payload.questionSets = [
    {
      id: 'set-1',
      courseId: 'synthetic',
      title: 'Practice',
      lessonIds: [],
      assessmentIds: [],
      contentVersion: 1,
      contentRevisionId: 'content-1',
      createdAt: 1,
      updatedAt: 1,
      questions: [
        {
          id: 'q-1',
          prompt: 'Explain',
          parts: [],
          answer: {
            maxMarks: 3,
            response: { kind: 'written' },
            prerequisiteConceptIds: [],
            allocations: [
              {
                id: 'a-1',
                criterion: 'Explanation',
                maxMarks: 3,
                dimension: 'knowledge',
                targetConceptIds: [],
              },
            ],
          },
        },
      ],
    },
  ];
  await writeFile(f.input, JSON.stringify(file));
  expect(await runPublication([...f.args, '--dry-run'], {}, f.fetchImpl)).toMatchObject({
    counts: { practiceSets: 1, practiceMarks: 3 },
  });
  await writeFile(f.input, f.text);
  expect(
    (await runPublication([...f.args, '--dry-run'], {}, f.fetchImpl)).counts,
  ).not.toHaveProperty('practiceMarks');
});

it('approves the original hash, uploads compressed bytes and verifies decoded bytes on retries', async () => {
  const f = await fixture();
  const original = `${f.text}${' '.repeat(4_300_000)}`;
  const sha256 = createHash('sha256').update(original).digest('hex');
  await writeFile(f.input, original);
  const writes: number[] = [];
  const fetchImpl = (async (url, init) => {
    if (init?.method === 'PUT' && String(url).endsWith('/payload'))
      writes.push((init.body as Blob).size);
    return f.fetchImpl(url, init);
  }) as typeof fetch;
  expect(await runPublication([...f.args, '--dry-run'], {}, fetchImpl)).toMatchObject({
    status: 'dry-run',
    sha256,
    byteSize: Buffer.byteLength(original),
  });
  expect(writes).toEqual([]);
  await expect(
    runPublication([...f.args, '--approved-sha256', f.hash], {}, fetchImpl),
  ).rejects.toThrow(/matching the exact frozen bytes/);
  const args = [...f.args, '--approved-sha256', sha256];
  const result = await runPublication(args, {}, fetchImpl);
  expect(result).toMatchObject({
    status: 'published',
    sha256,
    byteSize: Buffer.byteLength(original),
    compressedByteSize: writes[0],
  });
  expect(writes[0]).toBeLessThan(4 * 1024 * 1024);
  const payload = await getShareBytes({ ...f, slot: 'payload' });
  expect(Buffer.from(payload!.bytes).toString()).toBe(original);
  const meta = await getShareBytes({ ...f, slot: 'meta' });
  expect(parseShareManifest(meta!.bytes)).toMatchObject({
    payloadEncoding: 'deflate-raw-v1',
    byteSize: writes[0],
  });
  expect(await runPublication(args, {}, fetchImpl)).toMatchObject({ status: 'skipped', sha256 });
  expect(await runPublication([...f.args, '--dry-run'], {}, fetchImpl)).toMatchObject({
    currentSha256: sha256,
    changes: { payload: false, manifest: false },
  });
  expect(writes).toHaveLength(1);
});
