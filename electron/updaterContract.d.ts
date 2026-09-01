// Shared types only: Electron emits the main process as ESM and the preload as CommonJS.
// Executable validation remains inside the preload security boundary; the parity test keeps its
// allowlists aligned without making either runtime load a module built for the other format.
export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error'
  | 'manual';

export type ManualUpdateReason =
  | 'development'
  | 'unsigned-macos'
  | 'windows-portable'
  | 'linux-deb';

export interface UpdateProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface UpdateState {
  phase: UpdatePhase;
  mode: 'automatic' | 'manual';
  currentVersion: string;
  availableVersion?: string;
  manualReason?: ManualUpdateReason;
  progress?: UpdateProgress;
  error?: string;
}
