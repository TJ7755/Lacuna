import { db } from '../db/schema';
import { SHARE_ID_RE } from './client';

const STORAGE_KEY = 'lacuna.shareImports';

/** One recorded share-link import: the relay's share id and the local course. */
export interface ShareLinkImport {
  shareId: string;
  courseId: string;
}

function invalidShareId(): Error {
  return new Error('The share link code is invalid.');
}

/** Read the stored mapping, skipping anything that fails validation. Readers always
 *  read fresh from storage so background polling sees imports recorded elsewhere. */
function readMapping(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const mapping: Record<string, string> = {};
    for (const [shareId, courseId] of Object.entries(parsed as Record<string, unknown>)) {
      if (SHARE_ID_RE.test(shareId) && typeof courseId === 'string' && courseId !== '') {
        mapping[shareId] = courseId;
      }
    }
    return mapping;
  } catch {
    return {};
  }
}

function writeMapping(mapping: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping));
  } catch {
    // Storage can be unavailable (for example in private browsing mode). The mapping
    // is best-effort: polling simply has nothing to check until storage works again.
  }
}

/** Record that a share link was imported as a local course. */
export function recordShareImport(shareId: string, courseId: string): void {
  if (!SHARE_ID_RE.test(shareId)) throw invalidShareId();
  if (!courseId) throw new Error('The course id is missing.');
  const mapping = readMapping();
  mapping[shareId] = courseId;
  writeMapping(mapping);
}

/** The local course imported from a share link, or null when unknown. */
export function getCourseIdForShare(shareId: string): string | null {
  if (!SHARE_ID_RE.test(shareId)) throw invalidShareId();
  return readMapping()[shareId] ?? null;
}

/** The share link a local course was imported from, or null when unknown. */
export function getShareIdForCourse(courseId: string): string | null {
  if (!courseId) return null;
  for (const [shareId, mappedCourseId] of Object.entries(readMapping())) {
    if (mappedCourseId === courseId) return shareId;
  }
  return null;
}

/** Every recorded import, for background polling of teacher republishes. */
export function listShareImports(): ShareLinkImport[] {
  return Object.entries(readMapping()).map(([shareId, courseId]) => ({ shareId, courseId }));
}

/** Forget a recorded import. Forgetting an unknown share link changes nothing. */
export function clearShareImport(shareId: string): void {
  if (!SHARE_ID_RE.test(shareId)) throw invalidShareId();
  const mapping = readMapping();
  delete mapping[shareId];
  writeMapping(mapping);
}

/**
 * Associate a share link with its imported course, but only when the course
 * is the one the link served. The link page embeds the full importer, so a
 * visitor can import a different course there (a pasted code or file);
 * recording that under the route's share id would untrack the linked course
 * and aim polling at a stranger. Returns whether the link was recorded.
 */
export async function confirmShareImport(
  shareId: string,
  expectedLineageId: string | null,
  courseId: string,
): Promise<boolean> {
  if (!SHARE_ID_RE.test(shareId) || !courseId || !expectedLineageId) return false;
  let lineage: string | undefined;
  try {
    lineage = (await db.courses.get(courseId))?.distributedCopy?.lineageId;
  } catch {
    return false;
  }
  if (lineage !== expectedLineageId) return false;
  recordShareImport(shareId, courseId);
  return true;
}
