import { CardPreview, type PreviewSide } from '../../components/cards/CardPreview';
import { CardEditorActions } from '../../components/cards/CardEditorActions';
import type { CardEditorDraft } from './useCardEditorDraft';
import type { CardEditorFocus } from './useCardEditorFocus';
import type { CardEditorSave } from './useCardEditorSave';

export function CardAuthoringPreview({
  draft,
  focus,
  save,
  editing,
  previewSide,
  setPreviewSide,
  isTouchMode,
  onCancel,
}: {
  draft: CardEditorDraft;
  focus: CardEditorFocus;
  save: CardEditorSave;
  editing: boolean;
  previewSide: PreviewSide;
  setPreviewSide: (side: PreviewSide) => void;
  isTouchMode: boolean;
  onCancel: () => void;
}) {
  const { type, front, back } = draft.values;
  const { isStructured, showSaved, canSave, saving, addedCount, handleSave } = save;
  const { saveAddRef, saveRef } = focus;
  return (
    <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-6 lg:col-span-2">
      <CardPreview
        type={type === 'numeric' || type === 'working' || type === 'audio' ? 'front_back' : type}
        front={front}
        back={back}
        side={previewSide}
        onSideChange={setPreviewSide}
        canFlip={!isStructured}
        saved={showSaved}
      />
      <CardEditorActions
        editing={editing}
        canSave={canSave && !saving}
        addedCount={addedCount}
        isTouchMode={isTouchMode}
        onCancel={onCancel}
        onSave={(andAnother) => void handleSave(andAnother)}
        saveAddRef={saveAddRef}
        saveRef={saveRef}
      />
    </div>
  );
}
