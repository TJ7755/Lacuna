import { registerCompanionProcessShutdown } from '../companionLifecycle.js';
import { startAiCompanion } from './aiCompanion.js';

const handle = startAiCompanion();

registerCompanionProcessShutdown({
  handle,
  stdin: process.stdin,
  signals: process,
  quit: () => {
    process.exitCode = 0;
  },
});
