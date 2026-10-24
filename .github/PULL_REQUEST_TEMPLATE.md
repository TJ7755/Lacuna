## Problem

Describe the concrete failure or need, what triggers it, and what the user observes.

## Change

Explain the resulting behaviour and how the implementation achieves it. Name the invariant or
workflow being changed and any trade-offs that matter to a reviewer.

## Scope and approval

Link the issue and any maintainer decision establishing the intended behaviour. State the target
branch, stack position and non-goals where relevant.

Describe any persisted-data, backup/import, wire-format, security or release impact, including
migration and rollback consequences where applicable. Record actual approval and unresolved review
points; distinguish approval already given from approval still required by CONTRIBUTING.md.

## Verification

Record the candidate commit or local state checked, exact commands and their results. For behaviour
changes, describe the regression evidence and what fails before the fix and passes afterwards.

Include runtime observations, screenshots or recordings where they help establish the result.
Upload supporting evidence to this pull request rather than committing it, and state precisely what
it proves.

Identify relevant platforms and scenarios that remain unverified, why checks stopped or could not
run, and what is needed to complete them. Do not claim a passing result for checks that did not run.
