# Lacuna Course Architecture Plan

## Document Purpose

This plan details the complete migration from Lacuna's current `Folder → Deck → Card` model to a `Course → Lesson → Note + Card` learning operating system. It covers the data model, UI changes, migration strategy, and implementation phases.

The FSRS shedules the CARDS, within the course. The course holds all values. The centre of gravity are the CARDS in the COURSE. NO PLUGINS in first implementation version.

---

## 1. Executive Summary

### Current State
- **Folders** group Decks hierarchically
- **Decks** are the scheduling unit (exam date, FSRS params, cards)
- **Cards** are flashcards with front/back, scheduled by Deck

### New State
- **Courses** are the scheduling unit (exam dateS, FSRS params, cards)
- **Lessons** are the learning unit (notes, relevant cards, optional exam date)
- **Notes** are rich Markdown content blocks within a Lesson
- **Cards** (questions) belong to a Course and have a primary Lesson
- **Practice sessions** appear between Lessons on the path and are the current FSRS study mode
- **Exam dates** are multiple per Course, with optional Lesson-level overrides

### Philosophy
- The app works for both teachers and students (same UI, same app)
- Teachers create courses, lessons, notes, and cards
- Students follow the course path, read notes, and study cards
- The system auto-generates practice sessions based on due cards
- Everything remains local-first, offline, and serverless

---

## 2. Data Model

### 2.1 New Tables

#### `Course`
```typescript
interface Course {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  colour?: string;
  // Scheduling (inherited from the old Deck)
  examDate: number;              // Primary exam date
  timeZone?: string;
  fsrsVersion: number;
  fsrsParameters: FsrsParameters;
  examObjective: ExamObjective;
  newCardsPerDay?: number;
  maxReviewsPerDay?: number;
  archived?: boolean;
  autoOptimise?: boolean;
  // Course-specific settings
  // Stale: originally `pathMode: 'linear' | 'semi-linear' | 'free'`. Superseded by
  // Addendum 2 §F — see `unlockMode: 'linear' | 'semi-linear' | 'open'` plus
  // `linearCadence` (this is the shipped shape, per src/db/types.ts).
  autoPractice: boolean;          // Auto-generate practice sessions
  practiceMinCards: number;       // Minimum due cards before auto-inserting practice
  practiceMaxGap: number;         // Max lessons between practice sessions
  dailyReviewGoal?: number;
  sessionTimeLimitMinutes?: number;
  leechThreshold?: number;
  leechAction?: 'suspend' | 'tag' | 'none';
  lastInteractedAt?: number;
}
```

#### `CourseExamDate` (multiple exam dates per course)
```typescript
interface CourseExamDate {
  id: string;
  courseId: string;
  name: string;        // e.g. "Mid-term", "Final exam"
  examDate: number;
  timeZone?: string;
  // Which lessons this exam date applies to
  lessonIds?: string[]; // null = applies to all lessons
  createdAt: number;
}
```

#### `Lesson`
```typescript
interface Lesson {
  id: string;
  courseId: string;        // Every lesson has a course (single-lesson courses have hidden wrapper)
  name: string;
  description?: string;
  orderIndex: number;     // Position on the path
  createdAt: number;
  // Optional lesson-level exam date override
  examDate?: number;
  timeZone?: string;
  // Lesson config
  isCheckpoint: boolean;    // Is this a milestone/mini-exam?
  // The old deck fields we remove from here:
  // (examDate, fsrsParameters, examObjective, etc. are on Course)
}
```

#### `Note` (rich content blocks within a Lesson)
```typescript
interface Note {
  id: string;
  lessonId: string;
  name: string;
  content: string;        // Rich Markdown
  orderIndex: number;
  createdAt: number;
  // Future: noteType could be 'markdown', 'video', 'diagram', etc.
}
```

#### `Card` (modified)
```typescript
interface Card {
  id: string;
  courseId: string;        // The Course this card belongs to
  primaryLessonId: string; // The Lesson where this card was created
  // All other fields remain the same
  type: CardType;
  front: string;
  back: string;
  stability: number | null;
  difficulty: number | null;
  lastReviewed: number | null;
  reps: number;
  lapses: number;
  state: FsrsCardState;
  tags?: string[];
  suspended?: boolean;
  flagged?: boolean;
  buriedUntil?: number | null;
  reverseCardId?: string | null;
  due: number | null;
  scheduledDays: number;
  learningSteps: number;
  history: ReviewLog[];
  createdAt: number;
}
```

#### `LessonCardLink` (cards shared across lessons)
```typescript
interface LessonCardLink {
  id: string;
  lessonId: string;
  cardId: string;
  createdAt: number;
}
```

#### `PracticeNode` (nodes on the path)
```typescript
interface PracticeNode {
  id: string;
  courseId: string;
  type: 'auto' | 'manual';
  position: number;         // Position on the path (between lessons)
  name: string;             // e.g. "Review Lessons 1-3"
  // Config for manual practice
  lessonIds?: string[];     // Which lessons' cards to include
  cardFilters?: CardFilter[]; // Optional filters
  createdAt: number;
}
```

### 2.2 Removed Tables
- `Folder` — replaced by `Course`

### 2.3 Modified Tables
- `Deck` → renamed to `Lesson` (or migrated, see section 3)
- `Card` — added `courseId`, changed `deckId` to `primaryLessonId`
- `SessionHistory` — `deckId` becomes `courseId`
- `UserPerformance` — `deckId` becomes `courseId`
- `BackupFile` — updated to include new tables

### 2.4 Index Changes
```
// Schema version 9
courses: 'id, createdAt, examDate'
lessons: 'id, courseId, orderIndex, createdAt'
notes: 'id, lessonId, orderIndex, createdAt'
cards: 'id, courseId, primaryLessonId, type, lastReviewed'
lessonCards: 'id, lessonId, cardId'
practiceNodes: 'id, courseId, position, createdAt'
courseExamDates: 'id, courseId, examDate, createdAt'
sessionHistory: '++id, courseId, timestamp'
userPerformance: 'courseId'
```

---

## 3. Migration Strategy

### 3.1 Existing Data Mapping

**Folders → Courses**
```
Folder (id, name, parentId) → Course (id, name, description='', colour=undefined)
```
- Parent folders are flattened or become nested courses (if nested courses are supported)
- For simplicity, we do NOT support nested courses in the first iteration
- All Folders become top-level Courses

**Decks inside Folders → Lessons**
```
Deck (id, name, folderId, examDate, fsrsParams, ...) → Lesson (id, name, courseId=folder.id, orderIndex, description='')
```
- The Deck's `examDate` moves to the Course (from its parent Folder)
- The Deck's `fsrsParameters` move to the Course
- The Deck's `examObjective` moves to the Course
- All other Deck scheduling fields move to the Course
- `orderIndex` is derived from the Deck's creation order within the Folder

**Standalone Decks (no Folder) → Lessons with hidden Course**
```
Deck (id, name, folderId=null, ...) → Lesson (id, name, courseId=newCourseId, orderIndex=0)
```
- A new Course is created with the same name as the Deck
- The new Course gets the Deck's scheduling fields
- The Lesson becomes the single Lesson in that Course

**Cards**
```
Card (id, deckId, ...) → Card (id, courseId, primaryLessonId, ...)
```
- `courseId` = the Course that the Deck's Folder became (or the hidden Course for standalone Decks)
- `primaryLessonId` = the Lesson that the Deck became

### 3.2 Migration Steps

1. **Pre-migration snapshot** (already exists, schema.ts v8)
2. **Create new tables** (courses, lessons, notes, lessonCards, practiceNodes, courseExamDates)
3. **Create hidden Courses for standalone Decks**
4. **Create Courses from Folders**
5. **Create Lessons from Decks**
6. **Migrate Cards**: update `courseId` and `primaryLessonId`
7. **Migrate SessionHistory**: update `courseId`
8. **Migrate UserPerformance**: update `courseId`
9. **Create PracticeNodes**: auto-generate practice nodes between Lessons for each Course
10. **Delete old tables** (folders, decks — or keep for rollback?)

### 3.3 Backwards Compatibility

- Share codes v1 (old `LAC0`/`LAC1` format) still decode to Decks
- On import, old share codes are migrated through the same pipeline
- New share codes v2 support Courses
- Backups include both old and new tables during a transition period

---

## 4. UI Changes

### 4.1 Dashboard

**Current**: Shows Folders and Decks as a grid.

**New**: Shows Courses as the top-level items.

```
Your Courses

+ Course card +  + Course card +  + Course card +
| Exam in 6d    | | ...          | | ...          |
| Name          | |              | |              |
| 3 lessons     | |              | |              |
| 42 cards      | |              | |              |
| bar 68%       | |              | |              |
+----------------+ +--------------+ +--------------+

Continue: "A-Level Economics" — Lesson 3: Elasticity
[Continue path]

Study needed today: 1 Lesson + 1 Practice
[Study all]
```

- The "Study today" count is replaced by "Lessons + Practice needed today"
- The calculation is configurable in settings (study patterns, revision period)
- Each Course card shows progress on the path (e.g., "3 of 12 lessons completed")

### 4.2 Course Path View (`/course/:courseId`)

**New page**: Duolingo-style visual path.

```
A-Level Economics
Exam: 14 Jun 2026

  o----------o----------o----------o----------o
  |          |          |          |          |
  Lesson 1   Practice   Lesson 2   Practice   Lesson 3
  Demand     (auto)     Supply     (auto)     Elasticity
  [done]     [done]     [done]     [pending]  [locked]
```

- The path is a vertical or horizontal scroll of nodes
- Each node is a circle/icon with a label
- Completed nodes are filled, pending nodes are outlined, locked nodes are greyed
- Practice nodes are diamond-shaped, Lesson nodes are circles
- The path winds visually (like a board game or Duolingo)
- Clicking a node opens it (if not locked)

**Path modes** (stale naming — this describes the original `pathMode` field, since
renamed to `unlockMode` with `'open'` replacing `'free'`; see Addendum 2 §F for the
shipped shape and `linearCadence`):
- `linear`: Must complete Lesson 1 before Lesson 2 unlocks
- `semi-linear`: Can view any Lesson, but study only unlocks after previous ones
- `free` (now `open`): All nodes are always clickable

### 4.3 Lesson View (`/course/:courseId/lesson/:lessonId`)

**New page**: Replaces the current Deck view.

```
< Back to A-Level Economics
Lesson 3: Elasticity

+------------------ Notes ------------------+
|                                           |
| [Note 1: Introduction to Elasticity]      |
| Rich Markdown content here...             |
| With images, videos, math...              |
|                                           |
| [Note 2: Types of Elasticity]              |
| Collapsible section...                      |
|                                           |
+-------------------------------------------+

+----------------- Cards -------------------+
| 15 cards in this lesson                   |
| [Study lesson cards]                       |
|                                            |
| Card list (same as current Deck view)      |
| but scoped to primaryLessonId             |
|                                            |
+-------------------------------------------+

[Add note]  [Add card]  [Edit lesson]
```

- The top section shows Notes (rendered Markdown)
- Notes are collapsible, sortable
- The middle section shows a "Study" button for this lesson's cards
- The bottom section shows a card list scoped to this lesson

### 4.4 Course Question Bank (`/course/:courseId/bank`)

**New page**: All cards in the course, organized by Lesson.

```
A-Level Economics — Question Bank

[Search all cards]

Lesson 1: Demand (12 cards)
  - Card 1
  - Card 2
  ...

Lesson 2: Supply (8 cards)
  - Card 1
  - Card 2
  ...

Unassigned (3 cards)
  - Card 1
  - Card 2
  ...

[Create new card]  [Bulk assign to lessons]
```

- Cards can be created here without assigning to a Lesson
- Cards can be dragged to Lessons
- Cards can be assigned to multiple Lessons

### 4.5 Card Editor (`/course/:courseId/cards/new` and `/card/:cardId/edit`)

**Modified**: The card editor now works at the Course level.

- `deckId` is replaced by `courseId`
- `primaryLessonId` is set (the Lesson where the card was created)
- When creating from a Lesson, `primaryLessonId` is auto-filled
- When creating from the Question Bank, `primaryLessonId` is optional

### 4.6 Learn Mode (`/course/:courseId/learn` and `/lesson/:lessonId/learn`)

**Modified**: Two entry points.

1. **Course-level learn**: The current `/deck/:deckId/learn` becomes `/course/:courseId/learn`. This is the Practice session. It reviews all due cards in the course.

2. **Lesson-level learn**: New `/lesson/:lessonId/learn`. This studies only the cards for that lesson (new cards + any due cards from that lesson, or teacher-configured).

The UI for Learn mode stays mostly the same, but the header shows the Course or Lesson name.

### 4.7 Sidebar

**Modified**: Shows Courses and Lessons.

```
Lacuna
  > Dashboard
  > Study today
  > Search
  > Share
  > Settings

COURSES
  - A-Level Economics
    > Lesson 1: Demand
    > Lesson 2: Supply
    > Lesson 3: Elasticity
    > Practice
  - French Vocabulary
    > Lesson 1: Basics

STANDALONE LESSONS
  - Organic Chemistry
  - Biology Flashcards
```

- Courses are collapsible
- Lessons are shown under their Course
- Standalone Lessons (single-Lesson Courses) are shown as top-level items
- The "Study today" item shows the total due Lessons + Practice

### 4.8 Deck Settings → Course Settings

**Modified**: `/course/:courseId/settings`

- All the current Deck settings (exam date, FSRS, objective, etc.) move here
- New settings: path mode (i.e. `unlockMode`, plus `linearCadence` when
  `unlockMode === 'linear'` — see Addendum 2 §F; not a new field), auto-practice,
  practice thresholds
- New section: Course exam dates (multiple dates)
- New section: Lesson management (reorder, rename, delete)

### 4.9 DeckView → CourseView and LessonView

**DeckView** is split into:
- **CourseView** (`/course/:courseId`): The path view, course overview, analytics
- **LessonView** (`/course/:courseId/lesson/:lessonId`): Notes, cards, study button

### 4.10 Analytics

**Modified**: Analytics are at the Course level.

- **Course Analytics**: Predicted exam-day score across all lessons, stability profile, review volume
- **Lesson Analytics**: Cards per lesson, mastery per lesson, completion rate
- **Path Analytics**: Lessons completed, practice sessions completed, time on path

---

## 5. Scheduling Changes

### 5.1 Scheduling Hierarchy

```
Course (exam date, FSRS params)
  ├── Exam date 1: "Mid-term" (applies to Lessons 1-3)
  ├── Exam date 2: "Final" (applies to all Lessons)
  └── Lessons
      ├── Lesson 1 (exam date override?)
      ├── Lesson 2
      └── Lesson 3
```

**Resolution**: For each Card, the scheduler determines the exam date to use:
1. If the Card's primary Lesson has an `examDate`, use that
2. If there is a `CourseExamDate` that applies to this Lesson, use that
3. Otherwise, use the Course's primary `examDate`

### 5.2 Practice Session Auto-Generation

The system monitors the Course pool and auto-inserts Practice nodes on the path:

```
function shouldInsertPractice(course, lessonsSinceLastPractice): boolean {
  const dueCards = countDueCards(course);
  const weakCards = countWeakCards(course);
  
  if (dueCards >= course.practiceMinCards) return true;
  if (lessonsSinceLastPractice >= course.practiceMaxGap) return true;
  if (weakCards >= someThreshold) return true;
  
  return false;
}
```

- `practiceMinCards`: Minimum due cards before a Practice is inserted
- `practiceMaxGap`: Maximum lessons between Practice sessions
- The system auto-calculates these based on study patterns (configurable)

### 5.3 Study Today Calculation

**New**: Instead of "N cards due today", the dashboard shows:

```
Study needed today:
- 2 Lessons (new cards waiting)
- 1 Practice session (due cards waiting)
- Estimated time: 25 minutes
```

The calculation is based on:
- Lessons with unstudied new cards
- Practice sessions with due cards
- User's average study time per card
- Configurable in Settings (study patterns, revision period)

### 5.4 FSRS Engine Changes

**Minimal changes**:
- `deckId` is replaced by `courseId` in all FSRS functions
- `makeEngine` takes `course.fsrsParameters` instead of `deck.fsrsParameters`
- `examDate` is resolved per-card (Lesson override → CourseExamDate → Course default)
- All other FSRS logic stays the same

Files to modify:
- `src/fsrs/fsrs.ts` — minimal (param names)
- `src/fsrs/forwardSim.ts` — minimal (param names)
- `src/fsrs/objective.ts` — minimal (param names)
- `src/fsrs/session.ts` — change `deckId` to `courseId`
- `src/fsrs/eligibility.ts` — change `deckId` to `courseId`
- `src/fsrs/cram.ts` — change `deckId` to `courseId`
- `src/fsrs/grading.ts` — change `deckId` to `courseId`
- `src/fsrs/horizon.ts` — change `deckId` to `courseId`
- `src/fsrs/progress.ts` — change `deckId` to `courseId`
- `src/fsrs/cooldown.ts` — minimal
- `src/fsrs/optimise.ts` — change `deckId` to `courseId`
- `src/fsrs/stats.ts` — change `deckId` to `courseId`
- `src/fsrs/heatmap.ts` — minimal
- `src/fsrs/calibration.ts` — minimal
- `src/fsrs/leech.ts` — minimal

---

## 6. Notes Engine

### 6.1 Note Content

Notes are rich Markdown documents with the same rendering engine as Cards:

**Supported features**:
- GFM (headings, lists, tables, quotes, horizontal rules)
- KaTeX maths
- Code highlighting (rehype-highlight)
- Images (lacuna-asset:// references)
- Embedded videos (YouTube/Vimeo links auto-embed, or local files)
- Collapsible sections (`<details>` or custom syntax)

**Future features** (later slices):
- Mermaid diagrams
- Interactive embeds
- Inline quizzes

### 6.2 Note Editor

A new editor component (`LessonNoteEditor`) based on the existing `MarkdownEditor`:

- Toolbar: bold, italic, heading, list, code, link, image, video, inline maths, block maths, collapsible section
- Live preview
- Drag-and-drop image support (same as Card editor)
- Multiple notes per Lesson (add, reorder, delete)
- Note names/titles for quick navigation

### 6.3 Note Rendering

- Notes render in the Lesson view above the cards
- Each note is a collapsible section (like a page in a book)
- Notes can be fullscreen for distraction-free reading
- Notes support the same font scaling, theme, and motion settings as the rest of the app

---

## 7. Practice Sessions

### 7.1 What is a Practice Session?

A Practice session is the current Learn mode (`/learn`), but scoped to a Course or a subset of Lessons.

**Auto-generated Practice**: The system detects that there are N due cards in the Course and auto-inserts a Practice node on the path. When the student clicks it, it opens the current Learn mode with all due cards.

**Manual Practice**: The teacher places a Practice node on the path and configures:
- Which Lessons' cards to include
- Which filters to apply (due, new, leech, etc.)
- A custom name (e.g., "Mock Test", "Week 1 Review")

### 7.2 Practice Node Types

```
PracticeNode = {
  type: 'auto' | 'manual',
  name: string,
  // For auto: the system decides
  // For manual:
  lessonIds?: string[],       // Which lessons to include
  filters?: CardFilter[],     // Which cards to include
  cardCount?: number,         // Limit to N cards
  randomize?: boolean,          // Random order
}
```

### 7.3 Practice UI

- Clicking a Practice node opens the full-screen Learn mode
- The header shows "Practice: [name]" and the Course name
- The card selection uses the existing `selectNext` logic with the Course's cards
- The session ends with the existing `SessionReport`

---

## 8. Exam Dates and Checkpoints

### 8.1 Multiple Exam Dates

A Course can have multiple exam dates:
- "Mid-term test" (Lesson 1-3)
- "Final exam" (all Lessons)
- "Quiz" (Lesson 5)

Each exam date has:
- Name
- Date and time
- Time zone
- Applicable lessons (or "all lessons")

### 8.2 Scheduling with Multiple Exam Dates

For each Card, the scheduler determines which exam date to use:
1. If the Card's primary Lesson has an `examDate`, use that
2. If the Card's primary Lesson is in the `lessonIds` of a `CourseExamDate`, use that exam date
3. If multiple `CourseExamDate` apply, use the nearest one
4. Otherwise, use the Course's primary `examDate`

### 8.3 Checkpoints

A Lesson can be marked as a `checkpoint` (mini-exam). This is a visual flag on the path. The checkpoint can have its own exam date.

---

## 9. Card Creation and Question Bank

### 9.1 Inline Card Creation

When editing a Lesson, the teacher can:
- Write notes
- Click "Add card" to create a Card inline
- The Card gets `courseId` and `primaryLessonId` auto-filled
- The Card appears in the Lesson view immediately

### 9.2 Question Bank

A Course-level Question Bank page shows all Cards in the Course:
- Organized by primary Lesson
- Unassigned Cards (no primary Lesson)
- Search and filter
- Bulk assign to Lessons
- Create new Card (unassigned initially)

### 9.3 Card Sharing Across Lessons

A Card can be linked to multiple Lessons:
- Primary Lesson: where the Card was created
- Linked Lessons: additional Lessons where the Card appears
- The Card is stored once; links are stored in `LessonCardLink`
- The Lesson view shows all Cards linked to that Lesson

---

## 10. Study Flow

### 10.1 Student Journey

1. **Open the app** → Dashboard shows Courses and "Study needed today"
2. **Click a Course** → Path view shows the Course path with Lessons and Practice
3. **Click a Lesson** → Lesson view shows Notes and Cards
4. **Read notes** → Scroll through the Notes, fullscreen if needed
5. **Click "Study Lesson"** → Lesson-level Learn mode (new cards for this Lesson)
6. **Complete Lesson** → Return to path, next node unlocks
7. **Click Practice** → Course-level Learn mode (due cards from all Lessons)
8. **Complete Practice** → Return to path, next node unlocks

### 10.2 Daily Routine

- The student opens the app
- The Dashboard shows "Study needed: 1 Lesson + 1 Practice"
- The student clicks "Continue" to resume their current Course
- The path shows the next node
- The student works through it

### 10.3 Lesson Study Mode

When a student clicks "Study Lesson", the session covers:
- **Default**: Only the new cards for this Lesson
- **Teacher-configured**: The teacher can set the Lesson to include reviews, mixed cards, or custom filters
- The session is a Learn mode with the existing FSRS engine

### 10.4 Practice Study Mode

When a student clicks a Practice node, the session covers:
- All due cards in the Course (or the configured subset)
- The existing `selectNext` logic with the Course's cards
- The existing FSRS grading and scheduling

---

## 11. Share Codes

### 11.1 Share Code v2

The new share code format supports Courses:

```
LAC2 (share code v2)
  ├── Course metadata
  ├── Exam dates
  ├── Lessons (names, order, descriptions)
  ├── Notes (content, order)
  ├── Cards (front, back, type, tags, primaryLessonId)
  ├── LessonCardLinks
  └── PracticeNodes
```

**What it omits** (same as v1):
- FSRS memory state
- Review history
- Images (placeholder text)

### 11.2 Backwards Compatibility

- Old `LAC0`/`LAC1` codes still decode to Decks
- On import, the system auto-migrates old codes to the new model
  - A single Deck becomes a single-Lesson Course
  - Multiple Decks (from multi-deck share codes) become a Course with Lessons

### 11.3 Export UI

- The Share page is updated to support exporting Courses
- The user can select a Course and generate a share code
- The import UI shows a preview of the Course, Lessons, and Card counts

---

## 12. Implementation Phases

### Phase 1: Data Model and Migration (Week 1-2)

1. **Create new database schema** (v9)
   - Add `courses`, `lessons`, `notes`, `lessonCards`, `practiceNodes`, `courseExamDates` tables
2. **Write migration functions**
   - `migrateFolderToCourse`
   - `migrateDeckToLesson`
   - `migrateCards`
   - `migrateSessionHistory`
   - `migrateUserPerformance`
3. **Update `src/db/schema.ts`**
   - Add version 9 stores
   - Write upgrade function
4. **Update `src/db/types.ts`**
   - Add new interfaces
   - Modify existing interfaces
5. **Update `src/db/repository.ts`**
   - Add CRUD functions for new tables
   - Modify existing functions (deck → course, etc.)
6. **Write migration tests**
   - Verify data integrity after migration

### Phase 2: Core FSRS and Scheduling (Week 2-3)

1. **Update FSRS engine**
   - Change `deckId` to `courseId` in all FSRS modules
   - Update exam date resolution logic
   - Support multiple exam dates per Course
2. **Update scheduling**
   - `src/fsrs/session.ts` — support Course-level sessions
   - `src/fsrs/eligibility.ts` — filter by Course
   - `src/fsrs/objective.ts` — resolve exam date per card
3. **Update analytics**
   - `src/fsrs/stats.ts` — aggregate by Course
   - `src/fsrs/heatmap.ts` — aggregate by Course
4. **Test all FSRS modules**
   - Run existing tests, update expectations

### Phase 3: Notes Engine (Week 3-4)

1. **Create Note editor**
   - `src/components/notes/LessonNoteEditor.tsx`
   - Toolbar, live preview, image support
   - Multiple notes per Lesson
2. **Create Note renderer**
   - `src/components/notes/LessonNotes.tsx`
   - Render notes in Lesson view
   - Collapsible sections
   - Embedded video support
3. **Update Markdown engine**
   - Extend `MarkdownView` to support embedded videos
   - Add collapsible section syntax
4. **Test notes engine**
   - Unit tests for editor and renderer

### Phase 4: Course and Lesson UI (Week 4-5)

1. **Create Course Path page**
   - `src/pages/CoursePath.tsx`
   - Duolingo-style visual path
   - Node types (Lesson, Practice)
   - Lock/unlock logic
   - Path modes (linear, semi-linear, free)
2. **Create Lesson page**
   - `src/pages/LessonView.tsx`
   - Notes section
   - Cards section
   - Study button
3. **Update Dashboard**
   - `src/pages/Dashboard.tsx`
   - Show Courses instead of Decks
   - "Study needed today" calculation
4. **Update Sidebar**
   - `src/components/layout/Sidebar.tsx`
   - Show Courses and Lessons
5. **Update routing**
   - `src/App.tsx`
   - Add new routes
   - Lazy-load new pages

### Phase 5: Question Bank and Card Management (Week 5-6)

1. **Create Question Bank page**
   - `src/pages/QuestionBank.tsx`
   - All Cards in Course, organized by Lesson
   - Search, filter, bulk assign
2. **Update Card editor**
   - `src/pages/CardEditor.tsx`
   - Work with `courseId` and `primaryLessonId`
   - Link to multiple Lessons
3. **Update Card list**
   - `src/components/cards/CardList.tsx`
   - Support Course and Lesson scoping
4. **Update share codes**
   - `src/db/share.ts`
   - Support v2 format with Courses
5. **Test all card operations**

### Phase 6: Practice Sessions (Week 6-7)

1. **Create Practice Node system**
   - Auto-generate Practice nodes based on due cards
   - Manual Practice node placement
   - Practice node configuration
2. **Update Learn mode**
   - `src/pages/LearnMode.tsx`
   - Support Course-level and Lesson-level sessions
   - Practice session UI
3. **Update Session Report**
   - `src/components/learn/SessionReport.tsx`
   - Show Practice session stats
4. **Test practice sessions**

### Phase 7: Settings and Course Management (Week 7-8)

1. **Update Course Settings**
   - `src/pages/CourseSettings.tsx` (new)
   - All current Deck settings
   - New settings: path mode ("path mode" here means the shipped `unlockMode`
     field, plus `linearCadence` when `unlockMode === 'linear'` — see Addendum 2
     §F. Not a new field to design; §2.1 and §4.2's `pathMode`/`free` wording
     above is stale.), auto-practice, practice thresholds
   - Multiple exam dates
2. **Update global Settings**
   - `src/pages/Settings.tsx`
   - Study pattern calculation
   - Revision period settings

> **Scope note:** the Phase 6 deferrals recorded in Addendum 2 §O — teacher-configured
> lesson session filters, and manual practice-node authoring UI — are explicitly
> deferred to **Phase 8**, not picked up here in Phase 7.
3. **Update import/export**
   - `src/db/import.ts`, `src/db/export.ts`
   - Support new tables
4. **Test settings and import/export**

### Phase 8: Polish and Integration (Week 8-9)

1. **Update all remaining pages**
   - Search page
   - Analytics page
   - Help page
2. **Update tests**
   - Fix all existing tests
   - Add new tests for new features
3. **Update documentation**
   - `README.md`
   - `SPEC.md`
   - `CHANGES.md`
4. **End-to-end testing**
   - Manual testing of the full flow
   - Browser automation testing

---

## 13. Files to Modify

### 13.1 New Files

```
src/db/types.ts          — Add new interfaces
src/db/schema.ts         — Add new tables and migration
src/db/repository.ts     — Add new CRUD functions
src/pages/CoursePath.tsx — Duolingo-style path
src/pages/LessonView.tsx — Lesson notes + cards
src/pages/QuestionBank.tsx — Course question bank
src/pages/CourseSettings.tsx — Course settings
src/components/notes/LessonNoteEditor.tsx — Note editor
src/components/notes/LessonNotes.tsx — Note renderer
src/components/notes/NoteToolbar.tsx — Note toolbar
src/components/course/CourseCard.tsx — Course card for dashboard
src/components/course/LessonNode.tsx — Lesson node for path
src/components/course/PracticeNode.tsx — Practice node for path
src/components/course/PathLine.tsx — Path visual line
src/state/useCourseData.ts — Course data hooks
src/fsrs/examDate.ts — Exam date resolution logic
```

### 13.2 Modified Files

```
src/App.tsx              — New routes
src/db/types.ts          — Modified Card, SessionHistory, UserPerformance
src/db/schema.ts         — Version 9 migration
src/db/repository.ts     — Updated CRUD
src/db/folderTree.ts     — Update to use Course/Lesson
src/db/share.ts          — v2 format
src/db/export.ts         — Export new tables
src/db/import.ts         — Import new tables
src/db/portability.ts    — Backup/restore new tables
src/db/backups.ts        — Backup new tables
src/db/seed.ts           — Seed example Course
src/db/diagnostics.ts    — Include new tables
src/pages/Dashboard.tsx  — Show Courses
src/pages/DeckView.tsx  — Split into CourseView + LessonView
src/pages/LearnMode.tsx  — Support Course and Lesson sessions
src/pages/CardEditor.tsx — Work with courseId + lessonId
src/pages/Settings.tsx  — New study calculation settings
src/pages/SearchPage.tsx — Search Courses and Lessons
src/pages/Analytics.tsx  — Course-level analytics
src/pages/SharePage.tsx  — Export Courses
src/pages/HelpPage.tsx   — Update documentation
src/components/layout/Sidebar.tsx — Show Courses
src/components/layout/AppShell.tsx — Update nav
src/components/cards/CardList.tsx — Support new IDs
src/components/import/UnifiedExportPanel.tsx — Export Courses
src/components/import/UnifiedImportPanel.tsx — Import Courses
src/components/search/CommandPalette.tsx — Search Courses
src/fsrs/fsrs.ts         — Minimal updates
src/fsrs/forwardSim.ts   — Minimal updates
src/fsrs/objective.ts    — Exam date resolution
src/fsrs/session.ts      — Course-level sessions
src/fsrs/eligibility.ts  — Course-level eligibility
src/fsrs/cram.ts         — Course-level cram
src/fsrs/grading.ts      — Course-level performance
src/fsrs/horizon.ts      — Course-level horizon
src/fsrs/progress.ts     — Course-level progress
src/fsrs/cooldown.ts     — Minimal updates
src/fsrs/optimise.ts     — Course-level optimisation
src/fsrs/stats.ts        — Course-level stats
src/fsrs/heatmap.ts      — Course-level heatmap
src/fsrs/calibration.ts  — Course-level calibration
src/fsrs/leech.ts        — Course-level leech
src/state/useData.ts     — New hooks for Courses
src/state/dashboardSort.ts — Update sorting
src/utils/datetime.ts    — Minimal updates
public/sw.js             — Update caching
```

---

## 14. Risk Analysis

### 14.1 High Risk

**Data Migration Complexity**
- Risk: The migration from Folders/Decks to Courses/Lessons is complex and could corrupt data.
- Mitigation: Extensive pre-migration snapshots, staged migration, rollback capability, comprehensive tests.

**FSRS Engine Changes**
- Risk: Changing the scheduling unit from Deck to Course could introduce subtle bugs in the FSRS engine.
- Mitigation: Keep the FSRS engine mostly unchanged; only change the ID resolution. Extensive testing.

**UI Overhaul**
- Risk: Replacing the Dashboard and Deck view with new pages is a massive UI change.
- Mitigation: Keep existing pages as fallback during development, use feature flags, incremental rollout.

### 14.2 Medium Risk

**Notes Engine**
- Risk: Building a new notes editor with embedded videos is a significant feature.
- Mitigation: Start with basic Markdown and add features incrementally. Reuse existing Markdown engine.

**Duolingo Path**
- Risk: The path UI is complex and could be performance-heavy.
- Mitigation: Start with a simple list view, then add the visual path. Use virtualization for long paths.

**Multiple Exam Dates**
- Risk: Supporting multiple exam dates per Course adds complexity to the scheduler.
- Mitigation: Implement as a fallback chain (Lesson → CourseExamDate → Course default). Keep it simple.

### 14.3 Low Risk

**Share Codes**
- Risk: Updating share codes to v2 is straightforward.
- Mitigation: Keep v1 support, add v2 as an option.

**Backwards Compatibility**
- Risk: Existing users might be confused by the new model.
- Mitigation: The migration is transparent. Single-Deck Courses look like standalone Lessons.

---

## 15. Success Criteria

1. All existing data is migrated correctly (zero data loss)
2. The FSRS engine works correctly with the new model
3. The Duolingo-style path is functional and visually polished
4. The notes engine supports rich Markdown with embedded videos
5. Practice sessions auto-generate and work correctly
6. The dashboard shows "Study needed" instead of "Cards due"
7. Share codes support Courses
8. All existing tests pass
9. New tests cover the new features
10. The app is still fully offline and local-first

---

## 16. Open Questions for Future Slices

1. **Plugin system**: How will plugins define new lesson types, practice modes, and card renderers?
2. **LLM integration**: When and how to add optional LLM APIs for course generation?
3. **Collaboration**: How will multiple teachers share courses?
4. **Advanced analytics**: How to track student progress across Courses?
5. **Mobile-specific features**: How to optimize the path UI for mobile?

---

*End of Course Architecture Plan*

# Course Architecture Plan — Addendum

> Supplement to the main plan. Covers design decisions resolved in discussion that are not
> reflected in the original document. Add to the end of the plan or merge into the
> relevant sections at the next revision pass.

---

## A. Lesson Unlock Modes (replaces/refines `pathMode`)

The original plan's `pathMode: 'linear' | 'semi-linear' | 'free'` is underspecified.
Replace with two distinct named modes that map to how schools actually work:

### A.1 Open Mode

- All lessons are visible and accessible from the moment the course is imported or created.
- Students can work ahead freely — read Lesson 9 notes and study its cards before the
  teacher has delivered it in class.
- The path renders all nodes as active; no locking UI.
- Default for self-authored courses (the student is also the author).

### A.2 Scheduled Mode

- Lessons unlock on a `releaseDate` set by the course author.
- Locked lessons are visible on the path (so students know what's coming) but not
  interactive until their release date is reached on the student's device clock.
- Useful when a teacher authors a course and shares it via share code at the start of
  term with all dates pre-populated.
- The `releaseDate` field is added to the `Lesson` interface:

```typescript
interface Lesson {
  // ... existing fields ...
  releaseDate?: number; // epoch-ms; undefined = immediately available
}
```

### A.3 The Local-First Constraint

Scheduled mode has a hard architectural ceiling: **there is no live connection between
teacher and student.** A share code is a static snapshot. This means:

- Release dates must be **authored at share time** — a teacher sets all dates for the
  term in September and bakes them into the share code.
- A teacher cannot push a "release Lesson 6 now" signal after the code has been
  distributed.
- Without a sync backend, scheduled mode is effectively an honour system enforced by
  the student's local clock. A motivated student can trivially bypass it.

**Decision required before implementation:** accept this limitation (probably fine for
the target use case — most students aren't going to hex-edit their IndexedDB to unlock
next week's biology lesson) or flag it clearly in the UI so teachers know what they are
and aren't getting.

Share code v2 must serialise `releaseDate` per lesson so scheduled courses survive
export/import correctly.

---

## B. Extension Lesson Nodes

A lesson can be marked as extension content — optional material for students who finish
ahead of pace or want to go deeper.

```typescript
interface Lesson {
  // ... existing fields ...
  isExtension: boolean; // default false
}
```

### Behaviour

- Extension nodes render visually distinct on the path (e.g. branching off the main
  line, or a different node shape/colour — final design TBD).
- They are **never** included in core progress metrics: not counted in the "lessons
  completed" fraction, not included in the FSRS study pool by default, and not surfaced
  in "Study needed today."
- A student can opt into an extension lesson manually; at that point its cards enter
  the normal FSRS pool for that course and are scheduled against the course exam date.
- Extension nodes are always unlocked regardless of `pathMode`, since gating optional
  enrichment behind a schedule date defeats the point.
- No new tables required — just the `isExtension` flag and conditional rendering/query
  logic.

---

## C. Path Dual-Governor Clarification

The path has two independent governors that do not conflict:

| Governor | Controls | Paced by |
|---|---|---|
| Lesson progression | Which content node comes next | Curriculum (teacher or self) |
| Practice sessions | When FSRS cards are due | Forgetting curve |

Lessons follow the school timetable (or the student's reading pace in open mode).
Practice sessions slot in between lessons automatically when the FSRS engine determines
cards are due — they are not curriculum events and do not obey `releaseDate` or
`pathMode` locking.

A practice session appearing between Lesson 3 and Lesson 4 on the path is purely a
function of how many cards are due and `practiceMinCards`/`practiceMaxGap` thresholds.
The linear lesson order does not constrain when practice fires.

This needs to be made explicit in the path rendering logic: practice nodes are
**dynamically inserted** between fixed lesson nodes, not authored positions.

---

## D. Open Questions Added

These were not in the original plan's §16 open questions and should be tracked:

1. **Scheduled mode bypass**: Do we surface a warning in the teacher-facing share UI
   that release dates are enforced by the student's local clock only? Probably yes.

2. **Extension opt-in UX**: When a student opts into an extension lesson, is that
   permanent (cards enter the pool forever) or session-scoped? Needs a decision before
   implementation.

3. **Path rendering for extensions**: Branch off the main line, or a visually distinct
   inline node? Affects path layout logic non-trivially.

4. **`pathMode` field**: Either rename to `unlockMode: 'open' | 'scheduled'` to match
   the new framing, or deprecate the original three-value enum. Do not keep both.

# Course Architecture Plan — Addendum 2

> Resolutions from a structured design review. This addendum **supersedes**:
> - Main plan §3.1 (standalone deck → hidden Course mapping) and the relevant line in §11.2
> - Main plan §4.2 (path modes) and the `pathMode` field in §2.1
> - Main plan §5.2 (the `someThreshold` placeholder in the practice-insertion pseudocode)
> - Main plan §8.3 (Checkpoints) and `Lesson.isCheckpoint`
> - Addendum 1, §A (Lesson Unlock Modes) in full, and §C (practice/path independence) in part — see §I below
> - Addendum 1, §D.4 (the `pathMode` vs `unlockMode` open question — now closed)
>
> Everything below is final unless marked **(default — flag if you want it different)**.

---

## E. Migration: Every Imported Deck Becomes Its Own Course

Old v1 share codes carry no folder/grouping metadata — a code stores only per-deck data (name, objective, dates, cards), nothing about a parent folder (confirmed against SPEC §13). The original plan's rule — multiple decks bundled in one code become one Course with shared Lessons — glued decks together based on what happened to fit in a single paste-able code, not on any pedagogical relationship between them.

**Resolution:** every imported deck, solo or bundled, becomes its own single-Lesson Course. Grouping several of these into a real multi-lesson Course afterwards is a deliberate manual step the user takes — never something the importer infers.

**Routing for these collapsed single-lesson Courses:** the Course object still exists, and `/course/:courseId` still resolves. `CoursePath.tsx` detects "exactly one lesson" and renders `LessonView` directly instead of a path. There is no separate route bypassing the Course — it's a rendering branch, not a routing fork.

This makes §4.7's "STANDALONE LESSONS" sidebar grouping the **common** case for anything migrated from the old model, not an edge case — design for it first, not last.

---

## F. Unlock Modes — Final Resolution

Replaces `pathMode` and Addendum 1's `unlockMode` with one field, three values, each mechanically distinct:

```typescript
interface Course {
  // ...
  unlockMode: 'linear' | 'semi-linear' | 'open';
  linearCadence?: { anchorDate: number; intervalDays: number }; // only used when unlockMode === 'linear'
}

interface Lesson {
  // ...
  releaseDate?: number;   // explicit override; only meaningful under 'linear'
  unlockedAt?: number;    // set once the unlock condition is met; never cleared — see §I
}
```

### `linear` — date-gated
Every lesson's effective release date is computed by walking the lesson order and cascading from manual overrides:

```
cursor = course.linearCadence.anchorDate
for each lesson in orderIndex (skip isExtension lessons entirely):
  if lesson.releaseDate is set: cursor = lesson.releaseDate
  lesson.effectiveDate = cursor
  cursor += course.linearCadence.intervalDays
```

- Overriding one lesson's date cascades to every lesson after it — a half-term break pushes the rest of term back automatically.
- Extension lessons don't consume a slot in this walk. They're already always-unlocked (Addendum 1 §B); excluding them from the walk stops them silently shifting every subsequent date by one interval.
- Compute `effectiveDate` live on read — it's a cheap single pass, and persisting a derived value just goes stale the moment an earlier override changes.
- Cadence granularity is plain day-intervals (`anchorDate + i × intervalDays`), not weekday-aware. Consistent with Addendum 1 §A.3, which already treats scheduled mode as an honour system enforced by the device clock.

### `semi-linear` — completion-gated, sequential, no dates
See §I — this mode has a genuine two-part gate.

### `open` — unchanged
Everything unlocked immediately. No locking UI. Same as Addendum 1 §A.1.

---

## G. Checkpoints — Merged into `CourseExamDate`

Replaces main plan §8.3 entirely. `Lesson.isCheckpoint` is **removed** — a checkpoint isn't a lesson property. It's a fixed-position, teacher-authored assessment event on the path, distinct from Lesson nodes and from auto/manual Practice nodes.

A checkpoint **is** a `CourseExamDate` row:

```typescript
interface CourseExamDate {
  id: string;
  courseId: string;
  name: string;                 // e.g. "Mid-term", "Mock exam"
  examDate: number;              // required — a checkpoint without a date isn't a checkpoint
  timeZone?: string;
  lessonIds?: string[];          // which lessons' cards are in scope; undefined = all lessons so far
  excludedCardIds?: string[];    // card-level exclusions within the scoped lessons
  createdAt: number;
}
```

- **Path position is derived, not stored:** render the checkpoint node immediately after the lesson with the highest `orderIndex` among its `lessonIds`. **(default — flag if you want a manually-set position instead.)**
- **Checkpoints never gate path progression**, under any `unlockMode`, including `semi-linear`. Assessment, not curriculum.
- **Card exclusion changes the scheduling target, not the study itself** — an excluded card falls back to the next applicable checkpoint, or to `Course.examDate` if none apply.
- **Scheduling:** the engine always targets whichever applicable exam date is *nearest* — checkpoint or final — and naturally re-targets the next one once the current passes. No FSRS engine changes needed: `applyReview` and stability updates are horizon-agnostic. Only `schedulingHorizon()` needs to look across `CourseExamDate` rows as well as `Course.examDate`, which is already the resolution pattern in main plan §8.2. There is no joint/simultaneous multi-horizon optimisation here — that's a different, much harder problem, and nothing in this design needs it.

Cram mode's interaction with multiple checkpoints is **explicitly deferred** to the separate cram-mode overhaul document.

---

## H. Auto-Practice Insertion — Final Formula

Replaces the `someThreshold` placeholder in main plan §5.2:

```typescript
function shouldInsertPractice(course: Course, dueCards: Card[], lessonsSinceLastPractice: number): boolean {
  const minutesToClear = (dueCards.length * course.meanReviewSeconds) / 60;
  const daysUntilExam = daysUntil(schedulingHorizon(course));

  const threshold = daysUntilExam <= course.practiceUrgentWindowDays
    ? course.practiceThresholdMinutesNear   // default 30
    : course.practiceThresholdMinutesFar;   // default 60

  if (minutesToClear >= threshold) return true;
  if (lessonsSinceLastPractice >= course.practiceMaxGap) return true;
  return false;
}
```

```typescript
interface Course {
  // ...
  practiceThresholdMinutesFar: number;   // default 60
  practiceThresholdMinutesNear: number;  // default 30
  practiceUrgentWindowDays: number;      // default 7
  practiceMaxGap: number;                // unchanged backstop from the main plan
  // practiceMinCards is REMOVED — superseded by the pair above
}
```

`meanReviewSeconds` reuses the existing per-deck mean-review-time concept (main plan / SPEC §14, dashboard forecast), re-scoped from Deck to Course — no new estimation machinery.

`practiceMaxGap` stays as a backstop: a course whose due-card count never crosses the minutes threshold could otherwise go many lessons without a single practice session.

---

## I. Semi-Linear's Dual Gate, and Why Unlock Must Be Stored

This is the one place Addendum 1 §C needs an explicit exception. §C states practice sessions "do not obey... `pathMode` locking" — true for `linear` and `open`, **not entirely true for `semi-linear`**.

**The gate.** Under `semi-linear`, Lesson N+1 unlocks once:

1. Lesson N is **taught** — every card whose `primaryLessonId` is Lesson N has been served at least once (state moved off `New`), regardless of grade — **and**
2. if a Practice node was auto-inserted in the path slot immediately after Lesson N, that Practice session has also been **completed by reaching its objective** (the SessionReport's goal-reached state). A manual exit does **not** satisfy the gate.
3. If no Practice node exists in that slot, condition 1 alone is sufficient.

**Why this can't be a live computation.** Practice insertion (§H) is recalculated continuously from current due-card volume. A gap with no Practice node at the moment Lesson N+1 unlocked could later "grow" one, because due cards piled up afterwards. If unlock status were recomputed live, the lesson could **re-lock** — an unacceptable UX failure, since the student would lose access to content they already had.

**Resolution: unlock is a one-way ratchet, stored once earned.**

```typescript
interface Lesson {
  // ...
  unlockedAt?: number; // set the first time the unlock condition is met; never cleared, never re-evaluated to false
}
```

A practice node that materialises later in an already-passed gap just sits there as optional catch-up review. It never retroactively gates anything.

This is the only "is this lesson available" check in the whole document that needs to be persisted rather than derived. `linear`'s date check and `open`'s no-op stay pure/live computations.

---

## J. Course Completion % vs Path Position

The original plan's dashboard treated "lessons completed" as the single progress metric. Split into two numbers that were previously conflated:

- **Path position** — which lesson the student has reached ("Lesson 3 of 12"). Pure curriculum pacing, nothing to do with FSRS.
- **Course completion / mastery %** — reuse the existing `progressValue` function (main plan / SPEC §8: mean predicted exam-day R, or secured-topics fraction), fed the Course's full **deduplicated** card set instead of a single Deck's.

This removes the `LessonCardLink` double-counting problem outright — a card shared across two lessons is one card in the denominator, not two — and costs nothing new to build, since `progressValue` already exists and is horizon/objective-aware. It just needs `courseId`'s unique card set instead of `deckId`'s.

**Denominator rule:** extension-lesson cards are excluded from both numerator and denominator by default, consistent with Addendum 1 §B, until a student opts in — at which point they join the pool like any other card.

Show both numbers on the dashboard. They are not the same thing and should not share a label.

---

## K. Extensible Node Types — Registry Pattern

Path nodes (Lesson, Practice-auto, Practice-manual, Checkpoint, and whatever plugins add later) should be **open in storage, closed in your own renderer**:

```typescript
const KNOWN_NODE_TYPES = ['lesson', 'practice-auto', 'practice-manual', 'checkpoint'] as const;

interface PathNodeBase {
  id: string;
  nodeType: string; // NOT a literal union — a future plugin type shouldn't need a schema migration
}
```

The v1 renderer switches exhaustively over `KNOWN_NODE_TYPES` (full TypeScript safety for everything actually built) and falls back to a generic "unrecognised node" placeholder for anything outside that set. This also protects against importing a course exported by a future version with plugin node types the current build doesn't understand.

---

## L. Small Schema Fixes

No design decision required — these are just errors in the original draft.

1. **`Card.primaryLessonId`** is typed required (`string`) in §2.1 but described as optional/nullable in §4.4, §4.5 and §9.2 ("Unassigned" cards). Fix: `primaryLessonId: string | null`.
2. **`PracticeNode`** is defined twice with different field names — §2.1 (`cardFilters?`) and §7.2 (`filters?`, `cardCount?`, `randomize?`). Consolidate to one shape:
   ```typescript
   interface PracticeNode {
     id: string;
     courseId: string;
     type: 'auto' | 'manual';
     position?: number;     // only meaningful for type: 'manual'; auto nodes are positioned at render time, never stored
     name: string;
     lessonIds?: string[];
     filters?: CardFilter[];
     cardCount?: number;
     randomize?: boolean;
     createdAt: number;
   }
   ```
3. **Folder-flattening "risk"** in §14.1 isn't a real risk. SPEC §12 confirms folders are already single-level in the current UI — nesting is parsed but never rendered. Delete this line from Risk Analysis.

---

## M. Explicitly Deferred / Accepted Defaults

- **Cram mode × multiple checkpoints** — deferred to the separate cram-mode overhaul document.
- **Shared-card eligibility** — a card linked to a locked lesson, whose `primaryLessonId` points to an already-taught lesson, stays eligible for review regardless. `LessonCardLink` governs display/grouping only, never FSRS pool eligibility.
- **Checkpoint path position** — derived from lesson scope (§G), not manually authored. Flagged as a default, not a locked decision.

---

## N. Updated Open Questions

Replaces main plan §16 and Addendum 1 §D — most of those are now resolved. What's genuinely still open:

1. Should checkpoint path position ever be manually overridable, or is "derived from lesson scope" always correct? (§G)
2. AI/LLM course generation — given plugins are a confirmed future direction, keep repository-layer functions (`createLesson`, `createCard`, `addNote`, etc.) callable independently of any UI component, so an AI agent can later call the same functions a human's "Add lesson" button calls, without a parallel code path.
3. Collaboration / multi-teacher course authoring — untouched by this review, still genuinely open.

---

## O. Phase 6 Deferrals and Decisions

- **Teacher-configured lesson session filters** — deferred. `/lesson/:lessonId/learn` currently serves new cards only (Lesson N's own cards plus `LessonCardLink`-linked cards); a teacher-facing filter UI (e.g. due-only, mixed) is not yet built.
- **Manual practice-node authoring UI** — deferred. Manual `PracticeNode` records render and gate the unlock ratchet correctly (§I), but there is no UI yet for a teacher to create or place one; only rendering/placement logic is done.
- **Auto practice nodes do not gate the semi-linear unlock ratchet** — implemented per §I's rationale exactly: auto slots are recomputed from a volatile due-card snapshot (`shouldInsertPractice`, §H) and would make the one-way ratchet flap if they gated it. Only a manual `PracticeNode` in the slot after Lesson N gates unlock; this is a deliberate scope narrowing of §I condition 2, not an oversight.
- **`UserPerformance` calibration reuses the `deckId` key for `courseId` strings** — no schema bump for Phase 6. Revisit if per-course calibration needs to diverge from the deck-keyed shape.
- **`undoReview` does not restore `lastInteractedAt`** — pre-existing gap, unchanged by Phase 6. The new `ReviewUndo` `kind` (deck/course) discriminator is recorded so a future fix can restore the right entity's timestamp; not itself a fix.