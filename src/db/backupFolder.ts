// Optional File System Access folder mirror metadata and writes. This stays
// separate from snapshot creation so Settings can inspect folder support without
// loading the full database portability pipeline.

import { db } from './schema';
import type { BackupFile } from './types';

const MAX_RESTORE_POINTS = 10;
const FOLDER_KEY = 'backupFolderHandle';

// The File System Access types are not in every TS lib target; treat them loosely.
type DirHandle = {
  name: string;
  queryPermission?: (o: { mode: string }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: string }) => Promise<PermissionState>;
  getFileHandle: (
    name: string,
    o?: { create?: boolean },
  ) => Promise<{
    createWritable: () => Promise<{
      write: (d: string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
  values?: () => AsyncIterableIterator<{ kind: 'file' | 'directory'; name: string }>;
  removeEntry?: (name: string) => Promise<void>;
};

/** Whether this browser supports the File System Access folder mirror. */
export function folderMirrorSupported(): boolean {
  return (
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker ===
    'function'
  );
}

async function getFolderHandle(): Promise<DirHandle | null> {
  const entry = await db.appState.get(FOLDER_KEY);
  return (entry?.value as DirHandle | undefined) ?? null;
}

/** The name of the configured backup folder, or null if none is set. */
export async function backupFolderName(): Promise<string | null> {
  const handle = await getFolderHandle();
  return handle?.name ?? null;
}

/** Prompt the user to choose a folder for mirrored backups. Returns the folder name. */
export async function chooseBackupFolder(): Promise<string | null> {
  if (!folderMirrorSupported()) return null;
  const picker = (
    window as unknown as {
      showDirectoryPicker: (o: { mode: string }) => Promise<DirHandle>;
    }
  ).showDirectoryPicker;
  const handle = await picker({ mode: 'readwrite' });
  await db.appState.put({ key: FOLDER_KEY, value: handle });
  return handle.name;
}

/** Stop mirroring backups to a folder. */
export async function clearBackupFolder(): Promise<void> {
  await db.appState.delete(FOLDER_KEY);
}

async function ensurePermission(handle: DirHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission?.(opts)) === 'granted') return true;
  if ((await handle.requestPermission?.(opts)) === 'granted') return true;
  return false;
}

async function pruneFolderMirror(handle: DirHandle): Promise<void> {
  if (!handle.values || !handle.removeEntry) return;
  const names: string[] = [];
  for await (const entry of handle.values()) {
    if (
      entry.kind === 'file' &&
      entry.name.startsWith('lacuna-backup-') &&
      entry.name.endsWith('.json')
    ) {
      names.push(entry.name);
    }
  }
  names.sort();
  for (const name of names.slice(0, Math.max(0, names.length - MAX_RESTORE_POINTS))) {
    await handle.removeEntry(name).catch(() => undefined);
  }
}

/** Best-effort folder mirror for a backup payload. */
export async function mirrorToFolder(payload: BackupFile): Promise<void> {
  const handle = await getFolderHandle();
  if (!handle) return;
  if (!(await ensurePermission(handle))) return;
  const stamp = new Date(payload.exportedAt).toISOString().slice(0, 19).replace(/:/g, '-');
  const fileHandle = await handle.getFileHandle(`lacuna-backup-${stamp}.json`, {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(payload, null, 2));
  await writable.close();
  await pruneFolderMirror(handle);
}
