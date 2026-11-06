import { memo } from 'react';
import { m as motion } from 'motion/react';
import type {
  Card,
  Lesson,
  Occlusion,
  SchedulingUnitRecord,
  Sequence,
} from '@lacuna/core/db/types';
import { AppLink as Link } from '../ui/AppLink';
import { MOTION_EASING } from '../ui/motion';
import { arrivalDelay } from '../../pages/settings/SettingsUi';
import { CardList } from './CardList';
import { CardSections } from './CardSections';
import { courseCardListContext } from './cardListContext';

/** Keep the image lists out of urgent URL/input renders until the deferred result changes. */
export const CardsResults = memo(function CardsResults({
  courseId,
  courseName,
  multiplier,
  lessonsWithCards,
  unassigned,
  byLesson,
  shownCount,
  backingDecks,
  assignableLessons,
  sequences,
  occlusions,
  go,
}: {
  courseId: string;
  courseName: string;
  multiplier: number;
  lessonsWithCards: Lesson[];
  unassigned: Card[];
  byLesson: Map<string, Card[]>;
  shownCount: number;
  backingDecks: Map<string | null, SchedulingUnitRecord> | undefined;
  assignableLessons: AssignableLesson[];
  sequences: Sequence[];
  occlusions: Occlusion[];
  go: (to: string) => void;
}) {
  return (
    <CardSections
      entranceWindowMs={
        (0.45 * multiplier +
          arrivalDelay(lessonsWithCards.length - (unassigned.length ? 0 : 1), multiplier)) *
        1000
      }
      sections={[...lessonsWithCards, ...(unassigned.length ? [null] : [])]}
      cardCount={shownCount}
      sectionKey={(lesson) => lesson?.id ?? 'unassigned'}
    >
      {(lesson, index, previouslyMounted) => (
        <motion.div
          initial={!previouslyMounted && multiplier > 0 ? { opacity: 0, y: 14 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.45 * multiplier,
            delay: arrivalDelay(index, multiplier),
            ease: MOTION_EASING.emphasised,
          }}
        >
          {lesson ? (
            <LessonBucket
              courseId={courseId}
              lesson={lesson}
              cards={byLesson.get(lesson.id) ?? []}
              deck={backingDecks?.get(lesson.id)}
              assignableLessons={assignableLessons}
              sequences={sequences.filter((s) => s.primaryLessonId === lesson.id)}
              occlusions={occlusions.filter((o) => o.primaryLessonId === lesson.id)}
              divided={index > 0}
              go={go}
            />
          ) : (
            <UnassignedBucket
              courseId={courseId}
              courseName={courseName}
              cards={unassigned}
              deck={backingDecks?.get(null)}
              assignableLessons={assignableLessons}
              sequences={sequences.filter((s) => s.primaryLessonId === null)}
              occlusions={occlusions.filter((o) => o.primaryLessonId === null)}
              divided={index > 0}
              go={go}
            />
          )}
        </motion.div>
      )}
    </CardSections>
  );
});

/** Lessons after the first are divided by a rule; the motion wrapper is each one's parent. */
const LESSON_SECTION_CLASS = 'pt-2';
const DIVIDED_SECTION_CLASS = 'mt-3 border-t border-line !pt-5';

interface AssignableLesson {
  id: string;
  name: string;
}

function LessonBucket({
  courseId,
  lesson,
  cards,
  deck,
  assignableLessons,
  sequences,
  occlusions,
  divided,
  go,
}: {
  courseId: string;
  lesson: Lesson;
  cards: Card[];
  deck: SchedulingUnitRecord | undefined;
  assignableLessons: AssignableLesson[];
  sequences: Sequence[];
  occlusions: Occlusion[];
  divided: boolean;
  go: (to: string) => void;
}) {
  const heading = (
    <div className="flex min-w-0 flex-1 items-center gap-1 px-1 max-sm:basis-full max-sm:justify-between">
      <h2 className="min-w-0 font-display text-xl font-semibold tracking-tight">
        {lesson.name} <span className="font-normal text-ink-faint">({cards.length})</span>
      </h2>
      <Link
        to={`/course/${courseId}/lesson/${lesson.id}`}
        className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-ink-soft transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
      >
        Open lesson
      </Link>
    </div>
  );
  return (
    <section className={`${LESSON_SECTION_CLASS} ${divided ? DIVIDED_SECTION_CLASS : ''}`}>
      {deck ? (
        <CardList
          heading={heading}
          cards={cards}
          context={courseCardListContext({
            schedulingConfig: deck,
            courseId,
            primaryLessonId: lesson.id,
            importTargetName: lesson.name,
          })}
          hideHeader
          stickyHeader
          courseId={courseId}
          assignableLessons={assignableLessons}
          onEditCard={(card) => go(`/course/${courseId}/lesson/${lesson.id}/cards/${card.id}/edit`)}
          sequences={sequences}
          onEditSequence={(sequenceId) => go(`/course/${courseId}/sequence/${sequenceId}/edit`)}
          occlusions={occlusions}
          onEditOcclusion={(occlusionId) => go(`/course/${courseId}/occlusion/${occlusionId}/edit`)}
        />
      ) : (
        <div className="mb-3">{heading}</div>
      )}
    </section>
  );
}

function UnassignedBucket({
  courseId,
  courseName,
  cards,
  deck,
  assignableLessons,
  sequences,
  occlusions,
  divided,
  go,
}: {
  courseId: string;
  courseName: string;
  cards: Card[];
  deck: SchedulingUnitRecord | undefined;
  assignableLessons: AssignableLesson[];
  sequences: Sequence[];
  occlusions: Occlusion[];
  divided: boolean;
  go: (to: string) => void;
}) {
  const heading = (
    <h2 className="px-1 font-display text-xl font-semibold tracking-tight">
      Unassigned <span className="font-normal text-ink-faint">({cards.length})</span>
    </h2>
  );
  return (
    <section className={`${LESSON_SECTION_CLASS} ${divided ? DIVIDED_SECTION_CLASS : ''}`}>
      {deck ? (
        <CardList
          heading={heading}
          cards={cards}
          context={courseCardListContext({
            schedulingConfig: deck,
            courseId,
            primaryLessonId: null,
            importTargetName: courseName,
          })}
          hideHeader
          stickyHeader
          courseId={courseId}
          assignableLessons={assignableLessons}
          onEditCard={(card) => go(`/course/${courseId}/cards/${card.id}/edit`)}
          sequences={sequences}
          onEditSequence={(sequenceId) => go(`/course/${courseId}/sequence/${sequenceId}/edit`)}
          occlusions={occlusions}
          onEditOcclusion={(occlusionId) => go(`/course/${courseId}/occlusion/${occlusionId}/edit`)}
        />
      ) : (
        <div className="mb-3">{heading}</div>
      )}
    </section>
  );
}
