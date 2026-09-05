export const loadSettings = () =>
  import('../pages/Settings').then((module) => ({ default: module.Settings }));

export const loadSearchPage = () =>
  import('../pages/SearchPage').then((module) => ({ default: module.SearchPage }));

export const loadSharePage = () =>
  import('../pages/SharePage').then((module) => ({ default: module.SharePage }));

export const loadAnalytics = () =>
  import('../pages/Analytics').then((module) => ({ default: module.Analytics }));

export const loadArchivedCourses = () =>
  import('../pages/ArchivedCourses').then((module) => ({ default: module.ArchivedCourses }));

export const loadHelpPage = () =>
  import('../pages/HelpPage').then((module) => ({ default: module.HelpPage }));

export const loadLearnMode = () =>
  import('../pages/LearnMode').then((module) => ({ default: module.LearnMode }));

export const loadCourseStudyFlow = () =>
  import('../pages/CourseStudyFlow').then((module) => ({ default: module.CourseStudyFlow }));

export const loadCardEditor = () =>
  import('../pages/CardEditor').then((module) => ({ default: module.CardEditor }));

export const loadSequenceEditor = () =>
  import('../pages/SequenceEditor').then((module) => ({ default: module.SequenceEditor }));

export const loadOcclusionEditor = () =>
  import('../pages/OcclusionEditor').then((module) => ({ default: module.OcclusionEditor }));

export const loadCourseSettings = () =>
  import('../pages/CourseSettings').then((module) => ({ default: module.CourseSettings }));

export const loadCourseAnalytics = () =>
  import('../pages/CourseAnalytics').then((module) => ({ default: module.CourseAnalytics }));

export const loadCoursePath = () =>
  import('../pages/CoursePath').then((module) => ({ default: module.CoursePath }));

export const loadLessonView = () =>
  import('../pages/LessonView').then((module) => ({ default: module.LessonView }));

export const loadCardsPage = () =>
  import('../pages/CardsPage').then((module) => ({ default: module.CardsPage }));

export const loadQuestionsPage = () =>
  import('../pages/QuestionsPage').then((module) => ({ default: module.QuestionsPage }));

export const loadQuestionEditor = () =>
  import('../pages/QuestionEditor').then((module) => ({ default: module.QuestionEditor }));

export const loadQuestionLearnMode = () =>
  import('../pages/QuestionLearnMode').then((module) => ({
    default: module.QuestionLearnMode,
  }));

export const loadMergeReviewPanel = () =>
  import('../components/import/MergeReviewPanel').then((module) => ({
    default: module.MergeReviewPanel,
  }));

export const loadDownload = () =>
  import('../pages/Download').then((module) => ({ default: module.Download }));

export const loadMethod = () =>
  import('../pages/Method').then((module) => ({ default: module.Method }));

export const loadMcpBridgeController = () =>
  import('../components/mcp/McpBridgeController').then((module) => ({
    default: module.McpBridgeController,
  }));

export const loadLanding = () =>
  import('../pages/Landing').then((module) => ({ default: module.Landing }));
