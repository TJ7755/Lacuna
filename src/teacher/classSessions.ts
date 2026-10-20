import type { InsightsOwner } from '../insights/envelope';
import type { GapsCourseConnection } from './connectionFile';
import type { ReadClassReports } from './readReports';

export interface ClassSession {
  connection: GapsCourseConnection;
  owner: InsightsOwner;
  days: Map<string, ReadClassReports>;
  code?: string;
}

/** Tab-local sessions with revocable unlock completions; nothing is persisted. */
export function createClassSessions() {
  const sessions = new Map<string, ClassSession>();
  const revisions = new Map<string, number>();
  let epoch = 0;
  return {
    sessions: sessions as ReadonlyMap<string, ClassSession>,
    beginUnlock(shareId: string) {
      const startedEpoch = epoch;
      const revision = revisions.get(shareId);
      return (session: ClassSession): boolean => {
        if (
          startedEpoch !== epoch ||
          revision !== revisions.get(shareId) ||
          session.connection.shareId !== shareId
        )
          return false;
        sessions.set(shareId, session);
        return true;
      };
    },
    lock(shareId: string) {
      revisions.set(shareId, (revisions.get(shareId) ?? 0) + 1);
      sessions.delete(shareId);
    },
    clear() {
      epoch++;
      sessions.clear();
      revisions.clear();
    },
  };
}
