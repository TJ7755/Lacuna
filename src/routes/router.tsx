import { type ComponentType, type ReactNode } from 'react';
import { lazyRouteModule as lazy, loadRouteModuleForNavigation } from './routeModule';
import { prefetchRoute, prepareRoute } from './prefetch';
import { RoutePrefetchContext } from './RoutePrefetchContext';
import { createHashRouter, Navigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { ErrorBoundary } from '../components/layout/ErrorBoundary';
import { RouteTransition } from '../components/layout/RouteTransition';
import { Dashboard } from '../pages/Dashboard';
import { NotFound } from '../pages/NotFound';
import { LazyRoute } from './LazyRoute';
import { PageLoadingBoundary } from '../components/ui/PageLoadingBoundary';
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
  loadQuestionSetEditor,
  loadQuestionSetOverview,
  loadQuestionSetPractice,
  loadSearchPage,
  loadSequenceEditor,
  loadSettings,
  loadSharePage,
  loadTeacherHome,
  loadShareLinkPage,
  loadLanding,
  loadPupilClassPage,
} from './loaders';

// Keep the dashboard as the only eager page. Every other route is loaded on demand
// so optional charts, importers, QR tooling and long-form settings/help content do
// not increase launch parse time.
const Settings = lazy(loadSettings);
const SearchPage = lazy(loadSearchPage);
const SharePage = lazy(loadSharePage);
const TeacherHome = lazy(loadTeacherHome);
const ShareLinkPage = lazy(loadShareLinkPage);
const PupilClassPage = lazy(loadPupilClassPage);
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
const QuestionSetEditor = lazy(loadQuestionSetEditor);
const QuestionSetOverview = lazy(loadQuestionSetOverview);
const QuestionSetPractice = lazy(loadQuestionSetPractice);
const QuestionEditor = lazy(loadQuestionEditor);
const QuestionLearnMode = lazy(loadQuestionLearnMode);
const MergeReviewPanel = lazy(loadMergeReviewPanel);
const Landing = lazy(loadLanding);
// Not in loaders: onboarding reaches the route prefetcher, which imports the loaders.
const loadOnboarding = () =>
  import('../pages/onboarding/Onboarding').then((module) => ({ default: module.Onboarding }));
const Onboarding = lazy(loadOnboarding);
const Download = lazy(loadDownload);
const Method = lazy(loadMethod);
const Privacy = lazy(() =>
  import('../pages/PublicInformation').then((module) => ({ default: module.Privacy })),
);
const Terms = lazy(() =>
  import('../pages/PublicInformation').then((module) => ({ default: module.Terms })),
);

function lazyRoute(Component: ComponentType, study = false) {
  return (
    <LazyRoute animateArrival={!study}>
      <Component />
    </LazyRoute>
  );
}

function isolatedRoute(label: string, child: ReactNode) {
  return <ErrorBoundary label={label}>{child}</ErrorBoundary>;
}

function workspaceRoute(Component: ComponentType) {
  return (
    <PageLoadingBoundary>
      <ArchivedCourseAccessGuard>
        <Component />
      </ArchivedCourseAccessGuard>
    </PageLoadingBoundary>
  );
}

function courseAccessRoute(child: ReactNode, study = false) {
  return (
    <LazyRoute animateArrival={!study}>
      <ArchivedCourseAccessGuard>{child}</ArchivedCourseAccessGuard>
    </LazyRoute>
  );
}

// Hash routing keeps the app deployable as plain static files with no server rewrites.
export const router = createHashRouter([
  {
    loader: async ({ request }) => {
      const path = new URL(request.url).pathname;
      if (path === '/start') {
        await loadRouteModuleForNavigation(loadOnboarding, request.signal).catch(() => undefined);
        return null;
      }
      return prepareRoute(path, request.signal);
    },
    // Query changes belong to the mounted controls; awaiting the same module rolls back typing.
    shouldRevalidate: ({ currentUrl, nextUrl }) => currentUrl.pathname !== nextUrl.pathname,
    hydrateFallbackElement: null,
    element: (
      <RoutePrefetchContext value={prefetchRoute}>
        <RouteTransition />
      </RoutePrefetchContext>
    ),
    children: [
      {
        path: '/teach',
        element: isolatedRoute('class insights', lazyRoute(TeacherHome)),
      },
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'deck/:deckId', element: <Navigate to="/" replace /> },
          { path: 'settings', element: lazyRoute(Settings) },
          { path: 'search', element: lazyRoute(SearchPage) },
          { path: 'share', element: lazyRoute(SharePage) },
          { path: 's/:code', element: lazyRoute(ShareLinkPage) },
          { path: 'gaps/:courseId', element: lazyRoute(PupilClassPage) },
          { path: 'import', element: <Navigate to="/?import=1" replace /> },
          { path: 'analytics', element: lazyRoute(Analytics) },
          { path: 'archived', element: lazyRoute(ArchivedCourses) },
          { path: 'help', element: lazyRoute(HelpPage) },
          { path: 'study', element: <Navigate to="/" replace /> },
          { path: 'course/:courseId', element: workspaceRoute(CoursePath) },
          {
            path: 'course/:courseId/lesson/:lessonId',
            element: workspaceRoute(LessonView),
          },
          {
            path: 'course/:courseId/bank',
            element: courseAccessRoute(<LegacyBankRedirect />),
          },
          { path: 'course/:courseId/cards', element: workspaceRoute(CardsPage) },
          {
            path: 'course/:courseId/questions',
            element: workspaceRoute(QuestionsPage),
          },
          {
            path: 'course/:courseId/question-sets/:setId/edit',
            element: courseAccessRoute(<QuestionSetEditor />),
          },
          {
            path: 'course/:courseId/question-sets/:setId/attempts/:attemptId',
            element: courseAccessRoute(<QuestionSetPractice />),
          },
          {
            path: 'course/:courseId/question-sets/:setId',
            element: courseAccessRoute(<QuestionSetOverview />),
          },
          {
            path: 'course/:courseId/questions/new',
            element: courseAccessRoute(<QuestionEditor />),
          },
          {
            path: 'course/:courseId/questions/:questionId/edit',
            element: courseAccessRoute(<QuestionEditor />),
          },
          {
            path: 'course/:courseId/cards/new',
            element: courseAccessRoute(<CardEditor />),
          },
          {
            path: 'course/:courseId/cards/:cardId/edit',
            element: courseAccessRoute(<CardEditor />),
          },
          {
            path: 'course/:courseId/settings',
            element: workspaceRoute(CourseSettings),
          },
          {
            path: 'course/:courseId/analytics',
            element: workspaceRoute(CourseAnalytics),
          },
          {
            path: 'course/:courseId/updates',
            element: courseAccessRoute(<MergeReviewPanel />),
          },
          {
            path: 'course/:courseId/lesson/:lessonId/cards/new',
            element: courseAccessRoute(<CardEditor />),
          },
          {
            path: 'course/:courseId/lesson/:lessonId/cards/:cardId/edit',
            element: courseAccessRoute(<CardEditor />),
          },
          {
            path: 'course/:courseId/sequence/new',
            element: courseAccessRoute(<SequenceEditor />),
          },
          {
            path: 'course/:courseId/sequence/:sequenceId/edit',
            element: courseAccessRoute(<SequenceEditor />),
          },
          {
            path: 'course/:courseId/lesson/:lessonId/sequence/new',
            element: courseAccessRoute(<SequenceEditor />),
          },
          {
            path: 'course/:courseId/occlusion/new',
            element: courseAccessRoute(<OcclusionEditor />),
          },
          {
            path: 'course/:courseId/occlusion/:occlusionId/edit',
            element: courseAccessRoute(<OcclusionEditor />),
          },
          {
            path: 'course/:courseId/lesson/:lessonId/occlusion/new',
            element: courseAccessRoute(<OcclusionEditor />),
          },
          { path: '*', element: <NotFound /> },
        ],
      },
      {
        // The landing page is a full-screen editorial experience outside the shell.
        path: '/welcome',
        element: isolatedRoute('the landing page', lazyRoute(Landing)),
      },
      {
        path: '/landing',
        element: isolatedRoute('the landing page', lazyRoute(Landing)),
      },
      {
        // First-run onboarding is a full-screen sequence outside the shell.
        path: '/start',
        element: isolatedRoute('onboarding', lazyRoute(Onboarding)),
      },
      {
        // Public download guidance stays outside the application shell.
        path: '/download',
        element: isolatedRoute('the download page', lazyRoute(Download)),
      },
      {
        path: '/privacy',
        element: isolatedRoute('privacy information', lazyRoute(Privacy)),
      },
      {
        path: '/terms',
        element: isolatedRoute('terms information', lazyRoute(Terms)),
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
          isolatedRoute('the Question session', <QuestionLearnMode />),
          true,
        ),
      },
      {
        // Persistent course conductor. It owns lesson/Practice transitions and
        // remains mounted until the learner explicitly finishes the study period.
        path: '/course/:courseId/study',
        element: courseAccessRoute(
          isolatedRoute('the course study flow', <CourseStudyFlow />),
          true,
        ),
      },
      {
        // Learn mode is a full-screen, focused experience outside the shell. The
        // global, cross-course "Today" session (no deckId param).
        path: '/learn',
        element: isolatedRoute('the Learn session', lazyRoute(LearnMode, true)),
      },
      {
        // A course Practice session selected by the curricular objective engine.
        path: '/course/:courseId/learn',
        element: courseAccessRoute(isolatedRoute('the Learn session', <LearnMode />), true),
      },
      {
        // A Simple lesson session for cards not yet exposed in that lesson.
        path: '/lesson/:lessonId/learn',
        element: courseAccessRoute(isolatedRoute('the Learn session', <LearnMode />), true),
      },
    ],
  },
]);
