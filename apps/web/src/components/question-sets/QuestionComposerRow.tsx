import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, m as motion, useIsPresent } from 'motion/react';
import { makeId } from '../../utils/id';
import type { QuestionAnswer, QuestionResponse } from '../../questions/questionSets';
import type { QuestionSetAuthoringNode } from '../../questions/questionSetAuthoring';
import type { QuestionSetDraftSession } from '../../questions/questionSetDraftSession';
import { formatMarkSchemeLines, parseMarkSchemeLines } from '../../questions/markSchemeLines';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { ConfirmInline } from '../ui/ConfirmInline';
import { Menu, type MenuHandle } from '../ui/Menu';
import { MoreIcon } from '../ui/icons';
import { expandingActionSpring } from '../ui/motion';
import { ComposerTextarea } from './ComposerTextarea';
import { QuestionComposerExtras, type ComposerPanel } from './QuestionComposerExtras';
import { QuestionSetResponseEditor } from './QuestionSetResponseEditor';
import { emptyAnswer } from './presentation';

export function QuestionComposerRow({
  row,
  label,
  stem,
  total,
  active,
  issues,
  multiplier,
  session,
  onPrompt,
  onAnswer,
  onFocus,
  onBlur,
  onKeyDown,
  onMove,
  canMoveUp,
  canMoveDown,
  onDelete,
}: {
  row: QuestionSetAuthoringNode;
  label: string;
  stem: boolean;
  total: number;
  active: boolean;
  issues: string[];
  multiplier: number;
  session: QuestionSetDraftSession;
  onPrompt: (value: string) => void;
  onAnswer: (value: QuestionAnswer) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onMove: (direction: number) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onDelete: () => void;
}) {
  const present = useIsPresent();
  const answer = row.node.answer ?? { ...emptyAnswer(), maxMarks: 0 };
  const canonical = formatMarkSchemeLines(answer.allocations);
  const [scheme, setScheme] = useState(canonical);
  const lastWritten = useRef(canonical);
  const autoTotal = parseMarkSchemeLines(scheme, answer.allocations).reduce(
    (value, point) => value + point.maxMarks,
    0,
  );
  const sum = answer.allocations.reduce((value, point) => value + point.maxMarks, 0);
  const [override, setOverride] = useState<number | null>(
    answer.maxMarks !== sum ? answer.maxMarks : null,
  );
  const [panel, setPanel] = useState<ComposerPanel>(null);
  const [pending, setPending] = useState<QuestionResponse | null>(null);
  const menu = useRef<MenuHandle>(null);
  useEffect(() => {
    if (canonical !== lastWritten.current) {
      setScheme(canonical);
      lastWritten.current = canonical;
      setOverride(answer.maxMarks !== sum ? answer.maxMarks : null);
    }
  }, [canonical, answer.maxMarks, sum]);
  const writeScheme = (source: string) => {
    setScheme(source);
    let allocations = parseMarkSchemeLines(source, answer.allocations);
    const auto = allocations.reduce((value, point) => value + point.maxMarks, 0);
    if (allocations.length === 1 && override !== null)
      allocations = [{ ...allocations[0], maxMarks: override }];
    lastWritten.current = formatMarkSchemeLines(allocations);
    onAnswer({ ...answer, allocations, maxMarks: override ?? auto });
  };
  const changeType = (kind: QuestionResponse['kind']) => {
    if (kind === answer.response.kind) return;
    const response: QuestionResponse =
      kind === 'multiple-choice'
        ? {
            kind,
            selection: 'single',
            options: [
              { id: makeId(), content: '' },
              { id: makeId(), content: '' },
            ],
            correctOptionIds: [],
          }
        : { kind };
    if (
      answer.response.kind === 'multiple-choice' &&
      answer.response.options.some((option) => option.content.trim())
    )
      setPending(response);
    else onAnswer({ ...answer, response });
  };
  const warning =
    !stem && !active && row.node.prompt.trim()
      ? !answer.allocations.length
        ? 'Needs a mark scheme'
        : answer.allocations.length > 1 && sum !== answer.maxMarks
          ? `Points add up to ${sum}, not ${answer.maxMarks}`
          : ''
      : '';
  const messages = [...new Set([warning, ...issues].filter(Boolean))];
  const transition = expandingActionSpring(multiplier);
  return (
    <motion.div
      inert={!present}
      aria-hidden={!present || undefined}
      data-composer-row={row.id}
      data-depth={row.depth}
      layout={multiplier > 0 ? 'position' : undefined}
      initial={multiplier > 0 ? { height: 0, opacity: 0 } : false}
      animate={{ height: 'auto', opacity: 1 }}
      exit={multiplier > 0 ? { height: 0, opacity: 0, overflow: 'hidden' } : undefined}
      transition={transition}
      className={`qs-composer-row ${stem ? 'is-stem' : ''} ${active ? 'is-active' : ''}`}
      onFocus={onFocus}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) onBlur();
      }}
      onKeyDown={(event) => {
        if (
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
          event.nativeEvent.keyCode === 229
        )
          return;
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          menu.current?.open();
          return;
        }
        onKeyDown(event);
      }}
    >
      <motion.div
        className="qs-composer-wash"
        aria-hidden="true"
        initial={false}
        animate={{ opacity: active ? 1 : 0 }}
        transition={{ duration: 0.12 * multiplier }}
      />
      <motion.span
        className="qs-composer-label"
        initial={false}
        animate={{ paddingLeft: row.depth * 12 }}
        transition={transition}
      >
        {row.label}
      </motion.span>
      <ComposerTextarea
        className="qs-composer-prompt"
        data-field="question"
        aria-label={`${label} question`}
        aria-invalid={issues.length > 0 || undefined}
        aria-describedby={messages.length ? `issues-${row.id}` : undefined}
        placeholder={
          stem ? 'Introduction shared by the parts' : row.depth ? 'Part question' : 'Question'
        }
        value={row.node.prompt}
        onChange={(event) => onPrompt(event.target.value)}
      />
      {stem ? (
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={total}
            className="qs-composer-total"
            aria-label={`${label} total marks`}
            initial={multiplier > 0 ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={multiplier > 0 ? { opacity: 0 } : undefined}
            transition={{ duration: 0.12 * multiplier }}
          >
            {total}
          </motion.span>
        </AnimatePresence>
      ) : (
        <>
          <ComposerTextarea
            className="qs-composer-scheme"
            data-field="scheme"
            aria-label={`${label} mark scheme`}
            aria-keyshortcuts="ArrowRight"
            placeholder="Mark scheme"
            value={scheme}
            onChange={(event) => writeScheme(event.target.value)}
          />
          <input
            className="qs-composer-marks"
            data-field="marks"
            aria-label={`${label} marks`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            tabIndex={-1}
            placeholder={String(autoTotal || '–')}
            value={override ?? ''}
            onChange={(event) => {
              if (!/^\d*$/.test(event.target.value)) return;
              const value = event.target.value === '' ? null : Number(event.target.value);
              setOverride(value);
              let allocations = parseMarkSchemeLines(scheme, answer.allocations);
              if (allocations.length === 1 && value !== null)
                allocations = [{ ...allocations[0], maxMarks: value }];
              lastWritten.current = formatMarkSchemeLines(allocations);
              onAnswer({
                ...answer,
                allocations,
                maxMarks: value ?? allocations.reduce((n, point) => n + point.maxMarks, 0),
              });
            }}
          />
        </>
      )}
      <div className="qs-composer-menu">
        <Menu
          label={`${label} row options`}
          handle={menu}
          triggerWidth={44}
          triggerTabIndex={-1}
          items={[
            ...(!stem
              ? (
                  [
                    ['written', 'Written'],
                    ['calculation', 'Calculation'],
                    ['multiple-choice', 'Multiple choice'],
                  ] as const
                ).map(([kind, name]) => ({
                  label: name,
                  description: answer.response.kind === kind ? 'Current answer type' : undefined,
                  onSelect: () => changeType(kind),
                }))
              : []),
            { label: 'Add image', onSelect: () => setPanel(panel === 'image' ? null : 'image') },
            ...(!stem
              ? [
                  {
                    label: 'Marking guidance',
                    onSelect: () => setPanel(panel === 'guidance' ? null : 'guidance'),
                  },
                  {
                    label: 'What it tests',
                    onSelect: () => setPanel(panel === 'dimensions' ? null : 'dimensions'),
                  },
                  {
                    label: 'Link to knowledge',
                    onSelect: () => setPanel(panel === 'links' ? null : 'links'),
                  },
                ]
              : []),
            { label: 'Move up', disabled: !canMoveUp, onSelect: () => onMove(-1) },
            { label: 'Move down', disabled: !canMoveDown, onSelect: () => onMove(1) },
            { label: 'Delete', onSelect: onDelete },
          ]}
        >
          <MoreIcon width={18} height={18} />
        </Menu>
      </div>
      <AnimatedDisclosure open={!!messages.length} className="qs-composer-inline">
        <div id={`issues-${row.id}`} role="status" className="qs-composer-warning">
          {messages.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      </AnimatedDisclosure>
      <AnimatedDisclosure open={!!pending} className="qs-composer-inline">
        <div className="qs-composer-extra">
          {pending && (
            <ConfirmInline
              message="Remove the existing answer options?"
              confirmLabel="Change format"
              focusOnMount="cancel"
              onCancel={() => setPending(null)}
              onConfirm={() => {
                onAnswer({ ...answer, response: pending });
                setPending(null);
              }}
            />
          )}
        </div>
      </AnimatedDisclosure>
      <AnimatedDisclosure
        open={!stem && answer.response.kind === 'multiple-choice'}
        className="qs-composer-inline"
      >
        <div className="qs-composer-extra">
          <QuestionSetResponseEditor answer={answer} onChange={onAnswer} showFormat={false} />
        </div>
      </AnimatedDisclosure>
      {!stem && answer.response.kind === 'calculation' && (
        <p className="qs-composer-inline px-2 text-xs text-ink-faint">Calculation</p>
      )}
      <AnimatedDisclosure open={!!panel} className="qs-composer-inline">
        <div className="qs-composer-extra">
          <QuestionComposerExtras
            panel={panel}
            answer={answer}
            onChange={onAnswer}
            session={session}
            nodeId={row.id}
            courseId={session.getSnapshot().draft!.content.courseId}
          />
        </div>
      </AnimatedDisclosure>
    </motion.div>
  );
}
