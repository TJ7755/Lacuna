import './index.css';
import { installStaleChunkRecovery } from './pwa/staleChunkRecovery';
import { registerProductionServiceWorker } from './webBootstrap';
import { hydrateLanding } from './pages/landing/entry-client';

installStaleChunkRecovery();
void registerProductionServiceWorker();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hydrateLanding, { once: true });
} else {
  hydrateLanding();
}
