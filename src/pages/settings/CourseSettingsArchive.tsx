import { useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { ArchiveCourseDialog } from '../../components/dashboard/CourseActions';
import { Button } from '../../components/ui/Button';
import { SectionCard } from '../../components/ui/SectionCard';
import { useToast } from '../../components/ui/Toast';
import type { Course } from '../../db/types';
import { updateCourse } from '../../db/courseRepository';

export function CourseSettingsArchive({ course }: { course: Course }) {
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const { notify } = useToast();

  return (
    <>
      <SectionCard className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-ink">Archive course</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Keep your content and history out of active study.
          </p>
        </div>
        <Button ref={trigger} variant="secondary" onClick={() => setConfirming(true)}>
          Archive course
        </Button>
      </SectionCard>
      <AnimatePresence>
        {confirming && (
          <ArchiveCourseDialog
            course={course}
            onClose={() => {
              setConfirming(false);
              trigger.current?.focus();
            }}
            onArchived={() => {
              notify(`${course.name} archived`, 'positive', {
                actionLabel: 'Undo',
                onAction: () => {
                  void updateCourse(course.id, { archived: false }).catch(() => {
                    notify(`Could not restore ${course.name}`, 'negative');
                  });
                },
              });
              void navigate('/');
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
