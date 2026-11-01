import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { createHandler } from '../apps/relay/src/relay';
import { MemoryStore } from '../apps/relay/src/store';

it('runs the operator command against a local relay and emits a verified public record', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lacuna-publish-cli-'));
  const handle = createHandler(new MemoryStore());
  const server = createServer((req, res) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const request = new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: ['GET', 'HEAD'].includes(req.method!) ? undefined : new Blob([Buffer.concat(chunks)]),
      });
      if (req.headers['content-length'])
        request.headers.set('Content-Length', req.headers['content-length']);
      const response = await handle(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    })().catch(() => {
      res.writeHead(500);
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    const relayUrl = `http://127.0.0.1:${address.port}`;
    const owner = (await (
      await handle(new Request(`${relayUrl}/shares`, { method: 'POST' }))
    ).json()) as { shareId: string; writeToken: string };
    const text = JSON.stringify({
      format: 'lacuna-course',
      version: 1,
      assets: [],
      payload: {
        v: 6,
        concepts: [],
        questions: [],
        questionSets: [],
        questionSetPracticeNodes: [],
        at: 1000,
        li: 'cli-lineage',
        rv: 1,
        course: { n: 'Synthetic', o: 0, c: 1, sm: 1, um: 'open' },
        lessons: [],
      },
    });
    const input = join(directory, 'frozen.lacuna');
    await writeFile(input, text);
    const sha256 = createHash('sha256').update(text).digest('hex');
    const args = [
      'scripts/library-publish.ts',
      '--artefact',
      input,
      '--course-id',
      'synthetic',
      '--share',
      `https://getlacuna.app/#/s/${owner.shareId}`,
      '--approved-sha256',
      sha256,
    ];
    let result: { stdout: string; stderr: string; code: number | string };
    try {
      const output = await promisify(execFile)('bun', args, {
        env: { ...process.env, LACUNA_RELAY_URL: relayUrl, LACUNA_WRITE_TOKEN: owner.writeToken },
      });
      result = { ...output, code: 0 };
    } catch (error) {
      const failure = error as { stdout: string; stderr: string; code: number | string };
      result = { stdout: failure.stdout, stderr: failure.stderr, code: failure.code };
    }
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'published',
      courseId: 'synthetic',
      sha256,
      revision: 1,
    });
    expect(result.stdout + result.stderr).not.toContain(owner.writeToken);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true });
  }
});
