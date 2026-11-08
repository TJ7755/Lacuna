import { useState } from 'react';
import type { Lesson } from '@lacuna/core/db/types';
import { setLessonSpellingRequirement } from '../../db/lessonRepository';
import { Toggle } from '../ui/Toggle';
import { useToast } from '../ui/Toast';

export function LessonSpellingControl({ lesson }: { lesson: Lesson }) {
  const { notify } = useToast();
  const [saving, setSaving] = useState(false);

  async function change(required: boolean) {
    setSaving(true);
    try {
      await setLessonSpellingRequirement(lesson.courseId, lesson.id, required);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Could not save spelling requirements.',
        'negative',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 border-t border-line pt-4">
      <Toggle
        label="Require correct spelling"
        checked={lesson.requireCorrectSpelling === true}
        disabled={saving}
        onChange={(required) => void change(required)}
      />
    </div>
  );
}
