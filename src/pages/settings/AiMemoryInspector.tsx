import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import {
  agentMemoryRepository,
  type AgentMemoryRepository,
  type DeletedAgentMemory,
} from '../../db/agentMemoryRepository';
import { db } from '../../db/schema';
import type { AgentMemory, AgentMemoryReference } from '../../db/types';
import { Button } from '../../components/ui/Button';
import { ConfirmInline } from '../../components/ui/ConfirmInline';
import { TrashIcon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/Toast';
import { aiEntityExists } from '../../ai/entityAvailability';
import { SettingsSubsectionHeading } from './SettingsSectionHeading';

interface InspectorData {
  memories: AgentMemory[];
  unavailable: Set<string>;
  courseNames: Map<string, string>;
}

function referenceKey(memoryId: string, reference: AgentMemoryReference): string {
  return `${memoryId}:${reference.kind}:${reference.id}`;
}

export function AiMemoryInspector({
  repository = agentMemoryRepository,
}: {
  repository?: AgentMemoryRepository;
}) {
  const { notify } = useToast();
  const [query, setQuery] = useState('');
  const [includeExpired, setIncludeExpired] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const data = useLiveQuery<InspectorData>(async () => {
    const memories = await repository.search({
      scope: { kind: 'all' },
      query,
      includeExpired,
    });
    const unavailable = new Set<string>();
    const courseNames = new Map<string, string>();
    for (const memory of memories) {
      if (memory.courseId !== null && !courseNames.has(memory.courseId)) {
        const course = await db.courses.get(memory.courseId);
        courseNames.set(memory.courseId, course?.name ?? 'Unavailable Course');
      }
      for (const reference of memory.references) {
        if (!(await aiEntityExists(reference))) {
          unavailable.add(referenceKey(memory.id, reference));
        }
      }
    }
    return { memories, unavailable, courseNames };
  }, [repository, query, includeExpired]);

  async function save(memory: AgentMemory) {
    try {
      await repository.update(memory.id, { content: draft });
      setEditingId(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not update the memory.', 'negative');
    }
  }

  async function setStatus(memory: AgentMemory, status: AgentMemory['status']) {
    try {
      await repository.update(memory.id, { status });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not update the memory.', 'negative');
    }
  }

  async function remove(memory: AgentMemory) {
    try {
      const deleted = await repository.delete(memory.id);
      setConfirmDeleteId(null);
      notify('Memory deleted.', 'neutral', {
        actionLabel: 'Undo',
        onAction: () => void restore(deleted),
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not delete the memory.', 'negative');
    }
  }

  async function restore(deleted: DeletedAgentMemory) {
    try {
      await repository.restore(deleted);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not restore the memory.', 'negative');
    }
  }

  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <SettingsSubsectionHeading className="text-sm font-medium text-ink">
            Teaching memory
          </SettingsSubsectionHeading>
          <p className="mt-1 text-xs leading-5 text-ink-faint">
            Inspect and correct what the AI retains about how you learn.
          </p>
        </div>
        <div className="flex min-w-0 max-w-64 flex-1 flex-col items-end gap-2">
          <label className="w-full text-xs text-ink-soft">
            <span className="sr-only">Search teaching memory</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search memory"
              maxLength={1_000}
              className="min-h-10 w-full rounded-lg border border-line-strong bg-paper px-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent"
            />
          </label>
          <label className="inline-flex min-h-8 items-center gap-2 text-xs text-ink-soft">
            <input
              type="checkbox"
              checked={includeExpired}
              onChange={(event) => setIncludeExpired(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Include expired
          </label>
        </div>
      </div>

      {!data ? (
        <p className="mt-4 text-sm text-ink-faint">Loading memory…</p>
      ) : data.memories.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-line px-4 py-3 text-sm text-ink-faint">
          No teaching memory found.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {data.memories.map((memory) => (
            <article key={memory.id} className="rounded-xl border border-line bg-paper px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    {memory.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] text-accent"
                      >
                        {tag}
                      </span>
                    ))}
                    <span className="text-[0.65rem] text-ink-faint">
                      {memory.courseId === null
                        ? 'Global'
                        : (data.courseNames.get(memory.courseId) ?? 'Unavailable Course')}
                      {' · '}
                      {memory.basis.replace('-', ' ')}
                    </span>
                  </div>
                  {editingId === memory.id ? (
                    <textarea
                      aria-label="Correct memory"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      maxLength={8_000}
                      rows={3}
                      className="w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-accent"
                    />
                  ) : (
                    <p className="text-sm leading-6 text-ink">{memory.content}</p>
                  )}
                  {memory.references.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Memory references">
                      {memory.references.map((reference) => {
                        const unavailable = data.unavailable.has(
                          referenceKey(memory.id, reference),
                        );
                        return (
                          <li
                            key={`${reference.kind}:${reference.id}`}
                            className="rounded-md bg-surface-raised px-2 py-1 text-xs text-ink-soft"
                          >
                            {reference.label}
                            {unavailable ? ' · Unavailable' : ''}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <select
                  aria-label={`Status for ${memory.content}`}
                  value={memory.status}
                  onChange={(event) =>
                    void setStatus(memory, event.target.value as AgentMemory['status'])
                  }
                  className="min-h-10 rounded-lg border border-line bg-surface px-2 text-xs text-ink"
                >
                  <option value="active">Active</option>
                  <option value="uncertain">Uncertain</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
              <div className="mt-3 flex min-h-11 items-center justify-end gap-2 border-t border-line pt-2">
                {confirmDeleteId === memory.id ? (
                  <ConfirmInline
                    message="Delete?"
                    onConfirm={() => void remove(memory)}
                    onCancel={() => setConfirmDeleteId(null)}
                  />
                ) : editingId === memory.id ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!draft.trim()}
                      onClick={() => void save(memory)}
                    >
                      Save correction
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(memory.id);
                        setDraft(memory.content);
                      }}
                    >
                      Correct
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete memory: ${memory.content}`}
                      onClick={() => setConfirmDeleteId(memory.id)}
                    >
                      <TrashIcon width={15} height={15} />
                    </Button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
