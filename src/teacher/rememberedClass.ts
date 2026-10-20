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

export async function readRememberedClass(shareId: string): Promise<ClassSession | null> {
  const connections = createGapsConnectionStore();
  const keys = createInsightsOwnerStore();
  try {
    const owner = await keys.readRemembered(shareId);
    const connection = await connections.readRemembered(shareId);
    if (owner && connection) return { owner, connection, remembered: true, days: new Map() };
    await connections.forgetRemembered(shareId);
    await keys.forgetRemembered(shareId);
    return null;
  } catch {
    return null;
  } finally {
    connections.close();
    keys.close();
  }
}

export async function forgetRememberedClass(shareId: string): Promise<void> {
  const connections = createGapsConnectionStore();
  const keys = createInsightsOwnerStore();
  try {
    await connections.forgetRemembered(shareId);
    await keys.forgetRemembered(shareId);
  } finally {
    connections.close();
    keys.close();
  }
}
