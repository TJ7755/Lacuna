import { useEffect, useRef, useState, type ComponentType } from 'react';
import { SectionCard } from '../components/ui/SectionCard';
import { buttonClassName } from '../components/ui/buttonStyles';
import { TeacherHomeView } from './TeacherHomeView';
import type { ConnectedGapsCourse } from './connectionStore';

export function StandaloneTeacherHome() {
  const [Courses, setCourses] = useState<ComponentType<{
    onPrepareKey(course: ConnectedGapsCourse): void;
    keySetupOpen: boolean;
    onOpenClass(course: ConnectedGapsCourse): void;
  }> | null>(null);
  const [courseError, setCourseError] = useState(false);
  const [Panel, setPanel] = useState<ComponentType<{
    onClose(): void;
    initialCourse?: string;
    courseName?: string;
    initialMode?: 'create' | 'restore' | 'download';
    onContinue?(): void;
  }> | null>(null);
  const [setupCourse, setSetupCourse] = useState<ConnectedGapsCourse | null>(null);
  const [Report, setReport] = useState<ComponentType<{
    course: ConnectedGapsCourse;
    onClose(): void;
    onPrepareKey?(): void;
    initialTask?: 'results' | 'invite';
  }> | null>(null);
  const [initialTask, setInitialTask] = useState<'results' | 'invite'>('results');
  const [reportCourse, setReportCourse] = useState<ConnectedGapsCourse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusWorkspace = useRef(false);

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

  useEffect(() => {
    if (focusWorkspace.current && !loading) {
      document.querySelector<HTMLElement>('[data-teacher-content] h2')?.focus();
      focusWorkspace.current = false;
    }
  }, [Panel, Report, loading]);

  async function openKeys(course: ConnectedGapsCourse | null = null) {
    setLoading(true);
    setError(null);
    try {
      const { TeacherKeySetup } = await import('./TeacherKeySetup');
      setSetupCourse(course);
      setReport(null);
      setPanel(() => TeacherKeySetup);
      focusWorkspace.current = true;
    } catch {
      setError('Could not open class setup. Check your connection, then try again.');
    } finally {
      setLoading(false);
    }
  }

  async function openClass(course: ConnectedGapsCourse, task: 'results' | 'invite' = 'results') {
    setLoading(true);
    setError(null);
    try {
      const { TeacherClassReports } = await import('./TeacherClassReports');
      setReportCourse(course);
      setInitialTask(task);
      setPanel(null);
      setReport(() => TeacherClassReports);
      focusWorkspace.current = true;
    } catch {
      setError('Could not open the class workspace. Check your connection, then try again.');
    } finally {
      setLoading(false);
    }
  }

  function home() {
    setPanel(null);
    setReport(null);
    setReportCourse(null);
    setSetupCourse(null);
    focusWorkspace.current = true;
  }

  return (
    <TeacherHomeView>
      <div data-teacher-content>
        {Report && reportCourse ? (
          <Report
            key={reportCourse.shareId}
            course={reportCourse}
            initialTask={initialTask}
            onClose={home}
            onPrepareKey={() => void openKeys(reportCourse)}
          />
        ) : Panel ? (
          <Panel
            key={setupCourse?.shareId ?? 'recovery'}
            courseName={setupCourse?.courseName}
            initialCourse={setupCourse?.shareId}
            initialMode={setupCourse ? 'create' : 'restore'}
            onClose={home}
            onContinue={setupCourse ? () => void openClass(setupCourse, 'invite') : undefined}
          />
        ) : Courses ? (
          <>
            <Courses
              onPrepareKey={(course) => void openKeys(course)}
              keySetupOpen={loading}
              onOpenClass={(course) => void openClass(course)}
            />
            <details className="mt-6 text-sm text-ink-soft">
              <summary>Recover a class or save another recovery file</summary>
              <p className="mt-3 max-w-2xl">
                Use the separate teacher recovery file if this browser has lost its key. You will
                still need to connect the course to open its reports.
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={() => void openKeys()}
                className={`${buttonClassName('secondary')} mt-3`}
              >
                Open recovery options
              </button>
            </details>
          </>
        ) : courseError ? (
          <SectionCard>
            <p role="alert">Could not open your classes. Reload Gaps to try again.</p>
            <button
              type="button"
              className={`${buttonClassName('secondary')} mt-3`}
              onClick={() => window.location.reload()}
            >
              Reload Gaps
            </button>
          </SectionCard>
        ) : (
          <p role="status">Opening classes…</p>
        )}
        {loading && (
          <p role="status" className="mt-4 text-sm text-ink-soft">
            Opening class workspace…
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-negative">
            {error}
          </p>
        )}
      </div>
    </TeacherHomeView>
  );
}
