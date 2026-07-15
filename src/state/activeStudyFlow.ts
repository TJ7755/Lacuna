export interface ActiveStudyFlowIdentity {
  courseId: string;
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
    keys.length !== 3 ||
    !keys.includes('courseId') ||
    !keys.includes('startedAt') ||
    !keys.includes('lastActiveAt')
  ) {
    return null;
  }
  const candidate = value as Partial<ActiveStudyFlowIdentity>;
  if (
    typeof candidate.courseId !== 'string' ||
    candidate.courseId.trim().length === 0 ||
    !isValidTimestamp(candidate.startedAt) ||
    !isValidTimestamp(candidate.lastActiveAt) ||
    candidate.lastActiveAt < candidate.startedAt
  ) {
    return null;
  }
  return {
    courseId: candidate.courseId,
    startedAt: candidate.startedAt,
    lastActiveAt: candidate.lastActiveAt,
  };
}

export function readActiveStudyFlow(): ActiveStudyFlowIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const identity = parseIdentity(JSON.parse(raw));
    if (!identity) localStorage.removeItem(STORAGE_KEY);
    return identity;
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage may be unavailable; there is nothing else to recover.
    }
    return null;
  }
}

export function startActiveStudyFlow(
  courseId: string,
  now: number = Date.now(),
): ActiveStudyFlowIdentity | null {
  const identity = parseIdentity({ courseId, startedAt: now, lastActiveAt: now });
  if (!identity) return null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // The flow remains usable without device-local resume state.
  }
  return identity;
}

export function clearActiveStudyFlow(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable.
  }
}
