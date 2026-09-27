import { hydrateRoot, createRoot } from 'react-dom/client';
import { QuizletComparison } from './QuizletComparison';
import { installHostedFontLinks, installSimpleAnalytics } from '../../webBootstrap';
import '../../index.css';

installHostedFontLinks();
installSimpleAnalytics();
const root = document.getElementById('root')!;
if (root.querySelector('.qc-page')) hydrateRoot(root, <QuizletComparison />);
else createRoot(root).render(<QuizletComparison />);
