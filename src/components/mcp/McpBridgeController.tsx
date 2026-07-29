import { useEffect, useState } from 'react';
import { useToast } from '../ui/Toast';
import { db } from '../../db/schema';
import { restoreCards, restoreCourse, restoreLesson, restoreSequence, type CardSnapshot, type CourseSnapshot, type LessonSnapshot, type SequenceSnapshot } from '../../db/repository';
import { GLOBAL_SCOPE_KEY } from '../../mcp/grants';
import type { McpConsentRequest } from '../../mcp/bridge/protocol';
import { attachMcpBridge } from '../../mcp/bridge/renderer';
import type { RecordedUndo } from '../../mcp/bridge/undoRegistry';
import { McpConsentPrompt } from './McpConsentPrompt';
import { resolveToolScopes } from '../../mcp/bridge/scopeResolver';

async function restoreUndo(undo: RecordedUndo): Promise<void> {
  if (undo.payload.kind === 'restoreCards') {
    await restoreCards(undo.payload.snapshot as CardSnapshot);
  } else if (undo.payload.kind === 'restoreCourse') {
    await restoreCourse(undo.payload.snapshot as CourseSnapshot);
  } else if (undo.payload.kind === 'restoreLesson') {
    await restoreLesson(undo.payload.snapshot as LessonSnapshot);
  } else {
    await restoreSequence(undo.payload.snapshot as SequenceSnapshot);
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
    const detachConsent = mcp.onConsentRequest((request) => setQueue((items) => [...items, request]));
    const detachNotice = mcp.onGrantNotice((notice) => {
      void courseLabel(notice.courseId).then((name) => {
        notify(`MCP read access granted for ${name}.`, 'neutral');
      });
    });
    const detachScope = mcp.onScopeResolutionRequest((request) => {
      void resolveToolScopes(request.input).then((outcome) => {
        mcp.replyScopeResolution(outcome.ok
          ? { id: request.id, ok: true, targets: outcome.targets }
          : { id: request.id, ok: false, error: outcome.error });
      }).catch(() => {
        mcp.replyScopeResolution({ id: request.id, ok: false, error: { kind: 'internal', message: 'Could not resolve the MCP tool scope.' } });
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
