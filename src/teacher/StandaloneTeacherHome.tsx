import { useState, type ComponentType } from 'react';
import { SectionCard } from '../components/ui/SectionCard';
import { buttonClassName } from '../components/ui/buttonStyles';
import { TeacherEmptyState, TeacherHomeView } from './TeacherHomeView';

export function StandaloneTeacherHome() {
  const [Panel, setPanel] = useState<ComponentType<{ onClose(): void }> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openKeys() {
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

  return (
    <TeacherHomeView>
      <TeacherEmptyState standalone />
      {Panel ? (
        <Panel onClose={() => setPanel(null)} />
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
