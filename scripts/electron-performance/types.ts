import type { ChildProcess } from 'node:child_process';
import type { ElectronApplication, Page } from '@playwright/test';

export type InteractionScenario = 'search' | 'settings' | 'course';

export interface PackagedInteractionSample {
  scenario: InteractionScenario;
  executablePath: string;
  appVersion: string;
  packaged: boolean;
  rendererProtocol: string;
  rendererUrl: string;
  viteResourceCount: number;
  reducedMotion: boolean;
  motionSpeed: string;
  inputToFeedbackMs: number;
  inputToUsableMs: number;
  inputToSettledMs: number;
  finiteAnimationDurationsMs: number[];
  longTaskCount: number;
  longTaskTotalMs: number;
  longestLongTaskMs: number;
  errors: string[];
}

export interface PackagedLaunchProof {
  executablePath: string;
  appVersion: string;
  packaged: boolean;
  rendererProtocol: string;
  rendererUrl: string;
  viteResourceCount: number;
}

export interface PackagedProcessExit {
  pid: number;
  exitCode: number;
  signalCode: null;
}

export interface PackagedInteractionSuiteResult {
  launch: PackagedLaunchProof;
  processExit: PackagedProcessExit;
  samples: PackagedInteractionSample[];
}

export interface RunningPackagedApp {
  application: ElectronApplication;
  child: ChildProcess;
  page: Page;
  errors: string[];
  appVersion: string;
  packaged: boolean;
  rendererProtocol: string;
  rendererUrl: string;
  viteResourceCount: number;
}

export interface BrowserProbeResult {
  inputAt: number;
  feedbackAt: number;
  usableAt: number;
  settledAt: number;
  finiteAnimationDurationsMs: number[];
  longTasks: { startTime: number; duration: number }[];
  reducedMotion: boolean;
  motionSpeed: string;
}
