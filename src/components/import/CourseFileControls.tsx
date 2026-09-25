import { useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { DownloadIcon, UploadIcon } from '../ui/icons';
import { useToast } from '../ui/Toast';
import { downloadTextFile } from '../../db/export';
import {
  buildCourseFile,
  decodeCourseFile,
  MAX_COURSE_FILE_BYTES,
  type CourseFile,
} from '../../db/courseFile';

export function CourseFileExportButton({
  courseId,
  name,
}: {
  courseId: string | null;
  name: string;
}) {
  const [saving, setSaving] = useState(false);
  const { notify } = useToast();

  async function save() {
    if (!courseId || saving) return;
    setSaving(true);
    try {
      const text = await buildCourseFile(courseId);
      const filename =
        name
          .replace(/[<>:"/\\|?*]/g, '-')
          .trim()
          .slice(0, 100) || 'Course';
      downloadTextFile(text, `${filename}.lacuna`, 'application/json');
      notify('Course file saved with media.', 'positive');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Could not save the course file.',
        'negative',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Button variant="primary" disabled={!courseId || saving} onClick={() => void save()}>
      <DownloadIcon width={18} height={18} />
      {saving ? 'Saving…' : 'Save course file'}
    </Button>
  );
}

export function CourseFileImportButton({
  onInspect,
  onReadStart,
  disabled,
}: {
  onInspect: (file: CourseFile) => Promise<void>;
  onReadStart: () => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const { notify } = useToast();

  async function inspect(file: File) {
    setReading(true);
    try {
      if (file.size > MAX_COURSE_FILE_BYTES)
        throw new Error('The course file exceeds the 100 MB limit.');
      await onInspect(await decodeCourseFile(await file.text()));
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Could not read the course file.',
        'negative',
      );
    } finally {
      setReading(false);
    }
  }

  return (
    <div className="mb-5">
      <input
        ref={input}
        type="file"
        accept=".lacuna"
        aria-label="Course file to import"
        className="hidden"
        disabled={disabled || reading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) {
            onReadStart();
            void inspect(file);
          }
        }}
      />
      <Button
        variant="secondary"
        disabled={disabled || reading}
        onClick={() => input.current?.click()}
      >
        <UploadIcon width={18} height={18} />
        {reading ? 'Reading…' : 'Choose course file'}
      </Button>
    </div>
  );
}
