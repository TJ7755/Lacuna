import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import type { MarkAllocation, QuestionAnswer } from '@lacuna/core/questions/questionSets';
import {
  decideTechnique,
  SCIENCE_TECHNIQUES,
  type CourseTechnique,
} from '@lacuna/core/questions/techniqueTags';
import {
  flattenQuestionSet,
  updateQuestionSetNodeAnswer,
} from '../../questions/questionSetAuthoring';
import type { QuestionSetDraftSession } from '../../questions/questionSetDraftSession';
import {
  addBuiltInTechniques,
  CourseTechniqueError,
  createCourseTechnique,
} from '../../questions/courseTechniques';
import { useAnchoredPopoverPosition } from '../../hooks/useAnchoredPopoverPosition';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { summariseTechniques, summaryText } from '../../questions/techniqueSummary';
import { AppLink } from '../ui/AppLink';
import { useToast } from '../ui/Toast';
import { BuiltInPicker, PointTechniques } from './TechniquePointEditor';
import { TechniqueForm } from './TechniqueForm';
import './question-techniques.css';

const HOVER_OPEN_DELAY_MS = 280;
const HOVER_CLOSE_DELAY_MS = 220;

/**
 * The composer's narrow techniques column: a one-line summary that expands into a card on
 * hover, or on click for touch and keyboard. It stays out of the Tab order so writing a set
 * remains question, mark scheme, next question; the row menu's "What it tests" opens it.
 */
export function QuestionTechniqueCell({
  label,
  nodeId,
  answer,
  catalogue,
  courseId,
  session,
  readOnlyReason,
  pinned,
  onPinnedChange,
  multiplier,
}: {
  label: string;
  nodeId: string;
  answer: QuestionAnswer;
  catalogue: readonly CourseTechnique[];
  courseId: string;
  session: QuestionSetDraftSession;
  readOnlyReason?: string;
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
  multiplier: number;
}) {
  const [hovered, setHovered] = useState(false);
  const open = pinned || hovered;
  const trigger = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const cardId = useId();
  const { position, placement } = useAnchoredPopoverPosition(open, trigger, card);
  useFocusTrap(pinned, {}, card);
  const summary = summariseTechniques(answer.allocations, catalogue);
  const schedule = (next: boolean) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setHovered(next),
      next ? HOVER_OPEN_DELAY_MS : HOVER_CLOSE_DELAY_MS,
    );
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!pinned) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (card.current?.contains(target) || trigger.current?.contains(target)) return;
      onPinnedChange(false);
      setHovered(false);
    };
    // Escape still closes the card after a control inside it removed itself and took focus.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onPinnedChange(false);
      setHovered(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [pinned, onPinnedChange]);
  const close = () => {
    window.clearTimeout(timer.current);
    setHovered(false);
    onPinnedChange(false);
  };
  const hoverHandlers = {
    onPointerEnter: (event: React.PointerEvent) => {
      if (event.pointerType === 'mouse') schedule(true);
    },
    onPointerLeave: (event: React.PointerEvent) => {
      if (event.pointerType === 'mouse' && !pinned) schedule(false);
    },
  };
  const shown = [
    ...summary.active.map((name) => ({ name, unsure: false })),
    ...summary.unsure.map((name) => ({ name, unsure: true })),
  ];
  // One name and a count reads cleanly in the narrow column; the card lists them all.
  const visible = shown.slice(0, 1);
  const hidden = shown.slice(1);
  return (
    <div className="qs-composer-techniques" {...hoverHandlers}>
      <button
        ref={trigger}
        type="button"
        tabIndex={-1}
        className="qs-technique-trigger"
        aria-label={`${label} techniques: ${summaryText(summary)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? cardId : undefined}
        data-open={open || undefined}
        onClick={() => {
          window.clearTimeout(timer.current);
          if (pinned) close();
          else onPinnedChange(true);
        }}
        // While the card is open, Escape closes it rather than leaving the editor.
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !open) return;
          event.preventDefault();
          close();
        }}
      >
        {summary.knowledgeTagged > 0 && (
          <span className="qs-technique-flag" aria-hidden="true">
            !
          </span>
        )}
        <span className="qs-technique-names" aria-hidden="true">
          {visible.length ? (
            visible.map((item, index) => (
              <span key={item.name} className={item.unsure ? 'is-unsure' : undefined}>
                {index > 0 && <span className="qs-technique-sep"> · </span>}
                {item.name}
              </span>
            ))
          ) : (
            <span className="qs-technique-empty">{answer.allocations.length ? 'None' : '–'}</span>
          )}
        </span>
        {hidden.length > 0 && (
          <span
            className={`qs-technique-more ${hidden.some((item) => item.unsure) ? 'is-unsure' : ''}`}
            aria-hidden="true"
          >
            +{hidden.length}
          </span>
        )}
        {summary.pending > 0 && (
          <span className="qs-technique-pending" aria-hidden="true">
            ?
          </span>
        )}
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={card}
              id={cardId}
              role="dialog"
              aria-label={`${label} techniques`}
              tabIndex={-1}
              className="qs-technique-card"
              data-pinned={pinned || undefined}
              style={{
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                visibility: position ? 'visible' : 'hidden',
              }}
              initial={
                multiplier > 0
                  ? { opacity: 0, y: placement === 'bottom' ? -4 : 4, scale: 0.98 }
                  : false
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={multiplier > 0 ? { opacity: 0, scale: 0.98 } : undefined}
              transition={{ duration: 0.12 * multiplier, ease: [0.16, 1, 0.3, 1] }}
              {...hoverHandlers}
              // Interacting with a hover card keeps it open until the author dismisses it.
              onPointerDown={() => {
                window.clearTimeout(timer.current);
                if (!pinned) onPinnedChange(true);
              }}
              // The card is portalled but still a React child of the row; keep the composer's
              // keyboard grammar (Enter adds a row, Tab moves fields) out of it.
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key !== 'Escape') return;
                event.preventDefault();
                close();
              }}
            >
              <TechniqueCard
                label={label}
                nodeId={nodeId}
                answer={answer}
                catalogue={catalogue}
                courseId={courseId}
                session={session}
                readOnlyReason={readOnlyReason}
                pinned={pinned}
                cardRef={card}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

function TechniqueCard({
  label,
  nodeId,
  answer,
  catalogue,
  courseId,
  session,
  readOnlyReason,
  pinned,
  cardRef,
}: {
  label: string;
  nodeId: string;
  answer: QuestionAnswer;
  catalogue: readonly CourseTechnique[];
  courseId: string;
  session: QuestionSetDraftSession;
  readOnlyReason?: string;
  pinned: boolean;
  cardRef: RefObject<HTMLDivElement | null>;
}) {
  const [creating, setCreating] = useState(false);
  // Done, Create and the Knowledge fix remove the control that held focus; keep keyboard users
  // inside the pinned card rather than dropping them to the top of the page.
  useEffect(() => {
    if (pinned && document.activeElement === document.body) cardRef.current?.focus();
  });
  const { notify } = useToast();
  const available = catalogue.filter((technique) => !technique.archived);
  const readOnly = Boolean(readOnlyReason);
  // The built-in picker stays open while the card does, so several can be added in a row.
  const [pickingBuiltIns, setPickingBuiltIns] = useState(!available.length);
  const unusedBuiltIns = SCIENCE_TECHNIQUES.filter(
    (builtIn) => !available.some((technique) => technique.id === builtIn.id),
  );
  // Read the session's current answer, not this render's, so async results never overwrite
  // edits made while a technique was being created.
  const updatePoint = (pointId: string, change: (point: MarkAllocation) => MarkAllocation) =>
    session.update((set) => {
      const current = flattenQuestionSet(set).find((row) => row.id === nodeId)?.node.answer;
      if (!current) return set;
      return updateQuestionSetNodeAnswer(set, nodeId, {
        ...current,
        allocations: current.allocations.map((point) =>
          point.id === pointId ? change(point) : point,
        ),
      });
    });
  const decide = (pointId: string, id: string, applies: boolean) =>
    updatePoint(pointId, (point) => ({
      ...point,
      techniqueTags: decideTechnique(point.techniqueTags, id, applies),
    }));
  const addBuiltIn = (ids: string[]) =>
    addBuiltInTechniques(courseId, ids).catch((error: unknown) =>
      notify(
        error instanceof CourseTechniqueError ? error.message : 'The techniques were not added.',
        'negative',
      ),
    );
  return (
    <div className="qs-technique-card-body">
      <header className="qs-technique-card-head">
        <h3>Techniques · {label}</h3>
        <AppLink to={`/course/${courseId}/settings?section=techniques`} tabIndex={0}>
          Manage
        </AppLink>
      </header>
      {readOnlyReason && <p className="qs-muted">{readOnlyReason}</p>}
      {!answer.allocations.length ? (
        <p className="qs-muted">
          Write the mark scheme first. Each line becomes a point you can tag.
        </p>
      ) : (
        !available.length && (
          <p className="qs-muted">
            This course has no techniques yet. Create your own, or start from the built-in science
            techniques.
          </p>
        )
      )}
      {available.length > 0 &&
        answer.allocations.map((point, index) => (
          <PointTechniques
            key={point.id}
            index={index}
            single={answer.allocations.length === 1}
            point={point}
            catalogue={catalogue}
            available={available}
            readOnly={readOnly}
            onDecide={(id, applies) => decide(point.id, id, applies)}
            onDimension={(dimension) => updatePoint(point.id, (row) => ({ ...row, dimension }))}
            onReset={() =>
              updatePoint(point.id, (row) => {
                const { techniqueTags: _tags, ...rest } = row;
                return rest;
              })
            }
          />
        ))}
      {!readOnly && pickingBuiltIns && unusedBuiltIns.length > 0 && (
        <BuiltInPicker
          techniques={unusedBuiltIns}
          onAdd={addBuiltIn}
          onDone={available.length ? () => setPickingBuiltIns(false) : undefined}
        />
      )}
      {!readOnly &&
        (creating ? (
          <TechniqueForm
            compact
            submitLabel={answer.allocations.length === 1 ? 'Create and tag' : 'Create'}
            onCancel={() => setCreating(false)}
            onSubmit={async (input) => {
              const technique = await createCourseTechnique(courseId, input);
              // The technique is saved from here, so the form closes whatever happens next.
              setCreating(false);
              // With one point there is only one thing the author can have meant. If the draft
              // refuses the tag, the new technique still shows as an unpressed chip to retry.
              if (answer.allocations.length === 1) {
                try {
                  decide(answer.allocations[0].id, technique.id, true);
                } catch {
                  /* left untagged; the chip is visible */
                }
              }
            }}
          />
        ) : (
          <div className="qs-technique-footer">
            <button type="button" className="qs-technique-add" onClick={() => setCreating(true)}>
              + New technique…
            </button>
            {!pickingBuiltIns && unusedBuiltIns.length > 0 && (
              <button
                type="button"
                className="qs-technique-add"
                onClick={() => setPickingBuiltIns(true)}
              >
                + Built-in…
              </button>
            )}
          </div>
        ))}
    </div>
  );
}
