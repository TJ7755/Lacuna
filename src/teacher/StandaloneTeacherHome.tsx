import { useEffect, useState, type ComponentType } from 'react';
import { SectionCard } from '../components/ui/SectionCard';
import { buttonClassName } from '../components/ui/buttonStyles';
import { TeacherHomeView } from './TeacherHomeView';
import type { ConnectedGapsCourse } from './connectionStore';

export function StandaloneTeacherHome() {
  const [Courses, setCourses] = useState<ComponentType<{
    onPrepareKey(shareId: string): void;
    keySetupOpen: boolean;
    onOpenClass(course: ConnectedGapsCourse): void;
  }> | null>(null);
  const [courseError, setCourseError] = useState(false);
  const [Panel, setPanel] = useState<ComponentType<{
    onClose(): void;
    initialCourse?: string;
  }> | null>(null);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [Report, setReport] = useState<ComponentType<{
    course: ConnectedGapsCourse;
    onClose(): void;
  }> | null>(null);
  const [reportCourse, setReportCourse] = useState<ConnectedGapsCourse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void import('./TeacherCourses').then(
      (module) => {
        if (active) setCourses(() => module.TeacherCourses);
      },
      () => {
        if (active) setCourseError(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function openKeys(shareId = '') {
    setSelectedCourse(shareId);
    setLoading(true);
    setError(null);
    try {
      const { TeacherKeySetup } = await import('./TeacherKeySetup');
      setPanel(() => TeacherKeySetup);
    } catch {
      setError('Could not open teacher key setup. Reload the page and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function openClass(course: ConnectedGapsCourse) {
    setLoading(true);
    setError(null);
    try {
      const { TeacherClassReports } = await import('./TeacherClassReports');
      setReportCourse(course);
      setReport(() => TeacherClassReports);
    } catch {
      setError('Could not open the class workspace. Reload Gaps and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <TeacherHomeView>
      {Courses ? (
        <Courses
          onPrepareKey={(shareId) => void openKeys(shareId)}
          keySetupOpen={Panel !== null || Report !== null || loading}
          onOpenClass={(course) => void openClass(course)}
        />
      ) : courseError ? (
        <SectionCard>
          <p role="alert">Could not open your courses. Reload Gaps to try again.</p>
          <button
            type="button"
            className={`${buttonClassName('secondary')} mt-3`}
            onClick={() => window.location.reload()}
          >
            Reload Gaps
          </button>
        </SectionCard>
      ) : (
        <p role="status" className="text-ink-soft">
          Opening courses…
        </p>
      )}
      {Report && reportCourse ? (
        <Report
          key={reportCourse.shareId}
          course={reportCourse}
          onClose={() => {
            setReport(null);
            setReportCourse(null);
          }}
        />
      ) : Panel ? (
        <Panel initialCourse={selectedCourse} onClose={() => setPanel(null)} />
      ) : (
        <SectionCard aria-labelledby="teacher-keys-heading">
          <h2 id="teacher-keys-heading" className="font-display text-2xl">
            Teacher keys
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-ink-soft">
            Prepare a key for a published course, save its encrypted recovery file, or restore a key
            you already have. This does not connect the course or start collecting results.
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-negative">
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => void openKeys()}
            className={`${buttonClassName('secondary')} mt-5`}
          >
            {loading ? 'Opening key setup…' : 'Set up or recover a teacher key'}
          </button>
        </SectionCard>
      )}
    </TeacherHomeView>
  );
}
