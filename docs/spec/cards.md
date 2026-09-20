# 11. Cards, cloze & the editor

### Cloze (`src/components/markdown/cloze.ts`)

- Notation: `{{c1::hidden answer}}` and `{{c1::hidden answer::optional hint}}`.
- A single card hides **all** `cN` spans at once. On the **front** each span renders
  as a styled blank — `[...]`, or `[hint]` if a hint is given. On the **back** every
  hidden span is revealed and highlighted inline within the full sentence
  (`.cloze-reveal`).
- `nextClozeIndex` powers the editor's auto-indexing Cloze button; `hasCloze` gates
  cloze validity and import.

### Card rendering (`CardContent` -> `MarkdownView`)

Front/back Markdown is rendered with GFM, maths (KaTeX), syntax highlighting, and
raw HTML (for the cloze spans), inside `.prose-lacuna` styling. Memoised per card.

The `MarkdownView` component is backed by a bounded LRU parse cache (parsed HTML
cached by source string, with five-minute stale eviction and an LRU fallback), so
re-renders and remounts are O(1) lookups while an entry remains cached; an evicted source
is parsed again when needed.

The `MarkdownView` effect tracks the last source it resolved for via a
`useRef` and bails out when the prop is unchanged, so a parent re-render that passes
the same source string does not re-assign `dangerouslySetInnerHTML` and wipe the
user's text selection.

### Cloze highlight (v0.0.2 fix)

The revealed cloze span is rendered with `text-decoration: underline` (and a
faint accent ink shadow) rather than a `background-color` fill, with an explicit
`.cloze-reveal::selection { background-color: hsl(var(--accent) / 0.45); color:
inherit; }` override. The previous `background-color` highlight stacked under
the global `::selection` rule (both painted translucent amber), producing a muddy
double-highlight on selected text inside a revealed cloze. With no element
background, `::selection` paints cleanly across the cloze mark.

### Sequence-generated cards in Learn mode

When a card was generated from a Sequence (§5), `CardContent`'s `sequenceCue` prop (set in
`LearnMode`) parses the front's header/cue-items structure (`parseSequenceFront`) and styles
the preceding cue items as muted context above the recall prompt, rather than rendering the
whole front as one undifferentiated block. Label cards (`isLabelCardId`) are excluded, since
they have no cue window to style. No FSRS or session-flow changes: generated cards are
ordinary `front_back` cards to the scheduler.

### Editor (`src/pages/CardEditor.tsx`, full page)

- Mode is decided by the route (`/cards/new` vs `/cards/:id/edit`).
- **Card type** selector: Basic (front/back), Reversed, Cloze or Audio. Numeric and working
  application content belongs to the separate Question editor.
  - **Basic:** standard front/back flashcard.
  - **Reversed:** creates an independent card that tests the back as the prompt.
  - **Cloze:** front contains `{{c1::hidden answer}}` deletions; back is empty.
  - **Audio:** a structured file/recording slot, optional prompt and required answer write an
    ordinary `front_back` card whose front contains `![audio](lacuna-asset://<hash>)`. Supported
    files are MP3, M4A/MP4, Ogg, WAV and WebM up to 25 MB. Playback autoplay and speed are global
    device settings. In Learn mode, “Hear it again” or R returns to the front presentation while
    the answer phase, captured response time and grading controls remain intact.
- One or two **Markdown editors** with a live preview; a formatting toolbar (bold,
  italic, heading, lists, code, link, image, cloze auto-index, inline/block maths);
  a cloze editor can preview the revealed answer. Each textarea takes its accessible name from the
  visible field label (for example, Front or Back) unless its caller supplies a more specific
  `ariaLabel`.
- **Tags** input with deck-wide suggestions.
- **Images** are downscaled to <= 1280 px, re-encoded (~0.8 quality), stored as a
  `Uint8Array` in the `assets` table (deduplicated by SHA-256 hash), and referenced
  from the Markdown as `lacuna-asset://<hash>` — **not** base64 data URIs. The render
  path resolves references to object URLs through the shared bounded LRU cache; cache
  eviction and app teardown revoke those URLs. This keeps card rows small (base64 inflates
  payloads ~1/3 and drags full image data through every reactive read) and keeps exports lean.
- **Audio** is stored without transcoding in the same content-addressed asset table. Anki
  `[sound:filename]` references are rewritten to the same audio marker during APKG import rather
  than being silently discarded.
- **Validation:** front required; back required for front/back; at least one cloze
  for cloze.
- **Quick capture:** "Save & add another" keeps the page open, clears content,
  retains type and tags, refocuses the first field, tallies a per-sitting count,
  and flashes a "Saved" confirmation. A seamless Tab order runs Front -> Back ->
  Save-and-add -> Save. `Ctrl/Cmd+Enter` saves (and, for new cards, keeps going).
- **Crash drafts:** autosave begins only after the learner changes seeded editor content. While
  an unresolved saved-draft prompt is visible, the editor cannot overwrite that draft. Navigating
  between card edit routes in one mounted editor switches draft identity before any later save.
- **Reverse cards:** for a new basic card, an "Also create reverse" toggle
  additionally creates an independent card testing the back.
- **Touch targets:** the toolbar buttons and type-selector are 44px tall with
  active-state colours; on narrow viewports the toolbar scrolls horizontally with
  a hidden scrollbar.
- **Return-to-origin back-link:** Cancel, post-save navigation and the breadcrumb
  "back" link normally follow the route (the lesson if the URL encodes one, otherwise
  the course's Cards page), but two entry points need to say otherwise — editing a
  lesson-owned card from Cards, and editing a sequence (which has no
  lesson-scoped edit route) from within a lesson. Callers that know they're not the
  route's default surface pass an `{ origin: { path, label } }` router-state override
  (`src/utils/editorOrigin.ts`), which both `CardEditor` and `SequenceEditor` prefer
  over their route-derived default. A hard refresh drops router state, so the
  route-derived fallback always applies in that case.

### Question editor (`src/pages/QuestionEditor.tsx`, full page)

The separate Question editor creates either a fixed problem or a built-in generated family. Every
Question requires a name and exactly one **Primary skill practised** Concept; prerequisite Concepts
are optional. Fixed Questions additionally require a prompt, valid numeric answer or compiled
working scheme, and worked explanation. A generated family selects a supported generator and its
typed configuration. Changing Question form during editing is prohibited: it would be a new
definition, not a cosmetic edit.

Question authoring uses the same local draft store as Card authoring through a typed, generic
storage boundary. Fixed, working and generated state — including invalid raw working source,
fixtures and uncommitted Concept text — is isolated by Course and Question identity. Autosave begins
only after an author change, never overwrites an unresolved recovery prompt and flushes synchronously
before route departure or unload. Confirmed departure retains the draft; re-entry offers explicit
Restore or Discard. Successful save and deletion clear the draft and bypass the navigation guard;
a failed write leaves both the editor and its draft intact.

Questions are post-instruction application practice. They do not appear in the Card editor, lesson
Card study or Course path. Deleting a Question removes the definition and relationship set but
retains its Attempt receipts as personal evidence.


[Specification index](../SPEC.md)
