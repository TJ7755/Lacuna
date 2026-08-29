import { useEffect, useState } from 'react';
import { useToast } from '../ui/Toast';
import { db } from '../../db/schema';
import {
  restoreCards,
  restoreCourse,
  restoreLesson,
  restoreSequence,
  type CardSnapshot,
  type CourseSnapshot,
  type LessonSnapshot,
  type SequenceSnapshot,
} from '../../db/repository';
import { restoreOcclusion, type OcclusionSnapshot } from '../../db/occlusionRepository';
import {
  restoreConcept,
  restoreQuestion,
  type ConceptSnapshot,
  type QuestionSnapshot,
} from '../../questions/repository';
import { agentMemoryRepository, type DeletedAgentMemory } from '../../db/agentMemoryRepository';
import { GLOBAL_SCOPE_KEY } from '../../mcp/grants';
import type { McpConsentRequest } from '../../mcp/bridge/protocol';
import { attachMcpBridge } from '../../mcp/bridge/renderer';
import type { RecordedUndo } from '../../mcp/bridge/undoRegistry';
import { McpConsentPrompt } from './McpConsentPrompt';
import { resolveToolScopes } from '../../mcp/bridge/scopeResolver';

async function restoreUndo(undo: RecordedUndo): Promise<void> {
  const { kind, snapshot } = undo.payload;
  switch (kind) {
    case 'restoreCards':
      await restoreCards(snapshot as CardSnapshot);
      return;
    case 'restoreCourse':
      await restoreCourse(snapshot as CourseSnapshot);
      return;
    case 'restoreLesson':
      await restoreLesson(snapshot as LessonSnapshot);
      return;
    case 'restoreSequence':
      await restoreSequence(snapshot as SequenceSnapshot);
      return;
    case 'restoreOcclusion':
      await restoreOcclusion(snapshot as OcclusionSnapshot);
      return;
    case 'restoreConcept':
      await restoreConcept(snapshot as ConceptSnapshot);
      return;
    case 'restoreQuestion':
      await restoreQuestion(snapshot as QuestionSnapshot);
      return;
    case 'restoreAgentMemory':
      await agentMemoryRepository.restore(snapshot as DeletedAgentMemory);
      return;
    default: {
      const unhandledKind: never = kind;
      throw new Error(`Unsupported MCP Undo kind: ${String(unhandledKind)}`);
    }
  }
}

async function courseLabel(courseId: string): Promise<string> {
  if (courseId === GLOBAL_SCOPE_KEY) return 'all Lacuna data';
  return (await db.courses.get(courseId))?.name ?? `course ${courseId}`;
}

export function McpBridgeController() {
  const { notify } = useToast();
  const [queue, setQueue] = useState<McpConsentRequest[]>([]);
  const [label, setLabel] = useState('this course');
  const current = queue[0];

  useEffect(() => {
    if (!current) return;
    void courseLabel(current.courseId).then(setLabel);
  }, [current]);

  useEffect(() => {
    const mcp = window.electronAPI?.mcp;
    if (!mcp) return;
    const detachBridge = attachMcpBridge({
      onUndoAvailable: (undo) => {
        notify(`MCP action ${undo.toolName} completed.`, 'neutral', {
          actionLabel: 'Undo',
          onAction: () => {
            void restoreUndo(undo)
              .then(() => notify('MCP action undone.', 'positive'))
              .catch(() => notify('Could not undo the MCP action.', 'negative'));
          },
        });
      },
    });
    const detachConsent = mcp.onConsentRequest((request) =>
      setQueue((items) => [...items, request]),
    );
    const detachNotice = mcp.onGrantNotice((notice) => {
      void courseLabel(notice.courseId).then((name) => {
        notify(`${notice.client?.name ?? 'MCP'} read access granted for ${name}.`, 'neutral');
      });
    });
    const detachScope = mcp.onScopeResolutionRequest((request) => {
      void resolveToolScopes(request.input, request.tool)
        .then((outcome) => {
          mcp.replyScopeResolution(
            outcome.ok
              ? { id: request.id, ok: true, targets: outcome.targets }
              : { id: request.id, ok: false, error: outcome.error },
          );
        })
        .catch(() => {
          mcp.replyScopeResolution({
            id: request.id,
            ok: false,
            error: { kind: 'internal', message: 'Could not resolve the MCP tool scope.' },
          });
        });
    });
    return () => {
      detachBridge?.();
      detachConsent();
      detachNotice();
      detachScope();
    };
  }, [notify]);

  if (!current) return null;
  return (
    <McpConsentPrompt
      request={current}
      courseName={label}
      onDecision={(approved) => {
        window.electronAPI?.mcp?.replyConsent({ id: current.id, approved });
        setQueue((items) => items.slice(1));
      }}
    />
  );
}
