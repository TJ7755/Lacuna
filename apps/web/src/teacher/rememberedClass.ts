import { createInsightsOwnerStore } from '../insights/ownerStore';
import { createGapsConnectionStore } from './connectionStore';
import type { ClassSession } from './classSessions';

/** A class is remembered only when both isolated stores can reopen it. */
export async function rememberClass(session: ClassSession): Promise<boolean> {
  const connections = createGapsConnectionStore();
  const keys = createInsightsOwnerStore();
  const shareId = session.connection.shareId;
  try {
    if (await keys.rememberOnDevice(shareId, session.owner)) {
      if (await connections.rememberOnDevice(session.connection)) return true;
    }
    await connections.forgetRemembered(shareId);
    await keys.forgetRemembered(shareId);
    return false;
  } catch {
    return false;
  } finally {
    connections.close();
    keys.close();
  }
}

export async function readRememberedClass(shareId: string): Promise<ClassSession | undefined> {
  const connections = createGapsConnectionStore();
  const keys = createInsightsOwnerStore();
  try {
    const owner = await keys.readRemembered(shareId);
    const connection = await connections.readRemembered(shareId);
    if (owner && connection) return { owner, connection, remembered: true, days: new Map() };
    await connections.forgetRemembered(shareId);
    await keys.forgetRemembered(shareId);
    return undefined;
  } catch {
    return undefined;
  } finally {
    connections.close();
    keys.close();
  }
}

export async function forgetRememberedClass(shareId: string): Promise<void> {
  const connections = createGapsConnectionStore();
  const keys = createInsightsOwnerStore();
  try {
    const results = await Promise.allSettled([
      keys.forgetRemembered(shareId),
      connections.forgetRemembered(shareId),
    ]);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) throw failure.reason;
  } finally {
    connections.close();
    keys.close();
  }
}
