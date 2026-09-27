import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'motion/react';
import { Analytics } from '@vercel/analytics/react';
import { App } from './App';

/** Mount the full study app, replacing any prerendered landing markup. */
export function renderApp(): void {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LazyMotion features={domAnimation}>
        <App />
        {__VERCEL_ANALYTICS_ENABLED__ && <Analytics />}
      </LazyMotion>
    </StrictMode>,
  );
}
