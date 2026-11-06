import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ScopedCardSearchResult } from '@lacuna/core/db/search';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { CardContent } from '../cards/CardContent';
import { PillToggleGroup } from '../cards/PillToggleGroup';
import { AppLink as Link } from '../ui/AppLink';
import { buttonClassName } from '../ui/Button';
import { DialogHeader, DialogPanel } from '../ui/DialogPanel';
import { ArrowRightIcon, EditIcon } from '../ui/icons';
import { hitPath } from './searchPresentation';

export type CardSearchHit = ScopedCardSearchResult;

/** A read-only face of the stored card; previewing never records a review. */
export function SearchCardPreview({
  hit,
  onClose,
  onNavigate,
}: {
  hit: CardSearchHit;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const navigate = useNavigate();
  const viewPath = hit.lesson
    ? `/course/${hit.course.id}/lesson/${hit.lesson.id}`
    : `/course/${hit.course.id}`;
  return (
    <div
      className="flex min-h-0 flex-col"
      onKeyDown={(event) => {
        if (
          event.key === 'Enter' &&
          event.shiftKey &&
          !event.nativeEvent.isComposing &&
          event.nativeEvent.keyCode !== 229
        ) {
          event.preventDefault();
          event.stopPropagation();
          onNavigate();
          void navigate(hitPath(hit));
        }
      }}
    >
      <DialogHeader
        title="Card preview"
        description={hit.contextName}
        onClose={onClose}
        closeLabel="Close card preview"
      />
      <div className="min-h-0 overflow-y-auto px-6 py-5">
        <PillToggleGroup
          label="Card side"
          value={side}
          onChange={setSide}
          options={[
            { value: 'front', label: 'Question' },
            { value: 'back', label: 'Answer' },
          ]}
        />
        <div className="flex min-h-60 items-center justify-center py-8 text-center text-lg text-ink">
          <CardContent
            card={hit.card}
            side={side}
            className="w-full max-w-prose [&_audio]:mx-auto! [&_img]:mx-auto!"
          />
        </div>
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-6 py-4">
        <Link
          to={hitPath(hit)}
          onClick={onNavigate}
          aria-label="Edit card"
          title="Edit card (Shift+Enter)"
          className={buttonClassName('ghost', 'sm')}
        >
          <EditIcon width={18} height={18} />
        </Link>
        <Link to={viewPath} onClick={onNavigate} className={buttonClassName('primary')}>
          {hit.lesson ? 'View lesson' : 'View course'}
          <ArrowRightIcon />
        </Link>
      </footer>
    </div>
  );
}

export function SearchCardPreviewDialog(props: Parameters<typeof SearchCardPreview>[0]) {
  const trap = useFocusTrap(true, {
    autoFocusSelector: '[aria-pressed="true"]',
    returnFocus: false,
  });
  return (
    <DialogPanel
      label="Card preview"
      trapRef={trap}
      className="max-w-2xl"
      onBackdropClick={props.onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          props.onClose();
        }
      }}
    >
      <SearchCardPreview {...props} />
    </DialogPanel>
  );
}
