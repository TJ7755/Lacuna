# Arc 6 — Media Card Types: Audio and Image Occlusion (detailed)

> **Remaining human item:** a real labelled diagram authored end to
> end, both card kinds, light and dark, touch and keyboard, web and Electron.

> Historical Arc 6 design record. UI directions
> were mocked, reviewed and chosen before this plan was written: see
> [`mockups-audio.html`](./mockups-audio.html) and
> [`mockups-occlusion.html`](./mockups-occlusion.html) in this folder. Chosen directions:
> **A1** (audio study), **C2** (audio editor), the **label-box occlusion model** (study),
> and **D1 adapted** (occlusion editor).

## 6.2 Architectural decisions

**Audio is a Markdown asset embed, not a card type.** `Card.type` stays at its three
values. An audio card is an ordinary `front_back` card whose `front` contains an asset
reference, so rendering, search, duplicate detection, share codes, lineage diffing and the
MCP card tools need no new cases. The structured editor writes this shape; the
author never sees the Markdown unless they open the raw editor.

**Consequence, accepted deliberately:** playback behaviour cannot be per-card, because
there is nowhere on an ordinary card to store it. Autoplay-on-reveal and default playback
speed become global settings. A per-card replay limit is the kind of setting an author sets
once, wrongly, and never revisits, so this is judged a feature rather than a cost. If
per-card playback is ever wanted, audio needs a payload and this decision reverses.

**Occlusion follows the Sequence precedent, not Arc 11's `payload`.** An earlier reading
of this arc favoured `payload.kind: 'occlusion'` to inherit Arc 11's versioning and
fallback. That is wrong for the same reason sequences are not payloads: occlusion regions
must survive editing, which means regeneration that preserves FSRS memory state per region,
which needs an owning authoring entity to regenerate _from_. `payload` has no owner.
So: a new `occlusions` table, generated read-only `Card` rows anchored by a stable region
id, and regeneration routed through the existing `diffRegeneration` contract in
`src/db/sequenceGeneration.ts` (content only, never scheduling fields).

Both kinds mask every label region on the front, without exception. A feature card that
left labels visible would be answerable by reading the picture, and a label card that left
its siblings visible is answerable by elimination.
