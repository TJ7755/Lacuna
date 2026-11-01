// The ways to add cards that already exist: import from a file or pasted text and,
// under the card editor's further types, link cards from elsewhere
// in the course. Without a lesson, imports join the course's unassigned cards, as a new
// card would. Each opens its own dialog over the editor and, once cards are added,
// hands back to the editor's caller.

import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { CardImportDialog } from '../import/CardImportDialog';
import { LinkCardsDialog } from './LinkCardsDialog';
import { Button } from '../ui/Button';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { UploadIcon, PlusIcon } from '../ui/icons';
import { useToast } from '../ui/Toast';
import { useCourseCards, useLessons } from '../../state/useCourseData';
import { ensureCourseBankBackingDeck, ensureLessonBackingDeck } from '../../db/backingDecks';
import {
  importCardCount,
  importCardsToDestination,
  type CardImportContent,
} from '../../db/cardImport';
import type { Card } from '@lacuna/core/db/types';
import { countOf } from '../../utils/plural';

export function CardSources({
  courseId,
  lessonId,
  targetName,
  lessonCards = [],
  schedulingUnitId,
  showLink = true,
  onAdded,
}: {
  courseId: string;
  /** The lesson receiving the cards; omitted for the course's unassigned cards. */
  lessonId?: string;
  /** The lesson or course name, shown by the import dialog. */
  targetName: string;
  lessonCards?: Card[];
  /** The target's backing deck when it already has one, for duplicate detection. */
  schedulingUnitId?: string;
  /** The picker reveals lesson linking with its further card types. */
  showLink?: boolean;
  onAdded: () => void;
}) {
  const { notify } = useToast();
  const [open, setOpen] = useState<'import' | 'link'>();
  // Only linking needs the course's other cards and lessons.
  const courseCards = useCourseCards(lessonId ? courseId : undefined);
  const lessons = useLessons(lessonId ? courseId : undefined);
  const lessonCardIds = new Set(lessonCards.map((card) => card.id));
  // Generated cards belong to their sequence or occlusion, so only ordinary cards link.
  const linkCandidates = (courseCards ?? []).filter(
    (card) =>
      !lessonCardIds.has(card.id) &&
      (card.sequenceItemId === null || card.sequenceItemId === undefined) &&
      (card.occlusionRegionId === null || card.occlusionRegionId === undefined),
  );

  async function handleImport(content: CardImportContent) {
    // An empty lesson or course has no backing deck until its first cards arrive.
    const unitId = lessonId
      ? await ensureLessonBackingDeck(courseId, lessonId)
      : await ensureCourseBankBackingDeck(courseId);
    await importCardsToDestination({ kind: 'existing', schedulingUnitId: unitId }, content);
    setOpen(undefined);
    notify(`${countOf(importCardCount(content), 'card')} imported.`, 'positive');
    onAdded();
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setOpen('import')}>
        <UploadIcon width={16} height={16} />
        Import cards
      </Button>
      {lessonId && (
        <AnimatedDisclosure open={showLink}>
          <Button variant="ghost" size="sm" onClick={() => setOpen('link')}>
            <PlusIcon width={16} height={16} />
            Link existing cards
          </Button>
        </AnimatedDisclosure>
      )}
      {open === 'import' && (
        <CardImportDialog
          targetName={targetName}
          schedulingUnitId={schedulingUnitId}
          onCancel={() => setOpen(undefined)}
          onImport={handleImport}
        />
      )}
      <AnimatePresence>
        {open === 'link' && lessonId && courseCards && lessons && (
          <LinkCardsDialog
            lessonId={lessonId}
            cards={linkCandidates}
            lessons={lessons}
            onLinked={() => {
              setOpen(undefined);
              onAdded();
            }}
            onCancel={() => setOpen(undefined)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
