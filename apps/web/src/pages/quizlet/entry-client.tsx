import { hydrateRoot, createRoot } from 'react-dom/client';
import { QuizletComparison } from './QuizletComparison';
import { installSimpleAnalytics } from '../../webBootstrap';
import '../../index.css';

installSimpleAnalytics();
const root = document.getElementById('root')!;
if (root.querySelector('.qc-page')) hydrateRoot(root, <QuizletComparison />);
else createRoot(root).render(<QuizletComparison />);
