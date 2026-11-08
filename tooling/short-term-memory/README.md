# Offline short-term memory harness

The [frozen Arc 3 benchmark](https://github.com/TJ7755/Lacuna/blob/fcfd3c6008fb35730fef609083b732fe360baa62/tooling/short-term-memory/BENCHMARK.md)
records the model selection and evidence.

## Dataset and licence

The source is
[`open-spaced-repetition/anki-revlogs-10k`](https://huggingface.co/datasets/open-spaced-repetition/anki-revlogs-10k),
the current corpus used by the
[`srs-benchmark`](https://github.com/open-spaced-repetition/srs-benchmark) project. The
dataset contains 727,738,650 review events from 10,000 anonymised Anki collections and has
DOI `10.57967/hf/3435`. Acquisition is pinned to dataset revision
`75299740cff05894ef42d7ad990666691efdd2da`; the benchmark source inspected for this work was
revision `70cc4387f573ff20b13ac9c106333a335c8a4cb8`.

The source sample excludes collections with fewer than 5,000 revlogs and over-represents
established Anki users.

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
