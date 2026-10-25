# Lacuna

[![CI](https://github.com/TJ7755/Lacuna/actions/workflows/ci.yml/badge.svg)](https://github.com/TJ7755/Lacuna/actions/workflows/ci.yml)

Lacuna is a local-first revision app built around FSRS-6. Organise material into courses,
lessons and notes, then practise recall Cards towards an exam date. A separate Questions
mode supports automatically marked application problems with independent evidence and scheduling.

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

- [Documentation index](docs/README.md): source entry points, constraints, procedures and measurements.
- [domain language](docs/domain-language.md): intent and boundaries; source and tests own behaviour.
- [GitHub issues](https://github.com/TJ7755/Lacuna/issues): active work.
- [Release maintenance](docs/maintenance/release.md), [security](SECURITY.md) and
  [governance](docs/maintenance/governance.md): operating and contribution boundaries.
- [Scientific assessment](docs/scientific-assessment.md): evidence and limits of learning claims.

## Contributors

- [TJ7755](https://github.com/TJ7755)
- [nc-3388](https://github.com/nc-3388)
- [Jay (jay23606)](https://github.com/jay23606)

Automated contributions: [Claude](https://github.com/claude),
[Dependabot](https://github.com/apps/dependabot), [Vercel](https://github.com/apps/vercel) and
[Cloudflare Workers and Pages](https://github.com/apps/cloudflare-workers-and-pages).

See the [contribution history](https://github.com/TJ7755/Lacuna/graphs/contributors) for the
current list and individual contributions.
