import { db } from '../../src/db/schema';
import type { Card, CourseRecord, Lesson } from '../../src/db/types';
import { defaultFsrsParameters } from '../../src/fsrs/params';
import {
  schedulingUnitFromCourse,
  schedulingUnitFromLesson,
} from '../../src/db/schedulingUnitBuilder';
import { buildCardConcept } from '../../src/questions/concepts';
import { reviewHistoryEntriesForCard } from '../../src/db/reviewHistory';

/** Only injected into a disposable Playwright context, before loading the application. */
export async function counts() {
  await db.open();
  const result = {
    courses: await db.courses.count(),
    lessons: await db.lessons.count(),
    cards: await db.cards.count(),
    reviews: await db.reviewHistory.count(),
  };
  db.close();
  return result;
}

export async function seed(smoke = false) {
  await db.open();
  if (await db.courses.count()) throw new Error('Heavy fixture requires an empty database.');
  const now = Date.now();
  const day = 86_400_000;
  await db.transaction(
    'rw',
    [
      db.courses,
      db.courseAssessments,
      db.schedulingUnits,
      db.lessons,
      db.reviewHistory,
      db.concepts,
      db.cards,
      db.lessonCardExposures,
    ],
    async () => {
      const courseCount = smoke ? 1 : 10;
      const lessonCount = smoke ? 2 : 10;
      for (let c = 0; c < courseCount; c += 1) {
        console.log(`Seeding course ${c + 1}/${courseCount}`);
        const course: CourseRecord = {
          id: `heavy-course-${c}`,
          name: `Heavy course ${c}`,
          description: 'Generated performance dataset',
          createdAt: now - 200 * day,
          updatedAt: now,
          fsrsVersion: 6,
          fsrsParameters: defaultFsrsParameters(),
          examObjective: 'expectedMarks',
          unlockMode: 'open',
          autoPractice: false,
          autoOptimise: false,
          practiceThresholdMinutesFar: 8,
          practiceThresholdMinutesNear: 4,
          practiceUrgentWindowDays: 7,
          practiceMaxGap: 2,
          examDatePromptDismissed: true,
        };
        const assessment = {
          id: `heavy-assessment-${c}`,
          courseId: course.id,
          name: 'Final exam',
          kind: 'final' as const,
          coverageMode: 'prefix' as const,
          excludedCardIds: [],
          afterLessonId: `heavy-lesson-${c}-${lessonCount - 1}`,
          examDate: now + 60 * day,
          createdAt: now,
          updatedAt: now,
        };
        await db.courses.add(course);
        await db.courseAssessments.add(assessment);
        await db.schedulingUnits.add(schedulingUnitFromCourse(course, [assessment]));
        for (let l = 0; l < lessonCount; l += 1) {
          const lesson: Lesson = {
            id: `heavy-lesson-${c}-${l}`,
            courseId: course.id,
            name: `Heavy lesson ${l}`,
            orderIndex: l,
            createdAt: now,
            updatedAt: now,
            isExtension: false,
          };
          await db.lessons.add(lesson);
          await db.schedulingUnits.add(schedulingUnitFromLesson(course, lesson, [assessment]));
          const cards: Card[] = Array.from({ length: 100 }, (_, i) => ({
            id: `heavy-card-${c}-${l}-${i}`,
            conceptId: `heavy-concept-${c}-${l}-${i}`,
            courseId: course.id,
            primaryLessonId: lesson.id,
            schedulingUnitId: lesson.id,
            deckId: lesson.id,
            type: 'front_back',
            front: `Recall item ${c}-${l}-${i}: explain the relationship between energy and motion.`,
            back: `Answer ${c}-${l}-${i}: **Energy** is conserved. The kinetic energy is $E_k = \\frac{1}{2}mv^2$.\n\nDoubling speed quadruples kinetic energy at a fixed mass.`,
            stability: 10,
            difficulty: 5,
            lastReviewed: now - 10 * day,
            reps: 20,
            lapses: 0,
            state: 2,
            due: now - day,
            scheduledDays: 9,
            learningSteps: 0,
            history: Array.from({ length: 20 }, (_, r) => ({
              eventId: `heavy-review-${c}-${l}-${i}-${r}`,
              sessionId: `heavy-session-${c}-${r}`,
              sessionKind: 'deck',
              timestamp: now - (200 - r * 10) * day,
              grade: 3,
              correct: true,
              responseTimeSec: 5 + (i % 10),
              distracted: false,
              stabilityBefore: r === 0 ? null : 10,
              stabilityAfter: 10,
              difficultyBefore: r === 0 ? null : 5,
              difficultyAfter: 5,
              retrievabilityAtReview: r === 0 ? null : 0.9,
            })),
            tags: ['performance', `topic-${i % 10}`],
            createdAt: now - 200 * day,
            updatedAt: now,
            suspended: false,
            buriedUntil: null,
          }));
          const history = cards.flatMap(reviewHistoryEntriesForCard);
          await db.reviewHistory.bulkAdd(history);
          await db.concepts.bulkAdd(
            cards.map((card) =>
              buildCardConcept({
                id: card.conceptId,
                courseId: course.id,
                schedulingUnitId: lesson.id,
                name: card.front,
                now,
              }),
            ),
          );
          await db.cards.bulkAdd(cards);
          await db.lessonCardExposures.bulkAdd(
            cards.map((card) => ({
              lessonId: lesson.id,
              cardId: card.id,
              taughtAt: now - 200 * day,
              updatedAt: now,
            })),
          );
        }
      }
    },
  );
  localStorage.setItem('lacuna-seeded', '1');
  const counts = {
    courses: await db.courses.count(),
    lessons: await db.lessons.count(),
    cards: await db.cards.count(),
    reviews: await db.reviewHistory.count(),
  };
  db.close();
  return counts;
}
