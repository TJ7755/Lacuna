import { useEffect, useRef } from 'react';
import type { EditorCardType } from '../../components/cards/CardTypePicker';

export function useCardEditorFocus(
  type: EditorCardType,
  shakeField: string | null,
  shakeNonce: number,
) {
  // Refs that drive a seamless Tab order through the quick-capture flow:
  // Front → Back → Save & add another → Add card, skipping the toolbars and tag input.
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLTextAreaElement>(null);
  const numericRef = useRef<HTMLInputElement>(null);
  const schemeRef = useRef<HTMLTextAreaElement>(null);
  const audioPromptRef = useRef<HTMLTextAreaElement>(null);
  const audioAnswerRef = useRef<HTMLTextAreaElement>(null);
  const audioEntryRef = useRef<HTMLButtonElement>(null);
  const saveAddRef = useRef<HTMLButtonElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  // Where Tab off the last text field should land: the "add another" button when it
  // exists (new cards), otherwise the primary save button.
  const focusSaveButton = () => (saveAddRef.current ?? saveRef.current)?.focus();

  useEffect(() => {
    if (!shakeField) return;
    const frame = requestAnimationFrame(() => {
      const target =
        shakeField === 'answer'
          ? numericRef.current
          : shakeField === 'scheme'
            ? schemeRef.current
            : shakeField === 'back'
              ? type === 'audio'
                ? audioAnswerRef.current
                : backRef.current
              : type === 'audio'
                ? audioEntryRef.current
                : frontRef.current;
      target?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [shakeField, shakeNonce, type]);

  return {
    frontRef,
    backRef,
    numericRef,
    schemeRef,
    audioPromptRef,
    audioAnswerRef,
    audioEntryRef,
    saveAddRef,
    saveRef,
    focusSaveButton,
  };
}

export type CardEditorFocus = ReturnType<typeof useCardEditorFocus>;
