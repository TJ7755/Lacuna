import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Home } from '../pages/Home';
import { Decks } from '../pages/Decks';
import { DeckDetail } from '../pages/DeckDetail';
import { Review } from '../pages/Review';
import { FullRun } from '../pages/FullRun';
import { LinesMode } from '../pages/LinesMode';
import { Notes } from '../pages/Notes';
import { Settings } from '../pages/Settings';
import { NotFound } from '../pages/NotFound';

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/decks', element: <Decks /> },
      { path: '/decks/:id', element: <DeckDetail /> },
      { path: '/review', element: <Review /> },
      { path: '/review/:deckId', element: <Review /> },
      { path: '/review/:deckId/fullrun', element: <FullRun /> },
      { path: '/review/:deckId/fullrun/:sequenceId', element: <FullRun /> },
      { path: '/review/:deckId/lines', element: <LinesMode /> },
      { path: '/review/:deckId/lines/:sequenceId', element: <LinesMode /> },
      { path: '/notes', element: <Notes /> },
      { path: '/settings', element: <Settings /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
