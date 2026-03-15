import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { DbProvider } from './db/DbProvider';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { router } from './router/index';
import './styles/global.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found. Check index.html.');
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <DbProvider>
        <RouterProvider router={router} />
      </DbProvider>
    </ErrorBoundary>
  </StrictMode>,
);
