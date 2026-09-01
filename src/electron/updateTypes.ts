export type DesktopUpdatePhase =
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

export interface DesktopUpdateProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface DesktopUpdateState {
  phase: DesktopUpdatePhase;
  mode: 'automatic' | 'manual';
  currentVersion: string;
  availableVersion?: string;
  manualReason?: ManualUpdateReason;
  progress?: DesktopUpdateProgress;
  error?: string;
}
