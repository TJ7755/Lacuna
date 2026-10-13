import { FileTextIcon, FolderIcon, GridIcon, FlagIcon, TagIcon } from '../ui/icons';
import { GeneratedCardBadge } from '../cards/GeneratedCardBadge';
import { memo } from 'react';
import { HighlightedText, hasTextMatch, matchPreview, type SearchHit } from './searchPresentation';

/** The same matched content and ownership labels in both search surfaces. */
export const SearchResultContent = memo(function SearchResultContent({
  hit,
  query,
  compact = false,
}: {
  hit: SearchHit;
  query: string;
  compact?: boolean;
}) {
  const max = compact ? 90 : 140;
  const titleClass = compact ? 'truncate text-sm text-ink' : 'break-words text-sm text-ink';
  const secondaryClass = compact
    ? 'truncate text-xs text-ink-faint'
    : 'break-words text-sm text-ink-faint';
  if (hit.kind === 'course' || hit.kind === 'lesson' || hit.kind === 'note') {
    const Icon =
      hit.kind === 'course' ? GridIcon : hit.kind === 'lesson' ? FolderIcon : FileTextIcon;
    const title =
      hit.kind === 'course'
        ? hit.course.name
        : hit.kind === 'lesson'
          ? hit.lesson.name
          : hit.note.name;
    const subtitle =
      hit.kind === 'course'
        ? 'Course'
        : hit.kind === 'lesson'
          ? hit.course.name
          : `${hit.course.name} · ${hit.lesson.name}`;
    const content =
      hit.kind === 'course'
        ? hit.course.description
        : hit.kind === 'lesson'
          ? (hit.lesson.description ?? '')
          : hit.note.content;
    return (
      <>
        <span
          className={`grid flex-none place-items-center rounded-lg bg-accent-soft text-accent-ink ${compact ? 'h-7 w-7' : 'h-9 w-9'}`}
        >
          <Icon width={compact ? 14 : 16} height={compact ? 14 : 16} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={titleClass}>
            <HighlightedText text={matchPreview(title, query, max)} query={query} />
          </span>
          <span className="truncate text-xs text-ink-faint">
            <HighlightedText text={subtitle} query={query} />
          </span>
          {hasTextMatch(content, query) && (
            <span className={secondaryClass}>
              <HighlightedText text={matchPreview(content, query, max)} query={query} />
            </span>
          )}
        </span>
      </>
    );
  }
  const question = hit.kind === 'question' ? hit.question : null;
  const card = hit.kind === 'card' ? hit.card : null;
  const title = card
    ? card.front
    : question?.kind === 'fixed'
      ? question.prompt || question.name
      : question!.name;
  const explanation = card
    ? card.back
    : question?.kind === 'fixed'
      ? question.explanation
      : question!.generatorKey;
  const tags = card?.tags ?? question?.tags ?? [];
  return (
    <>
      {compact && question && (
        <span className="grid h-7 w-7 flex-none place-items-center rounded-md bg-accent-soft text-accent-ink">
          <FileTextIcon width={14} height={14} />
        </span>
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={titleClass}>
          <HighlightedText
            text={matchPreview(title, query, max) || '(empty front)'}
            query={query}
          />
        </span>
        {question?.kind === 'fixed' &&
          question.name !== title &&
          hasTextMatch(question.name, query) && (
            <span className={secondaryClass}>
              <HighlightedText text={matchPreview(question.name, query, max)} query={query} />
            </span>
          )}
        {explanation.trim() && (!compact || hasTextMatch(explanation, query)) && (
          <span className={secondaryClass}>
            <HighlightedText text={matchPreview(explanation, query, max)} query={query} />
          </span>
        )}
        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
          <span>
            <HighlightedText text={hit.contextName} query={query} />
          </span>
          {question && (
            <span className={compact ? '' : 'rounded-lg border border-line px-2 py-0.5'}>
              Question
            </span>
          )}
          {question?.kind === 'generated' && <span>Generated family</span>}
          {card?.flagged && !compact && (
            <FlagIcon width={12} height={12} className="text-accent-ink" />
          )}
          {tags.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <TagIcon width={12} height={12} />
              <HighlightedText text={tags.join(', ')} query={query} />
            </span>
          )}
          {card?.sequenceItemId !== undefined && card?.sequenceItemId !== null && (
            <GeneratedCardBadge kind="sequence" />
          )}
          {card?.occlusionRegionId !== undefined && card?.occlusionRegionId !== null && (
            <GeneratedCardBadge kind="occlusion" />
          )}
        </span>
      </span>
    </>
  );
});
