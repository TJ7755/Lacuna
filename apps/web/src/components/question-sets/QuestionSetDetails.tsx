import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { QuestionSet } from '@lacuna/core/questions/questionSets';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { DialogHeader, DialogPanel } from '../ui/DialogPanel';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Field';
import { SettingsIcon } from '../ui/icons';
import { QuestionSetSettings } from './QuestionSetSettings';

export function QuestionSetDetails({
  content,
  onChange,
  disabled,
  invalid = false,
}: {
  content: QuestionSet;
  onChange: (content: QuestionSet) => void;
  disabled: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trap = useFocusTrap(open, { autoFocusSelector: 'input' });
  return (
    <>
      <button
        type="button"
        title="Set details"
        aria-label="Set details"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-ink/5"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <SettingsIcon width={20} height={20} />
      </button>
      <AnimatePresence>
        {open && (
          <DialogPanel
            label="Set details"
            trapRef={trap}
            className="max-w-xl"
            onBackdropClick={() => setOpen(false)}
            onKeyDown={(event) => {
              if (
                event.defaultPrevented ||
                event.nativeEvent.isComposing ||
                event.nativeEvent.keyCode === 229
              )
                return;
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
              }
            }}
          >
            <DialogHeader
              title="Set details"
              closeLabel="Close set details"
              onClose={() => setOpen(false)}
            />
            <fieldset
              disabled={disabled}
              className="overflow-y-auto p-6"
              style={{ maxHeight: '75vh' }}
            >
              <Field
                label="Name"
                error={invalid ? 'Give this set a title.' : undefined}
                className="mb-6"
              >
                <Input
                  value={content.title}
                  onChange={(event) => onChange({ ...content, title: event.target.value })}
                />
              </Field>
              <QuestionSetSettings content={content} onChange={onChange} />
              <div className="mt-6 flex justify-end">
                <Button onClick={() => setOpen(false)}>Done</Button>
              </div>
            </fieldset>
          </DialogPanel>
        )}
      </AnimatePresence>
    </>
  );
}
