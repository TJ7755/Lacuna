// Full-page composer for creating and editing an Occlusion (a labelled diagram that
// derives ordinary front/back FSRS cards, one per masked region). Mirrors
// SequenceEditor's shape closely: the route decides create vs edit mode, a sticky
// action bar drives save/cancel, and deletion (edit mode only) uses the app's
// undo-toast idiom via DangerZoneSection. See design/arc6/plan.md §6.5 (chosen
// direction: D1 adapted) and design/arc6/mockups-occlusion.html.
// Route: course/:courseId/occlusion/new, course/:courseId/occlusion/:occlusionId/edit,
// and the lesson-scoped course/:courseId/lesson/:lessonId/occlusion/new variant.

import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { m as motion } from 'motion/react';
import { useCourse, useLesson, useOcclusion } from '../state/useCourseData';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { DangerZoneSection } from './settings/DangerZoneSection';
import { OcclusionCanvas, type OcclusionDrawTool, type DrawnRegionRect } from '../components/occlusion/OcclusionCanvas';
import { OcclusionRegionPane } from '../components/occlusion/OcclusionRegionPane';
import { ChevronLeftIcon } from '../components/ui/icons';
import { speedMultiplier, useMotionSpeed } from '../state/motionSpeed';
import { makeId } from '../db/schema';
import { generateCards } from '../db/occlusionGeneration';
import { resolveAssetUrl } from '../db/assetCache';
import { storeOcclusionDiagram } from '../db/occlusionImage';
import {
  createOcclusion,
  deleteOcclusion,
  restoreOcclusion,
  snapshotOcclusion,
  updateOcclusion,
  type OcclusionSnapshot,
} from '../db/occlusionRepository';
import type { EditorOriginState } from '../utils/editorOrigin';
import type { Occlusion, OcclusionRegion } from '../db/types';

export function OcclusionEditor() {
  const { occlusionId, courseId, lessonId } = useParams<{
    occlusionId?: string;
    courseId?: string;
    lessonId?: string;
  }>();
  const lessonMode = Boolean(lessonId);
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useToast();

  const course = useCourse(courseId);
  const lesson = useLesson(lessonId);
  const editing = Boolean(occlusionId);
  const occlusion = useOcclusion(occlusionId);

  const [name, setName] = useState('');
  const [assetHash, setAssetHash] = useState<string | null>(null);
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [regions, setRegions] = useState<OcclusionRegion[]>([]);
  const [tool, setTool] = useState<OcclusionDrawTool>('label');
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  // Seed the form from the occlusion being edited once it has loaded.
  useEffect(() => {
    if (loaded) return;
    if (!editing) {
      setLoaded(true);
      return;
    }
    if (occlusion) {
      setName(occlusion.name);
      setAssetHash(occlusion.assetHash);
      setRegions(occlusion.regions);
      setLoaded(true);
    }
  }, [editing, occlusion, loaded]);

  // Resolve the diagram's asset hash to a displayable object URL whenever it changes
  // (initial load, or a freshly uploaded/replaced diagram).
  useEffect(() => {
    if (!assetHash) {
      setAssetUrl(null);
      return;
    }
    let cancelled = false;
    void resolveAssetUrl(assetHash).then((url) => {
      if (!cancelled) setAssetUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [assetHash]);

  const lessonPath = `/course/${courseId}/lesson/${lessonId}`;
  const bankPath = `/course/${courseId}/bank`;
  const origin = (location.state as EditorOriginState | null)?.origin;
  const backPath = origin?.path ?? (lessonMode ? lessonPath : bankPath);
  const backLabel = origin?.label ?? (lessonMode ? lesson?.name : 'Question bank');

  // A draft Occlusion built from current form state, purely so the pure generation
  // module (never re-implemented here) can compute the live card-count preview.
  const draftOcclusion: Occlusion = useMemo(
    () => ({
      id: occlusion?.id ?? 'preview',
      courseId: courseId ?? '',
      primaryLessonId: lessonId ?? null,
      name: name.trim() || 'Untitled occlusion',
      assetHash: assetHash ?? '',
      regions,
      createdAt: occlusion?.createdAt ?? 0,
    }),
    [occlusion, courseId, lessonId, name, assetHash, regions],
  );
  const preview = useMemo(() => (loaded ? generateCards(draftOcclusion) : []), [loaded, draftOcclusion]);
  const labelCount = regions.filter((r) => r.role === 'label').length;
  const featureCount = regions.length - labelCount;

  if (
    (lessonMode ? course === undefined || lesson === undefined : course === undefined) ||
    (editing && occlusion === undefined && !loaded)
  ) {
    return <OcclusionEditorSkeleton />;
  }
  if (course === null) {
    return (
      <div className="p-10">
        <p className="mb-4 text-ink-soft">This course could not be found.</p>
        <Link to="/" className="text-accent underline">Back to dashboard</Link>
      </div>
    );
  }
  if (lessonMode && lesson === null) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-10">
        <p className="mb-4 text-ink-soft">This lesson could not be found.</p>
        <Link to={courseId ? `/course/${courseId}` : '/'} className="text-accent underline">
          {courseId ? 'Back to course' : 'Back to dashboard'}
        </Link>
      </motion.div>
    );
  }
  if (editing && occlusion === null) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-10">
        <p className="mb-4 text-ink-soft">This occlusion could not be found.</p>
        <Link to={backPath} className="text-accent underline">
          Back to {backLabel}
        </Link>
      </motion.div>
    );
  }

  const canSave = name.trim().length > 0 && assetHash !== null && regions.length > 0;

  function addRegion(rect: DrawnRegionRect) {
    const region: OcclusionRegion = {
      id: makeId(),
      role: tool === 'feature' ? 'feature' : 'label',
      shape: 'rectangle',
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
    };
    setRegions((prev) => [...prev, region]);
    setSelectedRegionId(region.id);
  }

  function updateRegion(id: string, patch: Partial<OcclusionRegion>) {
    setRegions((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function deleteRegion(id: string) {
    // Clear any feature region's pairing that pointed at the region being removed —
    // mirrors updateOcclusion's server-side cleanup, applied here too since a region
    // can be drawn, paired to, and deleted again before the occlusion is ever saved.
    setRegions((prev) =>
      prev
        .filter((r) => r.id !== id)
        .map((r) => (r.pairedRegionId === id ? { ...r, pairedRegionId: undefined } : r)),
    );
    setSelectedRegionId((current) => (current === id ? null : current));
  }

  // Replacing the diagram of an occlusion that already exists regenerates every card
  // it owns (§6.4), so warn before applying the new file. A first-time upload (new
  // occlusion, or an edit that never had a diagram) has nothing to regenerate yet.
  function handleFileSelected(file: File) {
    if (editing && assetHash) {
      setPendingFile(file);
      setConfirmingReplace(true);
      return;
    }
    void applyFile(file);
  }

  function confirmReplace() {
    setConfirmingReplace(false);
    if (pendingFile) void applyFile(pendingFile);
    setPendingFile(null);
  }

  function cancelReplace() {
    setConfirmingReplace(false);
    setPendingFile(null);
  }

  async function applyFile(file: File) {
    setUploading(true);
    try {
      const asset = await storeOcclusionDiagram(file);
      setAssetHash(asset.hash);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not add that image.', 'negative');
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!canSave || !courseId || !assetHash) return;
    setSaving(true);
    try {
      if (editing && occlusion) {
        await updateOcclusion({ ...occlusion, name: name.trim(), assetHash, regions });
        notify('Occlusion updated.', 'positive');
      } else {
        await createOcclusion(courseId, lessonId ?? null, name, assetHash, regions);
        notify('Occlusion added.', 'positive');
      }
      navigate(backPath);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 pb-10 pt-8 md:px-10">
      {/* Breadcrumb */}
      <nav className="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-ink-faint">
        <Link to={`/course/${courseId}`} className="transition-colors hover:text-ink">
          {course?.name}
        </Link>
        <ChevronRight />
        <Link to={backPath} className="transition-colors hover:text-ink">
          {backLabel}
        </Link>
        <ChevronRight />
        <span className="text-ink-soft">{editing ? 'Edit occlusion' : 'New occlusion'}</span>
      </nav>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16 * m, ease: [0.16, 1, 0.3, 1] }}
      >
        <header className="relative mb-8 overflow-hidden rounded-2xl border border-line bg-surface p-6 md:p-8">
          <div className="absolute inset-0 bg-dot-grid opacity-30" aria-hidden="true" />
          <div className="relative">
            <Link
              to={backPath}
              className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink"
            >
              <ChevronLeftIcon width={16} height={16} />
              Back
            </Link>
            <h1 className="font-display text-4xl tracking-tight md:text-5xl">
              {editing ? 'Edit occlusion' : 'New occlusion'}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-ink-soft">
              Mask parts of a diagram to test recall — one card per box, none of it typed by hand.
            </p>
          </div>
        </header>

        <div className="flex flex-col gap-5">
          <div>
            <div className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-faint">Name</div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The plant cell"
              className="w-full rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-ink outline-none focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-line bg-surface min-[760px]:grid-cols-[minmax(0,1fr)_260px]">
            <OcclusionCanvas
              assetUrl={assetUrl}
              alt={name.trim() || 'Diagram'}
              regions={regions}
              selectedRegionId={selectedRegionId}
              tool={tool}
              onToolChange={setTool}
              onRegionDrawn={addRegion}
              onSelectRegion={setSelectedRegionId}
              onFileSelected={handleFileSelected}
              uploading={uploading}
              confirmingReplace={confirmingReplace}
              onConfirmReplace={confirmReplace}
              onCancelReplace={cancelReplace}
            />
            <OcclusionRegionPane
              regions={regions}
              selectedRegionId={selectedRegionId}
              onSelect={setSelectedRegionId}
              onDelete={deleteRegion}
              onUpdate={updateRegion}
            />
          </div>

          {/* Live generated-card count, following the sequence editor's precedent. */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
              {preview.length} card{preview.length === 1 ? '' : 's'} will be generated
            </span>
            {regions.length > 0 && (
              <span className="text-ink-faint">
                {labelCount} label, {featureCount} feature — read-only in the card editor
              </span>
            )}
          </div>

          {editing && occlusion && (
            <DangerZoneSection
              entityLabel="occlusion"
              entityName={occlusion.name}
              description="Deletes this occlusion and every card it generated."
              snapshot={() => snapshotOcclusion(occlusion.id)}
              onDelete={() => deleteOcclusion(occlusion.id)}
              onRestore={(snap) => restoreOcclusion(snap as OcclusionSnapshot)}
              onDeleted={() => navigate(backPath)}
            />
          )}
        </div>
      </motion.div>

      {/* Sticky action bar */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.25 * m, ease: [0.16, 1, 0.3, 1] }}
        role="region"
        aria-label="Occlusion editor actions"
        className="pointer-events-none sticky bottom-0 z-30 -mx-6 mt-8 bg-gradient-to-t from-paper via-paper to-transparent px-6 pb-5 pt-12 md:-mx-10 md:px-10"
      >
        <div className="pointer-events-auto ml-auto flex w-fit items-center gap-3">
          <Button variant="ghost" onClick={() => navigate(backPath)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave || saving}>
            {editing ? 'Save changes' : 'Add occlusion'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function OcclusionEditorSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-6 pb-10 pt-8 md:px-10">
      <div className="mb-6 h-4 w-24 animate-pulse rounded bg-ink/10" />
      <div className="mb-8 rounded-2xl border border-line bg-surface p-6">
        <div className="mb-1 h-3 w-20 animate-pulse rounded bg-ink/10" />
        <div className="h-10 w-48 animate-pulse rounded bg-ink/10" />
      </div>
      <div className="flex flex-col gap-5">
        <div className="h-10 w-full animate-pulse rounded-lg bg-ink/10" />
        <div className="h-64 w-full animate-pulse rounded-lg bg-ink/10" />
      </div>
    </div>
  );
}

function ChevronRight() {
  return <span className="text-ink-faint/60">/</span>;
}
