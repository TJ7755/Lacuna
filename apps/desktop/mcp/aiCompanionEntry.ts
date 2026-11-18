import { registerCompanionProcessShutdown } from '../companionLifecycle.js';
import { installationMarkerDirectory, shouldExitForInstallation } from '../installationGuard.js';
import { startAiCompanion } from './aiCompanion.js';
import { companionHostUserDataPath } from './connectionFile.js';

const hostUserDataPath = companionHostUserDataPath(process.argv, '');
if (hostUserDataPath && shouldExitForInstallation(installationMarkerDirectory(hostUserDataPath))) {
  process.exit(0);
}

// Stdout carries MCP frames once the server starts, so a usage failure before
// that must stay on stderr with a distinct exit code rather than an uncaught
// throw: external launchers get a readable reason instead of a stack trace.
let handle: ReturnType<typeof startAiCompanion>;
try {
  handle = startAiCompanion();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'The Lacuna host profile was not provided.'}\n`,
  );
  process.exit(2);
}

registerCompanionProcessShutdown({
  handle,
  stdin: process.stdin,
  signals: process,
  quit: () => {
    process.exitCode = 0;
  },
});
