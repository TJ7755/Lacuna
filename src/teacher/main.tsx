import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../state/ThemeContext';
import { TeacherHomeView } from './TeacherHomeView';

// One teacher view needs no router. Old learner hashes cannot start the study app here.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <TeacherHomeView />
    </ThemeProvider>
  </StrictMode>,
);
