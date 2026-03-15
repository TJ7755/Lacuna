/**
 * ImageOcclusionForm — form fields for creating/editing an image occlusion card.
 *
 * Wraps OcclusionEditor and relays changes to the parent via `onChange`.
 * Validation messages are passed as a prop from the parent CardEditor.
 */

import type { OcclusionData } from '../../types';
import { OcclusionEditor } from './OcclusionEditor';
import { UI } from '../../ui-strings';
import styles from './CardEditor.module.css';

interface ImageOcclusionFormProps {
  imageUrl: string;
  occlusionData: OcclusionData;
  onChange: (imageUrl: string, occlusionData: OcclusionData) => void;
  validationError?: string | null;
}

export function ImageOcclusionForm({
  imageUrl,
  occlusionData,
  onChange,
  validationError,
}: ImageOcclusionFormProps) {
  return (
    <div className={styles.field}>
      <OcclusionEditor
        initialImageUrl={imageUrl !== '' ? imageUrl : undefined}
        initialOcclusionData={
          occlusionData.length > 0 ? occlusionData : undefined
        }
        onChange={onChange}
      />
      {occlusionData.length > 0 && (
        <p className={styles.hint}>
          {UI.cards.occlusionRegionCount(occlusionData.length)}
        </p>
      )}
      {validationError && (
        <p className={styles.fieldError}>{validationError}</p>
      )}
    </div>
  );
}
