import { storedString } from './localSetting';
import { makeId } from '../utils/id';

export interface ActiveStudyFlowIdentity {
  courseId: string;
  sessionId: string;
  startedAt: number;
  lastActiveAt: number;
}

const STORAGE_KEY = 'lacuna.activeStudyFlow';

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function parseIdentity(value: unknown): ActiveStudyFlowIdentity | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (
    keys.length !== 4 ||
    !keys.includes('courseId') ||
    !keys.includes('sessionId') ||
    !keys.includes('startedAt') ||
    !keys.includes('lastActiveAt')
  ) {
    return null;
  }
  const candidate = value as Partial<ActiveStudyFlowIdentity>;
  if (
    typeof candidate.courseId !== 'string' ||
    candidate.courseId.trim().length === 0 ||
    typeof candidate.sessionId !== 'string' ||
    candidate.sessionId.trim().length === 0 ||
    !isValidTimestamp(candidate.startedAt) ||
    !isValidTimestamp(candidate.lastActiveAt) ||
    candidate.lastActiveAt < candidate.startedAt
  ) {
    return null;
  }
  return {
    courseId: candidate.courseId,
    sessionId: candidate.sessionId,
    startedAt: candidate.startedAt,
    lastActiveAt: candidate.lastActiveAt,
  };
}

export function readActiveStudyFlow(): ActiveStudyFlowIdentity | null {
  try {
    const raw = storedString(STORAGE_KEY).read();
    if (!raw) return null;
    const identity = parseIdentity(JSON.parse(raw));
    if (!identity) storedString(STORAGE_KEY).remove();
    return identity;
  } catch {
    try {
      storedString(STORAGE_KEY).remove();
    } catch {
      // Storage may be unavailable; there is nothing else to recover.
    }
    return null;
  }
}

export function startActiveStudyFlow(
  courseId: string,
  now: number = Date.now(),
  sessionId: string = makeId(),
): ActiveStudyFlowIdentity | null {
  const identity = parseIdentity({ courseId, sessionId, startedAt: now, lastActiveAt: now });
  if (!identity) return null;
  try {
    storedString(STORAGE_KEY).write(JSON.stringify(identity));
  } catch {
    // The flow remains usable without device-local resume state.
  }
  return identity;
}

export function touchActiveStudyFlow(
  courseId: string,
  now: number = Date.now(),
): ActiveStudyFlowIdentity | null {
  const current = readActiveStudyFlow();
  if (!current || current.courseId !== courseId || now < current.startedAt) return null;
  const identity = { ...current, lastActiveAt: now };
  try {
    storedString(STORAGE_KEY).write(JSON.stringify(identity));
  } catch {
    // The flow remains usable without device-local resume state.
  }
  return identity;
}

export function clearActiveStudyFlow(): void {
  try {
    storedString(STORAGE_KEY).remove();
  } catch {
    // Storage may be unavailable.
  }
}
