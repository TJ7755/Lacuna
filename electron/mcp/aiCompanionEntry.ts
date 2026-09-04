import { registerCompanionProcessShutdown } from '../companionLifecycle.js';
import { installationMarkerDirectory, shouldExitForInstallation } from '../installationGuard.js';
import { startAiCompanion } from './aiCompanion.js';
import { companionHostUserDataPath } from './connectionFile.js';

const hostUserDataPath = companionHostUserDataPath(process.argv, '');
if (hostUserDataPath && shouldExitForInstallation(installationMarkerDirectory(hostUserDataPath))) {
  process.exit(0);
}

const handle = startAiCompanion();

registerCompanionProcessShutdown({
  handle,
  stdin: process.stdin,
  signals: process,
  quit: () => {
    process.exitCode = 0;
  },
});
