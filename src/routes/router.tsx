import { lazy, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import { createHashRouter, Navigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { ErrorBoundary } from '../components/layout/ErrorBoundary';
import { RouteTransition } from '../components/layout/RouteTransition';
import { Dashboard } from '../pages/Dashboard';
import { NotFound } from '../pages/NotFound';
import { LazyRoute } from './LazyRoute';
import { LegacyBankRedirect } from './LegacyBankRedirect';
import { ArchivedCourseAccessGuard } from './ArchivedCourseAccessGuard';
import {
  loadAnalytics,
  loadArchivedCourses,
  loadCardEditor,
  loadCardsPage,
  loadCourseAnalytics,
  loadCoursePath,
  loadCourseSettings,
  loadCourseStudyFlow,
  loadDownload,
  loadHelpPage,
  loadLessonView,
  loadLearnMode,
  loadMergeReviewPanel,
  loadMethod,
  loadOcclusionEditor,
  loadQuestionEditor,
  loadQuestionLearnMode,
  loadQuestionsPage,
  loadSearchPage,
  loadSequenceEditor,
  loadSettings,
  loadSharePage,
  loadWelcome,
  loadLanding,
} from './loaders';

// Keep the dashboard as the only eager page. Every other route is loaded on demand
// so optional charts, importers, QR tooling and long-form settings/help content do
// not increase launch parse time.
const Settings = lazy(loadSettings);
const SearchPage = lazy(loadSearchPage);
const SharePage = lazy(loadSharePage);
const Analytics = lazy(loadAnalytics);
const ArchivedCourses = lazy(loadArchivedCourses);
const HelpPage = lazy(loadHelpPage);
const LearnMode = lazy(loadLearnMode);
const CourseStudyFlow = lazy(loadCourseStudyFlow);
const CardEditor = lazy(loadCardEditor);
const SequenceEditor = lazy(loadSequenceEditor);
const OcclusionEditor = lazy(loadOcclusionEditor);
const CourseSettings = lazy(loadCourseSettings);
const CourseAnalytics = lazy(loadCourseAnalytics);
const CoursePath = lazy(loadCoursePath);
const LessonView = lazy(loadLessonView);
const CardsPage = lazy(loadCardsPage);
const QuestionsPage = lazy(loadQuestionsPage);
const QuestionEditor = lazy(loadQuestionEditor);
const QuestionLearnMode = lazy(loadQuestionLearnMode);
const MergeReviewPanel = lazy(loadMergeReviewPanel);
const Welcome = lazy(loadWelcome);
const Landing = lazy(loadLanding);
const Download = lazy(loadDownload);
const Method = lazy(loadMethod);

function lazyRoute(Component: LazyExoticComponent<ComponentType>) {
  return (
    <LazyRoute>
      <Component />
    </LazyRoute>
  );
}

function isolatedRoute(label: string, child: ReactNode) {
  return <ErrorBoundary label={label}>{child}</ErrorBoundary>;
}

function courseAccessRoute(child: ReactNode) {
  return <ArchivedCourseAccessGuard>{child}</ArchivedCourseAccessGuard>;
}

// Hash routing keeps the app deployable as plain static files with no server rewrites.
export const router = createHashRouter([
  {
    element: <RouteTransition />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'deck/:deckId', element: <Navigate to="/" replace /> },
          { path: 'settings', element: lazyRoute(Settings) },
          { path: 'search', element: lazyRoute(SearchPage) },
          { path: 'share', element: lazyRoute(SharePage) },
          { path: 'analytics', element: lazyRoute(Analytics) },
          { path: 'archived', element: lazyRoute(ArchivedCourses) },
          { path: 'help', element: lazyRoute(HelpPage) },
          { path: 'study', element: <Navigate to="/" replace /> },
          { path: 'course/:courseId', element: courseAccessRoute(lazyRoute(CoursePath)) },
          {
            path: 'course/:courseId/lesson/:lessonId',
            element: courseAccessRoute(lazyRoute(LessonView)),
          },
          {
            path: 'course/:courseId/bank',
            element: courseAccessRoute(<LegacyBankRedirect />),
          },
          { path: 'course/:courseId/cards', element: courseAccessRoute(lazyRoute(CardsPage)) },
          {
            path: 'course/:courseId/questions',
            element: courseAccessRoute(lazyRoute(QuestionsPage)),
          },
          {
            path: 'course/:courseId/questions/new',
            element: courseAccessRoute(lazyRoute(QuestionEditor)),
          },
          {
            path: 'course/:courseId/questions/:questionId/edit',
            element: courseAccessRoute(lazyRoute(QuestionEditor)),
          },
          {
            path: 'course/:courseId/cards/new',
            element: courseAccessRoute(lazyRoute(CardEditor)),
          },
          {
            path: 'course/:courseId/cards/:cardId/edit',
            element: courseAccessRoute(lazyRoute(CardEditor)),
          },
          {
            path: 'course/:courseId/settings',
            element: courseAccessRoute(lazyRoute(CourseSettings)),
          },
          {
            path: 'course/:courseId/analytics',
            element: courseAccessRoute(lazyRoute(CourseAnalytics)),
          },
          {
            path: 'course/:courseId/updates',
            element: courseAccessRoute(lazyRoute(MergeReviewPanel)),
          },
          {
            path: 'course/:courseId/lesson/:lessonId/cards/new',
            element: courseAccessRoute(lazyRoute(CardEditor)),
          },
          {
            path: 'course/:courseId/lesson/:lessonId/cards/:cardId/edit',
            element: courseAccessRoute(lazyRoute(CardEditor)),
          },
          {
            path: 'course/:courseId/sequence/new',
            element: courseAccessRoute(lazyRoute(SequenceEditor)),
          },
          {
            path: 'course/:courseId/sequence/:sequenceId/edit',
            element: courseAccessRoute(lazyRoute(SequenceEditor)),
          },
          {
            path: 'course/:courseId/lesson/:lessonId/sequence/new',
            element: courseAccessRoute(lazyRoute(SequenceEditor)),
          },
          {
            path: 'course/:courseId/occlusion/new',
            element: courseAccessRoute(lazyRoute(OcclusionEditor)),
          },
          {
            path: 'course/:courseId/occlusion/:occlusionId/edit',
            element: courseAccessRoute(lazyRoute(OcclusionEditor)),
          },
          {
            path: 'course/:courseId/lesson/:lessonId/occlusion/new',
            element: courseAccessRoute(lazyRoute(OcclusionEditor)),
          },
          { path: '*', element: <NotFound /> },
        ],
      },
      {
        // The landing page is a full-screen editorial experience outside the shell.
        path: '/welcome',
        element: isolatedRoute('the landing page', lazyRoute(Welcome)),
      },
      {
        path: '/landing',
        element: isolatedRoute('the landing page', lazyRoute(Landing)),
      },
      {
        // Public download guidance stays outside the application shell.
        path: '/download',
        element: isolatedRoute('the download page', lazyRoute(Download)),
      },
      {
        // The technical account belongs to the landing page, outside the app shell.
        path: '/method',
        element: isolatedRoute('the technical account', lazyRoute(Method)),
      },
      {
        // Question practice remains a separate post-instruction session while its
        // scheduling evidence is being validated. It deliberately does not enter
        // the Card-based course conductor or Path yet.
        path: '/course/:courseId/questions/learn',
        element: courseAccessRoute(
          isolatedRoute('the Question session', lazyRoute(QuestionLearnMode)),
        ),
      },
      {
        // Persistent course conductor. It owns lesson/Practice transitions and
        // remains mounted until the learner explicitly finishes the study period.
        path: '/course/:courseId/study',
        element: courseAccessRoute(
          isolatedRoute('the course study flow', lazyRoute(CourseStudyFlow)),
        ),
      },
      {
        // Learn mode is a full-screen, focused experience outside the shell. The
        // global, cross-course "Today" session (no deckId param).
        path: '/learn',
        element: isolatedRoute('the Learn session', lazyRoute(LearnMode)),
      },
      {
        // A course Practice session selected by the curricular objective engine.
        path: '/course/:courseId/learn',
        element: courseAccessRoute(isolatedRoute('the Learn session', lazyRoute(LearnMode))),
      },
      {
        // A Simple lesson session for cards not yet exposed in that lesson.
        path: '/lesson/:lessonId/learn',
        element: courseAccessRoute(isolatedRoute('the Learn session', lazyRoute(LearnMode))),
      },
    ],
  },
]);
