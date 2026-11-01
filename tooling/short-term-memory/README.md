# Offline short-term memory harness

This directory contains the Arc 3 offline dataset, candidate and evaluation tooling. Arc 3 Task 6
selected a compact short-term model; see [frozen benchmark](https://github.com/TJ7755/Lacuna/blob/fcfd3c6008fb35730fef609083b732fe360baa62/tooling/short-term-memory/BENCHMARK.md).

## Dataset and licence

The source is
[`open-spaced-repetition/anki-revlogs-10k`](https://huggingface.co/datasets/open-spaced-repetition/anki-revlogs-10k),
the current corpus used by the
[`srs-benchmark`](https://github.com/open-spaced-repetition/srs-benchmark) project. The
dataset contains 727,738,650 review events from 10,000 anonymised Anki collections and has
DOI `10.57967/hf/3435`. Acquisition is pinned to dataset revision
`75299740cff05894ef42d7ad990666691efdd2da`; the benchmark source inspected for this work was
revision `70cc4387f573ff20b13ac9c106333a335c8a4cb8`.

Only `revlogs/user_id=*/data.parquet` is required. Each partition supplies chronological
rows containing card ID, rating, learning state, response duration and elapsed seconds since
that card's preceding review. It does not contain card content or absolute timestamps. The
per-card lag is nevertheless retained at the elapsed-second resolution required by the Arc
3 model contract. The source sample includes only collections with at least 5,000 revlogs,
so it over-represents established Anki users. It has no session, plan, hint or distraction
fields; those provenance features can only enter later local adaptation once Lacuna has
collected them, not the global fit from this corpus.

The dataset uses a
[`anki-revlogs-10k` custom licence](https://huggingface.co/datasets/open-spaced-repetition/anki-revlogs-10k/blob/main/LICENSE),
not a permissive open-data licence. It permits FSRS memory research and research by
individuals or university students, forbids public redistribution of the data, and requires
Anki's permission for other contexts. Tom approved local download and benchmark compute for
this work. The project owner subsequently accepted the licence consideration for committing
the selected compact coefficient artefact for later Lacuna runtime integration. That approval
does not amend the upstream licence or permit data redistribution. Raw and constructed datasets
remain private; the local `.gitignore` excludes `data/` and `reports/`.

The Hugging Face repository is gated. Before acquisition, sign in, accept its access terms,
and authenticate with `hf auth login` or set `HF_TOKEN`.
