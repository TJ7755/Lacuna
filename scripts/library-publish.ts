import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeCourseFile } from '../apps/web/src/db/courseFile';
import { summariseSelfMarking } from '@lacuna/core/questions/questionSets';
import { summariseShare } from '../apps/web/src/db/share';
import {
  getShareBytes,
  parseShareManifest,
  putShareBytes,
  SHARE_ID_RE,
  ShareLinkError,
  StaleShareGenerationError,
  verifyShareOwner,
  type ShareManifest,
} from '../apps/web/src/shareLinks/client';
import {
  encodeSharePayload,
  MAX_DECOMPRESSED_SHARE_BYTES,
  SharePayloadError,
} from '../apps/web/src/shareLinks/payloadCodec';
import { normaliseRelayUrl } from '../apps/web/src/sync/relay';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const encode = (text: string) => new TextEncoder().encode(text);
const usage =
  'Usage: bun scripts/library-publish.ts --artefact FILE --course-id ID --share URL [--credentials FILE] [--dry-run] [--approved-sha256 HASH]';

class PublicationError extends Error {}

function argumentsFor(args: string[]) {
  const values: Record<string, string> = {};
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--dry-run' && !dryRun) {
      dryRun = true;
      continue;
    }
    if (
      !['--artefact', '--course-id', '--share', '--credentials', '--approved-sha256'].includes(
        key,
      ) ||
      values[key] !== undefined ||
      !args[i + 1] ||
      args[i + 1].startsWith('--')
    ) {
      throw new PublicationError(usage);
    }
    values[key] = args[++i];
  }
  if (!values['--artefact'] || !/^[a-z0-9][a-z0-9-]*$/.test(values['--course-id'] ?? '')) {
    throw new PublicationError(usage);
  }
  let shareId: string;
  try {
    const url = new URL(values['--share']);
    shareId = url.hash.slice('#/s/'.length);
    if (
      url.origin !== 'https://getlacuna.app' ||
      url.pathname !== '/' ||
      url.search ||
      url.username ||
      url.password ||
      !url.hash.startsWith('#/s/') ||
      !SHARE_ID_RE.test(shareId)
    )
      throw new Error();
  } catch {
    throw new PublicationError('Supply an existing canonical https://getlacuna.app/#/s/<id> link.');
  }
  return { values, dryRun, shareId };
}

async function credentialsFor(path: string | undefined, env: NodeJS.ProcessEnv) {
  let raw: unknown = { relayUrl: env.LACUNA_RELAY_URL, writeToken: env.LACUNA_WRITE_TOKEN };
  if (path) {
    try {
      const actual = await realpath(path);
      const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
      const fromRoot = relative(root, actual);
      if (!isAbsolute(fromRoot) && fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`))
        throw new Error();
      raw = JSON.parse(await readFile(actual, 'utf8'));
    } catch {
      throw new PublicationError(
        'Credentials must be a readable JSON file outside the repository.',
      );
    }
  }
  const fields = raw as { relayUrl?: unknown; writeToken?: unknown } | null;
  if (
    typeof fields?.relayUrl !== 'string' ||
    typeof fields?.writeToken !== 'string' ||
    !/^[0-9a-f]{64}$/.test(fields.writeToken)
  ) {
    throw new PublicationError(
      'Supply relayUrl and writeToken through an external credentials file or LACUNA_RELAY_URL/LACUNA_WRITE_TOKEN.',
    );
  }
  try {
    return { relayUrl: normaliseRelayUrl(fields.relayUrl), writeToken: fields.writeToken };
  } catch {
    throw new PublicationError('The configured relay URL is invalid.');
  }
}

async function validated(bytes: Uint8Array) {
  try {
    const file = await decodeCourseFile(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const p = file.payload;
    if (
      !p.li?.trim() ||
      !Number.isSafeInteger(p.rv) ||
      p.rv! < 1 ||
      !Number.isFinite(p.at) ||
      p.at < 0
    )
      throw new Error();
    return {
      file,
      manifest: {
        v: 1,
        lineageId: p.li,
        revision: p.rv!,
        publishedAt: p.at,
        byteSize: bytes.byteLength,
        courseName: p.course.n,
      } satisfies ShareManifest,
    };
  } catch {
    throw new PublicationError(
      'Invalid frozen course artefact, media, lineage or revision; nothing has been written.',
    );
  }
}

function sameManifest(a: ShareManifest | null, b: ShareManifest) {
  return (
    a !== null &&
    a.v === b.v &&
    a.lineageId === b.lineageId &&
    a.revision === b.revision &&
    a.publishedAt === b.publishedAt &&
    a.byteSize === b.byteSize &&
    a.courseName === b.courseName &&
    a.payloadEncoding === b.payloadEncoding
  );
}

/** Exact-byte publishing: no database import, rebuild, revision bump or identity rewriting. */
export async function runPublication(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
) {
  let phase = 'preflight';
  try {
    const { values, dryRun, shareId } = argumentsFor(args);
    const credentials = await credentialsFor(values['--credentials'], env);
    const options = { ...credentials, shareId, fetchImpl, signal: AbortSignal.timeout(60_000) };
    const path = values['--artefact'];
    if ((await stat(path)).size > MAX_DECOMPRESSED_SHARE_BYTES)
      throw new PublicationError('The frozen artefact exceeds the safe 64 MB decompressed limit.');
    const bytes = new Uint8Array(await readFile(path));
    const uploadBytes = await encodeSharePayload(bytes);
    const sha256 = hash(bytes);
    const { file, manifest: originalManifest } = await validated(bytes);
    const manifest: ShareManifest = {
      ...originalManifest,
      byteSize: uploadBytes.byteLength,
      ...(uploadBytes !== bytes ? { payloadEncoding: 'deflate-raw-v1' as const } : {}),
    };
    const approval = values['--approved-sha256'];
    if ((approval !== undefined && approval !== sha256) || (!dryRun && approval !== sha256)) {
      throw new PublicationError(
        'Real publication requires --approved-sha256 matching the exact frozen bytes; review this artefact first.',
      );
    }
    await verifyShareOwner(options);
    const [payload, meta] = await Promise.all([
      getShareBytes({ ...options, slot: 'payload' }),
      getShareBytes({ ...options, slot: 'meta' }),
    ]);
    const currentManifest = meta ? parseShareManifest(meta.bytes) : null;
    const unchanged = payload !== null && hash(payload.bytes) === sha256;
    // Both slots can hold evidence after a partial publication. Neither may authorise a fork or rollback.
    const currentPayload = payload ? await validated(payload.bytes) : null;
    for (const current of [currentManifest, currentPayload?.manifest]) {
      if (!current) continue;
      if (current.lineageId !== manifest.lineageId)
        throw new PublicationError(
          'Lineage mismatch: stop for a reviewed identity migration; nothing has been written.',
        );
      if (
        current.revision > manifest.revision ||
        (current.revision === manifest.revision && !unchanged)
      ) {
        throw new PublicationError(
          'Revision conflict: use a separately reviewed higher revision; nothing has been written.',
        );
      }
    }
    const changes = { payload: !unchanged, manifest: !sameManifest(currentManifest, manifest) };
    const summary = summariseShare(file.payload);
    const record = {
      courseId: values['--course-id'],
      version: file.payload.v,
      revision: manifest.revision,
      sha256,
      byteSize: bytes.byteLength,
      compressedByteSize: uploadBytes.byteLength,
      review: approval === sha256 ? 'operator-approved' : 'unreviewed',
      counts: {
        cards: summary.cardCount,
        notes: summary.noteCount!,
        lessons: file.payload.lessons.length,
        questions: summary.questionCount!,
        assets: file.assets.length,
        ...('questionSets' in file.payload
          ? {
              practiceSets: file.payload.questionSets.length,
              practiceMarks: file.payload.questionSets.reduce(
                (sum, set) => sum + summariseSelfMarking(set, []).total.available,
                0,
              ),
            }
          : {}),
      },
    };
    if (dryRun)
      return {
        ...record,
        status: 'dry-run',
        currentSha256: payload ? hash(payload.bytes) : null,
        changes,
      };
    if (!changes.payload && !changes.manifest) return { ...record, status: 'skipped' };

    phase = 'payload upload (outcome may be unknown)';
    let payloadGeneration = payload?.generation;
    if (changes.payload) {
      payloadGeneration = (
        await putShareBytes({
          ...options,
          slot: 'payload',
          bytes: uploadBytes,
          ifMatch: payload?.generation ?? '"0"',
        })
      ).generation;
    }
    // Slot CAS is not a two-slot transaction. Recheck the payload before advancing the polling manifest.
    phase = 'manifest upload (payload may be live; manifest outcome may be unknown)';
    const latestPayload = await getShareBytes({ ...options, slot: 'payload' });
    if (
      !latestPayload ||
      latestPayload.generation !== payloadGeneration ||
      latestPayload.bytes.byteLength !== bytes.byteLength ||
      hash(latestPayload.bytes) !== sha256
    )
      throw new StaleShareGenerationError();
    if (changes.manifest) {
      await putShareBytes({
        ...options,
        slot: 'meta',
        bytes: encode(JSON.stringify(manifest)),
        ifMatch: meta?.generation ?? '"0"',
      });
    }
    phase = 'verification (payload and manifest may already be live)';
    const [verifiedPayload, verifiedMeta] = await Promise.all([
      getShareBytes({ ...options, slot: 'payload' }),
      getShareBytes({ ...options, slot: 'meta' }),
    ]);
    if (
      !verifiedPayload ||
      verifiedPayload.bytes.byteLength !== bytes.byteLength ||
      hash(verifiedPayload.bytes) !== sha256 ||
      !verifiedMeta ||
      !sameManifest(parseShareManifest(verifiedMeta.bytes), manifest)
    ) {
      throw new PublicationError(
        'Re-downloaded bytes or manifest do not match; publication is not verified.',
      );
    }
    return { ...record, status: 'published' };
  } catch (error) {
    const detail =
      error instanceof PublicationError || error instanceof SharePayloadError
        ? error.message
        : error instanceof StaleShareGenerationError
          ? 'Concurrent publication conflict (HTTP 412); no automatic overwrite.'
          : error instanceof ShareLinkError
            ? `Share operation failed${error.status ? ` (HTTP ${error.status})` : ''}.`
            : 'Publication operation failed; private error details suppressed.';
    throw new PublicationError(
      `${phase}: ${detail}${
        phase === 'preflight'
          ? ''
          : ' Stop other publishers, run --dry-run with the same frozen artefact and inspect both slots before retrying. Do not roll back or replace identities.'
      }`,
    );
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    console.log(JSON.stringify(await runPublication(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
