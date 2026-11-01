import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../state/ThemeContext';
import { LibraryPage } from './LibraryPage';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <LibraryPage />
    </ThemeProvider>
  </StrictMode>,
);
