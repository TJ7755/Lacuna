import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router/index';
import './styles/global.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found. Check index.html.');
}

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
