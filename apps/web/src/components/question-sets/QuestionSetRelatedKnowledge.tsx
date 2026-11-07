import { useState } from 'react';
import { AnimatePresence, m as motion, useIsPresent } from 'motion/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { Button } from '../ui/Button';
import { CardsIcon } from '../ui/icons';
import { ExpandingSheet } from '../ui/ExpandingSheet';
import { QuestionSetRelatedCards } from './QuestionSetRelatedCards';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { MOTION_DURATION, MOTION_EASING } from '../ui/motion';

export function QuestionSetRelatedKnowledge({
  courseId,
  conceptIds,
  submitted,
  beforeReveal,
}: {
  courseId: string;
  conceptIds: string[];
  submitted: boolean;
  beforeReveal: () => Promise<unknown>;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cards = useLiveQuery(
    () =>
      db.cards
        .where('courseId')
        .equals(courseId)
        .filter((card) => Boolean(card.conceptId && conceptIds.includes(card.conceptId)))
        .toArray(),
    [courseId, conceptIds.join(',')],
    [],
  );
  if (!cards.length) return null;
  const close = () => setAnchor(null);
  return (
    <div className={submitted ? undefined : 'qs-related'}>
      <Button
        variant={submitted ? 'ghost' : 'secondary'}
        className={submitted ? 'qs-icon-button' : undefined}
        aria-label={submitted ? 'Related cards' : undefined}
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchor)}
        aria-busy={busy}
        title={submitted ? 'Related cards' : undefined}
        pressScale={false}
        hoverScale={false}
        style={{ visibility: anchor ? 'hidden' : undefined }}
        disabled={busy}
        onClick={(event) => {
          const trigger = event.currentTarget;
          setError('');
          if (submitted) {
            setAnchor(trigger);
            return;
          }
          setBusy(true);
          // No card content mounts until the existing assistance write succeeds.
          void Promise.resolve()
            .then(beforeReveal)
            .then(() => setAnchor(trigger))
            .catch((cause) =>
              setError(cause instanceof Error ? cause.message : 'Could not record assistance.'),
            )
            .finally(() => setBusy(false));
        }}
      >
        <CardsIcon width={18} height={18} />
        {!submitted && (busy ? 'Saving assistance…' : 'Use related cards')}
      </Button>
      {busy && (
        <p className="sr-only" role="status">
          Saving assistance…
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <AnimatePresence>
        {anchor && (
          <ExpandingSheet
            anchor={anchor}
            maxWidth={640}
            closeLabel="Close"
            autoFocusSelector="h2"
            onClose={close}
            face={(headingId) => <RelatedCardsHeading id={headingId} />}
          >
            <div className="px-6 pb-6 pt-2">
              <QuestionSetRelatedCards cards={cards} />
            </div>
          </ExpandingSheet>
        )}
      </AnimatePresence>
    </div>
  );
}

function RelatedCardsHeading({ id }: { id: string }) {
  const present = useIsPresent();
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  return (
    <motion.header
      className="px-6 pb-2 pt-5 pr-16"
      initial={false}
      // The sheet returns to a differently labelled trigger; fade its title before it contracts.
      animate={{ opacity: present ? 1 : 0 }}
      transition={{
        duration: MOTION_DURATION.feedback * multiplier,
        ease: MOTION_EASING.standard,
      }}
    >
      <h2 id={id} tabIndex={-1} className="font-display text-xl">
        Related cards
      </h2>
    </motion.header>
  );
}
