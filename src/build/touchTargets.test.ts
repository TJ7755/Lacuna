import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// docs/spec/accessibility.md: every interactive element meets a 44px minimum target.
// These files once shipped 32px or 36px controls; none of their sizing classes may
// fall below `h-11`/`w-11` (44px) again.
const CONTROL_FILES = [
  'src/components/ui/ConfirmInline.tsx',
  'src/components/learn/PomodoroTimer.tsx',
  'src/components/ui/KeyHints.tsx',
  'src/components/course/PracticeNodeEditor.tsx',
  'src/components/course/NewCourseForm.tsx',
  'src/components/course/AssessmentDetailSheet.tsx',
  'src/components/course/AssessmentEditorDialog.tsx',
  'src/components/cards/LinkCardsDialog.tsx',
  'src/components/cards/CardEditOverlay.tsx',
  'src/components/sequences/ScriptPasteImport.tsx',
  'src/components/items/BatchAuthoringPromptDialog.tsx',
  'src/components/notes/AnnotatedNoteContent.tsx',
  'src/components/occlusion/OcclusionRegionPane.tsx',
  'src/components/occlusion/OcclusionCanvas.tsx',
  'src/components/import/MergeReviewPanel.tsx',
  'src/pages/settings/AppearanceSection.tsx',
];

// 32px to 40px is the band hand-rolled controls fell into; smaller sizes here are icons.
const UNDERSIZED = /\b(?:min-h|h|w)-(?:8|9|10)\b/g;

describe('interactive target sizes', () => {
  it.each(CONTROL_FILES)('%s has no control smaller than 44px', (file) => {
    expect(readFileSync(file, 'utf8').match(UNDERSIZED) ?? []).toEqual([]);
  });
});
