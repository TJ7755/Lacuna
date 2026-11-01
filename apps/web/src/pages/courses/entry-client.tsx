import { hydrateRoot } from 'react-dom/client';
import { CoursePage } from './CoursePage';
import { courseForPath } from './content';
import { installSimpleAnalytics } from '../../webBootstrap';
import '../../index.css';

installSimpleAnalytics();
hydrateRoot(
  document.getElementById('root')!,
  <CoursePage course={courseForPath(window.location.pathname)} />,
);
