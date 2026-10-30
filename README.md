# Lacuna

[![CI](https://github.com/TJ7755/Lacuna/actions/workflows/ci.yml/badge.svg)](https://github.com/TJ7755/Lacuna/actions/workflows/ci.yml)

Lacuna is a local-first revision app built around FSRS-6. Organise material into courses,
lessons and notes, then practise recall Cards towards an exam date. A separate Questions
mode supports automatically marked application problems with independent evidence and scheduling.

## Product direction

Our aim is to be the best in the world at personalised GCSE science revision: choosing
what each student needs to practise next to improve their exam performance.

**GCSE science revision that adapts to what you know, how you answer and when your exams are.**

That ambition covers the complete revision process across biology, chemistry and physics,
boards and tiers:

- **Knowledge:** learn missing material and remember it until the exam.
- **Application:** use that knowledge in unfamiliar situations.
- **Exam technique:** interpret questions, construct explanations, use evidence and show working.
- **Preparation:** allocate practice across papers, deadlines, school teaching order and available time.

Every feature should help choose, deliver or assess the next useful practice. Diagnosing lost
marks is one part of this direction; the broader goal is to answer: **what should I practise
next for my GCSE science exams?**

This is our direction, not a claim that every capability has shipped or that superiority has
been demonstrated. The [focus tracker](https://github.com/TJ7755/Lacuna/issues/902) owns the
delivery plan and evidence needed to assess progress.

## Using Lacuna

Use Lacuna at [getlacuna.app](https://getlacuna.app). Browser study data is local to each
origin: moving from the previous Vercel address requires exporting a full backup there
and importing it at the new address. The previous address remains available.

Study data lives in IndexedDB without an account. Optional device sync uses encrypted relay
payloads. Optional Jev automatic marking sends answers, questions and mark schemes to TypeSafe AI
after you accept its consent warning. Export a full JSON backup from
**Settings → Full backup & recovery** before moving devices or replacing data.

The [contributor guide](CONTRIBUTING.md) covers the complete validation matrix, relay and companion
installations, regression tests and review policy.

## Documentation

- [Documentation index](docs/README.md): operational procedures.
- [GitHub issues](https://github.com/TJ7755/Lacuna/issues): active work.
- [Release maintenance](docs/maintenance/release.md), [security](SECURITY.md) and
  [governance](docs/maintenance/governance.md): operating and contribution boundaries.

## Contributors

- [TJ7755](https://github.com/TJ7755)
- [nc-3388](https://github.com/nc-3388)
- [Jay (jay23606)](https://github.com/jay23606)

Automated contributions: [Claude](https://github.com/claude),
[Dependabot](https://github.com/apps/dependabot), [Vercel](https://github.com/apps/vercel) and
[Cloudflare Workers and Pages](https://github.com/apps/cloudflare-workers-and-pages).

See the [contribution history](https://github.com/TJ7755/Lacuna/graphs/contributors) for the
current list and individual contributions.
