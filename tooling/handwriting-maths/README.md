# Handwritten maths input (prototype)

**Status: in progress. No result yet.**

This is Appendix A.2 of `docs/next_plan.md`. It is exploratory work with no integration
commitment: it has no arc number, it is not imported by the browser or Electron builds,
and it does not touch `src/`. The deliverable is knowledge. A well-documented negative
result is a valid outcome, and is the expected one for the recognition half.

## The question

Can a young student write `x^2 + 3` on a canvas with a finger faster and more happily
than they can find `^` on a keyboard?

Two separable halves, deliberately:

1. **Recognition** — can we turn strokes into a correct expression string at all?
   Probably not well. Measured against public benchmarks (see below).
2. **Input preference** — which entry method is faster and less frustrating for the same
   target expression? **This half survives even if recognition is poor**, and it is the
   half that feeds Arc 11 §11.3's palette design. It is also the half most likely to get
   dropped once the recognition work gets interesting, hence this paragraph.

The harness therefore has three arms entering identical target expressions: canvas,
plain keyboard, and a palette of symbol buttons.

## Pipeline

Recognition is four stages, not one. The plan's original framing ("$1 recogniser over a
per-symbol template set") describes only stage 3.

1. **Stroke capture** — pointer events, resampled and normalised.
2. **Stroke grouping** — deciding which strokes form one symbol. `x`, `=` and often `4`
   are multi-stroke. Temporal and spatial clustering.
3. **Symbol recognition** — see the two arms below.
4. **Layout parsing** — baseline detection and superscript, producing a linear string
   (`x^2+3`). Fraction bars are out of scope for the first pass; `/` covers them.

Stages 2 and 4 are hand-written regardless of how stage 3 is solved, and are where
prototypes of this kind usually stall. They are not the afterthought.

All four stages now exist as pure modules (`group.ts`, `dollarP.ts`, `layout.ts`, joined
by `interpret.ts`). Grouping is horizontal: strokes merge when their x-ranges overlap
substantially or one sits inside the other — the containment rule is what keeps `+` and
`÷` in one piece, since a `+`'s vertical stroke has no width to take a ratio of. A
horizontal rule beats a temporal one because it survives a writer going back to add a
missing symbol, which children do constantly. Layout covers baseline and superscript
only; fractions remain out of scope.

The remaining gap is accuracy, not capability: none of it has been measured against
CROHME's segmentation and layout ground truth yet, which is the next piece of work.

### Two arms for stage 3

- **$P point-cloud recogniser** (`src/dollarP.ts`) — template matching, no ML, no
  weights, no build step. Uses stroke data (order, direction, count) that a bitmap
  classifier discards. Its lever is **per-user calibration**: ~19 symbols drawn once
  each, tuned to one specific hand.
- **A small CNN** — generalises across writers with no calibration, but discards the
  temporal signal and is a weights dependency.

$P rather than $1 proper because $1 is single-stroke only and cannot represent `=`.

The comparison is the point. "Does 30 seconds of per-user calibration beat a generic
pretrained model on a child's handwriting?" is not obvious in either direction, and
neither arm alone answers it.

## Symbol set

Scoped to 11+, not GCSE: digits `0`–`9`, `x`, `y`, `+`, `-`, `*`, `/`, `=`, `(`, `)`,
`.` — 19 classes, plus the superscript *relation* from stage 4. No roots, no `pi`, no
trigonometry. Arc 11 §11.9 already parks the wider key-stage question.

## Datasets and licences

Read this section before training anything that might ship.

| Dataset | Contents | Format | Licence |
| --- | --- | --- | --- |
| [MathWriting](https://arxiv.org/abs/2404.10690) | 253k human expressions, 396k synthetic, ~6k isolated symbols, 244 classes | InkML (strokes) | CC BY-NC-SA 4.0 |
| [CROHME](http://www.iapr-tc11.org/mediawiki/index.php/CROHME:_Competition_on_Recognition_of_Online_Handwritten_Mathematical_Expressions) | ~8.8k expressions, 111 classes, with segmentation and layout ground truth | InkML + MathML | CC BY-NC-SA 4.0 |
| [HASYv2](https://arxiv.org/pdf/1701.08380) | 150k+ instances, 369 classes | 32x32 images | ODbL |
| MNIST | 70k digits | images | effectively unencumbered |

Two consequences:

- **Stages 2 and 4 are measurable.** CROHME ships per-symbol segmentation and layout
  ground truth, so stroke grouping and superscript detection get real numbers against a
  public benchmark rather than an impression formed on the author's own scribbles.
- **Both arms train on the same public strokes.** InkML is trajectory data, so
  MathWriting's isolated symbols serve the $P template arm and the CNN arm alike. The
  comparison is controlled.

**Licence caveat, recorded here so it is not discovered late.** Lacuna is MIT.
MathWriting and CROHME are CC BY-NC-SA 4.0. Lacuna sells nothing, so the NonCommercial
term is not the difficulty; **ShareAlike** is. If a trained model is a derivative of its
training data — unsettled, but assume it may be — then weights trained on those two
datasets carry NC and SA obligations that the repository's MIT licence tells downstream
forkers do not exist. For this prototype it does not matter, because nothing ships. If
handwriting input is ever promoted into `src/`, retrain on HASYv2 (ODbL) or on
self-collected strokes.

**These are the wrong writers.** All four corpora are adults writing general mathematics
across hundreds of symbols. The target is 11+ children across nineteen. They are a
development benchmark, not an answer. The child-handwriting question and the entire
preference half still require real testers.

## Testing plan

Adults (the author) first, as a smoke test. Recruiting actual 11+ students happens only
if recognition clears a usability bar — otherwise the session wastes their time and
measures nothing.

### First session (22 July 2026) — one adult, experienced typist, phone

Smoke test of the instrument, not evidence. Median seconds over correct entries:

| Method | Median | n | Corrections (total) |
| --- | --- | --- | --- |
| Buttons | 5.25 | 5 | 1 |
| Written | 5.66 | 8 | 0 |
| Typed | 6.84 | 8 | 7 |

Three palette trials were discarded, not scored as failures: the keypad shipped without
`x` and `y` keys, so `2x+6=14`, `x^2+3` and `y=2x^2` were unenterable by construction.

**The one finding worth carrying forward is the cost of `^`.** Splitting each method by
whether the target contains a superscript:

| Method | With `^` | Without `^` | Penalty |
| --- | --- | --- | --- |
| Typed | 8.86 | 6.65 | +2.21 |
| Written | 6.13 | 5.66 | +0.47 |

The two slowest typed entries of the session were exactly the two superscript targets,
and both were the only typed trials to need two corrections each. Handwriting absorbed
the same targets for roughly a fifth of the penalty. This is a direct input to Arc 11
§11.3's palette scope: `^` is the expensive character, which is what the palette exists
to fix, and it is expensive even for someone who knows where every key is.

**Why this understates the case for handwriting, and overstates it.** Understates:
the participant is a fast touch-typist, so the typed arm was at its best and still lost.
Overstates, and more seriously: the canvas arm produces no string. Its correctness is
self-reported and it is timed on *writing the expression*, whereas the typed and button
arms are timed on producing an exact string a machine accepted. Those are not the same
task, and the canvas figure is therefore a lower bound. It becomes comparable only once
stages 2 and 4 exist and the retained ink can be scored.

n = 1, one session, no repetition, no counterbalancing across participants. Treat every
number above as a direction to test, not a result.

## Running it

```
bun install
bun run dev     # canvas harness
bun run test    # unit tests for the pure modules
```

Standalone project with its own `package.json`, following the precedent of
`tooling/short-term-memory` and `tooling/semantic-answer-match`. Not part of the root
build; `bun run build` at the repository root does not see it.

## Failure mode

Funny screenshots and a README that opens honestly. If recognition is poor, that is a
recorded result, not a problem to be engineered around — but the preference numbers must
still be collected, because they are what Arc 11 actually needs.
