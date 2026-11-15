import { useEffect, useRef, type ComponentProps } from 'react';
import {
  useLocation,
  useNavigate,
  useNavigationType,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { canEditLessons } from '../course/lessonViewMode';
import { useLessonViewData } from '../state/useLessonViewData';
import { useLessonCardLinks, useOcclusions, useSequences } from '../state/useCourseData';
import { usePageShortcuts } from '../hooks/usePageShortcuts';
import { originFrom, useReturn } from '../utils/editorOrigin';
import { orderOcclusionSiblings } from '../components/cards/lessonCardRow';
import { LessonCardDocument } from '../components/cards/LessonCardDocument';
import { LessonCardsSection } from '../components/cards/LessonCardsSection';
import { COURSE_PAGE_FRAME, COURSE_PAGE_TITLE } from '../components/course/coursePageLayout';
import { MissingRecord } from '../components/course/MissingRecord';
import { AppLink } from '../components/ui/AppLink';
import { ChevronLeftIcon } from '../components/ui/icons';
import { Button } from '../components/ui/Button';
import { PageLoading } from '../components/ui/PageLoadingBoundary';
import './lessonCards.css';

export function LessonCardsPage() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const { lesson, course, lessonCards, lessonDeck } = useLessonViewData(courseId, lessonId);
  const links = useLessonCardLinks(lessonId);
  const occlusions = useOcclusions(courseId);
  const sequences = useSequences(courseId);
  const [params] = useSearchParams();
  const location = useLocation();
  const navigation = useNavigationType();
  const navigate = useNavigate();
  const documentRef = useRef<HTMLDivElement>(null);
  const selected = params.get('card');
  const focusedOnArrival = useRef(false);
  const returnTo = useReturn({
    path: `/course/${courseId}/lesson/${lessonId}`,
    label: 'Back to lesson',
  });
  const ordered = orderOcclusionSiblings(lessonCards ?? [], occlusions ?? []);
  const editable = Boolean(course && !course.archived && canEditLessons(course));

  function moveCard(direction: number) {
    if (documentRef.current?.querySelector('[aria-expanded="true"]')) return;
    const rows = Array.from(
      documentRef.current?.querySelectorAll<HTMLElement>('[data-lesson-card]') ?? [],
    );
    const focused = rows.findIndex((row) => row.contains(document.activeElement));
    const target =
      rows[Math.max(0, Math.min(rows.length - 1, focused < 0 ? 0 : focused + direction))];
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest' });
  }
  usePageShortcuts({
    arrowdown: () => moveCard(1),
    j: () => moveCard(1),
    arrowup: () => moveCard(-1),
    k: () => moveCard(-1),
    e: editable
      ? () => {
          const row = document.activeElement?.closest('[data-lesson-card]');
          row
            ?.querySelector<HTMLButtonElement>(
              'header button[aria-expanded], header button[data-card-edit]',
            )
            ?.click();
        }
      : undefined,
  });

  useEffect(() => {
    if (
      focusedOnArrival.current ||
      !lessonCards ||
      !occlusions ||
      !sequences ||
      !links ||
      (editable && lessonCards.length > 0 && !lessonDeck)
    )
      return;
    focusedOnArrival.current = true;
    // Browser Back restores the document's existing position through scrollMemory.
    if (!selected || navigation === 'POP') return;
    const target = document.getElementById(`lesson-card-${selected}`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start' });
  }, [lessonCards, occlusions, sequences, selected, navigation, links, lessonDeck, editable]);

  if (
    lesson === undefined ||
    course === undefined ||
    lessonCards === undefined ||
    occlusions === undefined ||
    sequences === undefined ||
    links === undefined ||
    (editable && lessonCards.length > 0 && !lessonDeck)
  )
    return <PageLoading />;
  if (!lesson || !course || lesson.courseId !== course.id)
    return (
      <MissingRecord message="This lesson could not be found." to={`/course/${courseId}`}>
        Back to course
      </MissingRecord>
    );

  const renderDocument = (selection?: ComponentProps<typeof LessonCardDocument>['selection']) => (
    <div ref={documentRef} className="flex flex-col gap-4" data-page-part="">
      {ordered.map((card, index) => (
        <LessonCardDocument
          key={card.id}
          card={card}
          course={course}
          lessonId={lessonId!}
          position={index + 1}
          count={ordered.length}
          editable={editable}
          sequences={sequences}
          occlusions={occlusions}
          selection={selection}
        />
      ))}
      {ordered.length === 0 && <p className="text-ink-soft">No cards yet.</p>}
    </div>
  );

  return (
    <div className={`${COURSE_PAGE_FRAME} py-6`}>
      <AppLink
        {...returnTo.linkProps}
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm text-ink-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-accent-ink"
      >
        <ChevronLeftIcon width={14} height={14} />
        {returnTo.label}
      </AppLink>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-4" data-page-part="">
        <div>
          <h1 className={COURSE_PAGE_TITLE}>{lesson.name}</h1>
          <p className="mt-2 text-sm text-ink-soft">
            {lessonCards.length} {lessonCards.length === 1 ? 'card' : 'cards'}
          </p>
        </div>
        {editable && (
          <Button
            variant="secondary"
            onClick={() =>
              void navigate(`/course/${courseId}/lesson/${lessonId}/cards/new`, {
                state: originFrom(location, 'Lesson cards'),
              })
            }
          >
            New card
          </Button>
        )}
      </header>
      {editable && lessonCards.length > 0 && lessonDeck ? (
        <LessonCardsSection
          courseId={course.id}
          lessonId={lessonId!}
          lessonName={lesson.name}
          lessonCards={ordered}
          lessonSchedulingConfig={lessonDeck}
          linkedCardIds={new Set(links.map((link) => link.cardId))}
          renderCards={renderDocument}
        />
      ) : (
        renderDocument()
      )}
    </div>
  );
}
