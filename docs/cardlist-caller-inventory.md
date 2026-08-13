# CardList caller inventory

**Reviewed:** 12 August 2026

**Current `CardListProps`:** `CardListBaseProps & { context: CardListContext }`.
The `deck` / `allDecks` compatibility union is gone. Production and test callers
pass `context`.

**Scope:** `src/` references to the `CardList` component as of 12 August 2026,
when the Deck-shaped compatibility branch still existed. The tables below are
that inventory. They are a historical record of the pre-removal callers, not a
description of the current module.

## Method and counting

The search covered JSX calls, named imports, mock modules, `CardListBody` imports, prop names,
context imports, and possible wrappers or re-exports. There is no CardList barrel export, wrapper,
or lazy import elsewhere in `src/`. The only production JSX calls are the four listed below.

A **caller** below means a render site, with the line at the opening `<CardList`. Test render sites
are listed individually because they exercise different compatibility paths. Mock modules are
listed separately: they are consumers of the module boundary, but they do not render the real
`CardList` and therefore do not pass a runtime shape to it.

Capability codes used in the inventory are:

- **M — sibling-deck “Move to…”**
- **I — card import** (text, CSV, JSON or other parsed-card input)
- **A — APKG import**
- **N — card analytics**
- **S — scheduling configuration**
- **B — bulk assignment to a lesson**
- **L — lesson linking or unlinking**
- **G — generated-card read-only rules**
- **U — undo**
- **D — duplicate checks during import**

“Panel only” means that the test opens the relevant UI but does not submit parsed cards. “Gating
only” means that the test checks whether a capability is offered, not that it performs the
operation. For production rows, “actually exercised” records the capability enabled by the
props supplied at that render site; it does not claim that a user session has performed every
action. For test rows, it records the action or assertion made by the test.

In the context-equivalence column, **yes** means the context-shaped branch preserves the
capability, **base prop** means it remains available alongside `CardListContext` rather than as a
field on the context object, and **partial** means the context type can describe the capability
but the current `courseCardListContext` factory does not provide it.


## Production callers

There are **four production render sites and zero production legacy callers**. All four pass the
explicit `context` shape. The `deck` values in `QuestionBank.tsx:194` and `QuestionBank.tsx:207`
are inputs to the `LessonBucket` and `UnassignedBucket` helpers; those helpers pass them to
`courseCardListContext` and pass `context` to CardList. They are not legacy `deck` props on
CardList.

| File and line | Shape | Surface | Capabilities actually exercised by this caller | Equivalent on the context branch |
| --- | --- | --- | --- | --- |
| `src/pages/QuestionBank.tsx:271` | Context | Production; lesson bucket in the Course Question Bank | I, A, N, S, B, G and D are enabled by the supplied props; L is not supplied; M is unavailable because no move targets are supplied; U remains shared CardList behaviour | Yes for I, A, N, S, B, G, U and D. M is partial: the context interface can describe it, but `courseCardListContext` does not supply it. |
| `src/pages/QuestionBank.tsx:338` | Context | Production; Unassigned bucket in the Course Question Bank | I, A, N, S, B, G and D are enabled by the supplied props; L is not supplied; M is unavailable for the same reason; U remains shared CardList behaviour | Yes for I, A, N, S, B, G, U and D. M is partial and is not supplied by the current factory. |
| `src/components/cards/LessonCardsSection.tsx:130` | Context | Production; empty Lesson after the prepared importer is opened | I, A, N, S, L and D are enabled; B and G are not supplied for this empty import-only render; M is unavailable; U remains shared CardList behaviour | Yes for I, A, N, S, L, U and D. M is partial and is not supplied by the current factory. |
| `src/components/cards/LessonCardsSection.tsx:189` | Context | Production; populated Lesson card list | I, A, N, S, L, G and D are enabled; B is not supplied; M is unavailable; U remains shared CardList behaviour | Yes for I, A, N, S, L, G, U and D. M is partial and is not supplied by the current factory. |

The production callers use `courseCardListContext`, whose adapter supplies `schedulingConfig`, an
import target id and name, parsed-card import, APKG import and restore. Lesson linking is supplied
through CardList's context-compatible base props. The Question Bank supplies bulk assignment
through the same base props. None of these callers supplies `moveTargets` or `onMove`.

## Other context-shaped callers in tests

These are real `CardList` render sites, but they are not legacy callers and therefore do not count
towards the legacy total.

| File and line | Shape | Production or test | Test / caller | Capabilities actually exercised | Equivalent on the context adapter |
| --- | --- | --- | --- | --- | --- |
| `src/components/cards/CardList.test.tsx:194` | Context | Test | `accepts a domain-neutral context for analytics, import and legacy moves` | N, S, I and M; the test also invokes the context move handler and U through `onRestore` | Yes for N, S, I, M and U in this explicit hand-built context. The standard Course/Lesson factory does not supply M. |
| `src/components/cards/CardList.test.tsx:234` | Context | Test | `routes APKG imports through the context capability` | A; the APKG callback is invoked | Yes through `onApkgImport`; the standard factory wires it to the course/lesson import path. |

## Legacy-shaped callers in tests

All legacy-shaped render sites are in `src/components/cards/CardList.test.tsx`. They pass
`deck={mockDeck}`; all except line 167 also pass `allDecks={[mockDeck]}`. No test supplies more
than one sibling deck, and no legacy-shaped test clicks through a successful sibling-deck move.

The context-equivalence column describes whether the capability has a working equivalent when the
same CardList is given `context`. “Base prop” means that the capability is not a field on
`CardListContext` itself, but remains available on the shared CardList props alongside `context`.

| File and line | Shape | Production or test | Test / caller | Capabilities actually exercised | Equivalent capability on the context adapter |
| --- | --- | --- | --- | --- | --- |
| `src/components/cards/CardList.test.tsx:153` | Legacy `deck` plus `allDecks` | Test | `renders empty state when no cards` | None of the listed capabilities; the singleton `allDecks` is supplied but no move is attempted | No listed capability is asserted. Shared rendering and S are equivalent on context; M is partial because it requires optional move hooks. |
| `src/components/cards/CardList.test.tsx:167` | Legacy `deck`; `allDecks` omitted | Test | `defaults the legacy deck collection when omitted` | M fallback initialisation only (the default single-deck collection is calculated, but no move is attempted); N through analytics expansion; S through the legacy Deck scheduler config | N and S: yes through `schedulingConfig`. M: the context interface can provide it, but the current factory does not. |
| `src/components/cards/CardList.test.tsx:251` | Legacy `deck` plus `allDecks` | Test | `renders cards with front content` | None of the listed capabilities; ordinary card rendering and tags | No listed capability is asserted; ordinary rendering and S remain shared by both shapes, while M is partial. |
| `src/components/cards/CardList.test.tsx:269` | Legacy `deck` plus `allDecks` | Test | `uses the Working badge for working-item cards stored as front/back cards` | None of the listed capabilities; working-card labelling | No listed capability is asserted; the shared renderer and S remain available with context, while M is partial. |
| `src/components/cards/CardList.test.tsx:283` | Legacy `deck` plus `allDecks` | Test | `shows select mode when Select button is clicked` | Selection UI only; no listed mutation is submitted | Shared selection is equivalent with context; B and L remain base props, G remains card-data driven, S remains `schedulingConfig`, and M is partial. |
| `src/components/cards/CardList.test.tsx:299` | Legacy `deck` plus `allDecks` | Test | `toggles card selection in select mode` | Selection UI only; no listed mutation is submitted | Shared selection is equivalent with context; S remains `schedulingConfig`, and M is partial. |
| `src/components/cards/CardList.test.tsx:314` | Legacy `deck` plus `allDecks` | Test | `expands a card to show analytics` | N through analytics expansion; S through the legacy Deck scheduler config | Yes: `context.schedulingConfig` is passed to the same analytics component. |
| `src/components/cards/CardList.test.tsx:330` | Legacy `deck` plus `allDecks` | Test | `shows import panel when Import is clicked` | I panel only; no parsed-card import, APKG import or duplicate warning is submitted | Yes: `context.onImport`, `context.onApkgImport` and `context.importTargetId` cover I, A and D. |
| `src/components/cards/CardList.test.tsx:343` | Legacy `deck` plus `allDecks` | Test | `shows New and Import buttons when not in select mode` | I panel entry point only; no import is submitted | Yes for the shared entry point, context import callbacks and D target id; S is supplied by `schedulingConfig`, and M is partial. |
| `src/components/cards/CardList.test.tsx:358` | Legacy `deck` plus `allDecks` | Test | `calls onNewCard when New card button is clicked` | None of the listed legacy capabilities; new-card navigation callback | No listed capability is asserted; the shared callback remains available with context, S remains supplied, and M is partial. |
| `src/components/cards/CardList.test.tsx:374` | Legacy `deck` plus `allDecks` | Test | `offers the lesson action for linking existing cards` | L: the `onLinkExisting` action is exposed and called | Yes as a base prop alongside context; it is not a `CardListContext` field. |
| `src/components/cards/CardList.test.tsx:390` | Legacy `deck` plus `allDecks` | Test | `marks linked cards and removes their lesson link instead of deleting the card` | L: linked-card rendering and `onUnlinkCard`; deletion is correctly suppressed | Yes as base props (`linkedCardIds` and `onUnlinkCard`) alongside context. |
| `src/components/cards/CardList.test.tsx:409` | Legacy `deck` plus `allDecks` | Test | `does not show “Assign to lesson…” without assignableLessons/courseId` | B gating only: confirms assignment is hidden without the enabling props | Yes as base props alongside context; the context adapter itself does not own lesson assignment. |
| `src/components/cards/CardList.test.tsx:424` | Legacy `deck` plus `allDecks` | Test | `bulk-assigns selected cards to a lesson` | B: selected cards are assigned to `lesson-1` | Yes as base props alongside context; the assignment repository path is independent of the Deck union. U is also wired by the shared CardList implementation, but this test does not invoke its Undo action. |
| `src/components/cards/CardList.test.tsx:447` | Legacy `deck` plus `allDecks` | Test | `unassigns selected cards when the Unassigned option is chosen` | B: selected cards are assigned to `null` (Unassigned) | Yes as base props alongside context. U is wired by the shared implementation but not exercised by this test. |
| `src/components/cards/CardList.test.tsx:488` | Legacy `deck` plus `allDecks` | Test | `groups a generated card under a sequence header with a card count` | Generated-card grouping and owner labelling only; G read-only action rules are not asserted here | Yes: generated grouping and the shared CardListBody/CardRow do not depend on the Deck union. |
| `src/components/cards/CardList.test.tsx:505` | Legacy `deck` plus `allDecks` | Test | `shows an “Edit sequence” link` | Generated-card owner-edit affordance only; G read-only action rules are not asserted here | Yes: the shared generated-card path works with context. |
| `src/components/cards/CardList.test.tsx:520` | Legacy `deck` plus `allDecks` | Test | `badges a generated card and hides its select checkbox and delete action` | G: generated-card badge, selection exclusion and delete exclusion | Yes: the rule is enforced by CardListBody/CardRow from card ownership fields, not by the Deck shape. |
| `src/components/cards/CardList.test.tsx:559` | Legacy `deck` plus `allDecks` | Test | `groups an occlusion-generated card ... and hides its select checkbox and delete action` | G: occlusion grouping, badge, selection exclusion and delete exclusion | Yes: the rule is shared and independent of the Deck shape. |

### Capabilities not exercised by a legacy-shaped test

The legacy render sites do not actually execute these paths, even though the implementation has
legacy fallbacks for them:

- **M:** no legacy test supplies more than one deck or submits the Move action. The only move
  assertion is the context test at `CardList.test.tsx:194`, which supplies `moveTargets` and
  `onMove`.
- **A:** no legacy test triggers `onApkgImport` or the legacy `importApkgResult` fallback.
- **U:** no legacy test invokes an Undo toast after a mutation. The context move test at line 194
  asserts the context restore hook instead.
- **D:** no legacy test submits parsed import data through `UnifiedImportPanel`, so no duplicate
  count is observed. The panel receives the legacy `deck.id` as its target when it is opened.

The context-only tests at `CardList.test.tsx:194` and `CardList.test.tsx:234` explicitly cover
analytics, parsed-card import, move plus restore, and APKG import through the context capabilities;
they are not legacy callers and are therefore not included in the legacy count.

## Test seams and non-callers found during the search

These references were included in the search but are not additional runtime CardList callers:

| File and line | Finding | Classification |
| --- | --- | --- |
| `src/pages/QuestionBank.test.tsx:43-72` | Mocks the CardList module and observes `context`, `courseId` and `assignableLessons`; the mock has no `deck` or `allDecks` prop | Test seam; context-shaped production wiring, not a legacy caller |
| `src/components/cards/LessonCardsSection.test.tsx:53-86` | Mocks the CardList module and observes context import/APKG/restore callbacks plus lesson-link props; the mock has no `deck` or `allDecks` prop | Test seam; context-shaped production wiring, not a legacy caller |
| `src/components/cards/GeneratedCardGroup.tsx:12,77` | Imports and renders the exported `CardListBody`, not `CardList` | Shared rendering helper; not a CardList caller and has no Deck-shaped API |
| `src/pages/SequenceEditor.test.tsx:32` | Mentions the Question Bank CardList mock in a comment only | Not a caller |
| `src/components/cards/CardList.tsx:844` | CardList renders its own `CardListBody` | Internal implementation, not a caller |

No re-export or wrapper was found. The complete source-level caller count is therefore:

- **Production CardList render sites:** 4
- **Production legacy callers:** 0
- **Test CardList render sites:** 21 (19 legacy, 2 context)
- **CardList module mock seams:** 2 (both context-shaped)
- **Other CardListBody consumers:** 1

## What removal would cost

The table below distinguishes whether a capability is reachable in the current product UI from
whether a legacy caller would lose its Deck fallback. “Current CardList UI” refers to the four
production callers found in `src/`; broader product reachability is stated as unknown where the
source inventory cannot prove it.

| Legacy capability | Reachable from the current product UI? | Behaviour lost if the union were deleted as-is |
| --- | --- | --- |
| Sibling-deck “Move to…” | **Not through the current CardList UI.** All production callers use context, none supplies move targets, and the current `courseCardListContext` factory does not wire `moveTargets` or `onMove`. No other production CardList surface was found; whether another non-CardList product surface offers an equivalent move action could not be determined from this inventory. | Any old or external Deck caller would lose CardList's direct `moveCards` path and its sibling-deck target list. The current context interface can represent the capability, but the Course/Lesson factory does not currently provide it. |
| Card import | **Yes.** The Course Question Bank and Lesson card surfaces open `UnifiedImportPanel` through context. | No current Course/Lesson import behaviour would be lost. A retained legacy caller would lose the direct `createCards(deck.id, cards)` fallback unless it supplied the context import callback. |
| APKG import | **Yes.** The same Question Bank and Lesson surfaces expose the APKG route through `onApkgImport`. | No current Course/Lesson APKG behaviour would be lost. A retained legacy caller would lose the direct `importApkgResult(result, deck.id)` fallback unless it supplied the context callback. |
| Card analytics | **Yes.** CardList expands `CardAnalytics` for cards in both context and legacy shapes; the current production callers use context. | No current analytics view would be lost. A legacy caller would need to provide `schedulingConfig` rather than a full Deck. |
| Scheduling configuration | **Yes.** The context adapter supplies `schedulingConfig`, which is consumed by CardList and CardAnalytics. | No current scheduling display or calculations in CardList would be lost. The direct use of the full legacy Deck as the scheduler config would disappear for old callers. |
| Bulk assignment | **Yes.** The Question Bank supplies `courseId` and `assignableLessons`; CardList's assignment path is shared and is not a Deck-specific context capability. | No current Question Bank assignment behaviour would be lost. A legacy caller that relies on the same base props would need to keep them while changing only its shape. |
| Lesson linking | **Yes.** LessonCardsSection supplies `onLinkExisting`, `linkedCardIds` and `onUnlinkCard`; the Question Bank and Lesson production paths use the shared context branch. | No current linking or unlinking behaviour would be lost. The base props already work alongside context. |
| Generated-card read-only rules | **Yes.** The Question Bank and Lesson paths use the same CardListBody/CardRow ownership checks. | No current generated-card protection would be lost. The rules are independent of the Deck union. |
| Undo | **Yes for shared destructive bulk actions.** Current context callers receive `onRestore` from the factory, but none supplies `onMove`, so the context-specific move-and-restore path is not currently reachable from production CardList UI. | No current Course/Lesson Undo behaviour would be lost. An old caller would lose the legacy direct restore fallback unless it supplied the context restore capability. |
| Duplicate checks | **Yes.** `UnifiedImportPanel` checks parsed cards against the target id; legacy CardList supplies `deck.id`, while `courseCardListContext` supplies `importTargetId` from `schedulingConfig.id`. | No current Course/Lesson duplicate warning would be lost. A legacy caller would need to provide the context import target id so the importer continues checking the correct scheduling unit. |

The largest uncertainty is product reachability outside the four CardList callers: this inventory
can establish that the legacy CardList move UI is not reachable through current CardList production
callers, but it cannot establish whether a separate non-CardList surface or an external integration
provides an equivalent move operation.
