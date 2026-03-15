import { createBrowserRouter } from 'react-router-dom';
import { Home } from '../pages/Home';
import { Decks } from '../pages/Decks';
import { Review } from '../pages/Review';
import { Notes } from '../pages/Notes';
import { Settings } from '../pages/Settings';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
  },
  {
    path: '/decks',
    element: <Decks />,
  },
  {
    path: '/review',
    element: <Review />,
  },
  {
    path: '/notes',
    element: <Notes />,
  },
  {
    path: '/settings',
    element: <Settings />,
  },
]);
