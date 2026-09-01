## Outcome

What user-visible or maintainer-visible outcome does this change deliver?

## Non-goals

What is deliberately out of scope?

## Stack position

- Parent/base branch:
- Stack order and related pull requests:
- Will this need rebasing from the latest `master` after a parent merges?

## Invariant or workflow

Which domain invariant or user workflow is being changed? Name the owner module and permitted file
scope. Explain why the change is local and transactional where applicable.

## Persisted, wire-format and security impact

- [ ] No persisted-data, backup/import or schema impact.
- [ ] No network or wire-format impact.
- [ ] No security-boundary or permission impact.

If any box is not applicable, explain the impact here. Include migration, compatibility, capability,
approval and rollback consequences rather than writing “none” without checking.

## Evidence

List exact commands run and their results. Behaviour changes need red-to-green evidence: identify the
test that failed on the merge base and passes here. Documentation, dependency and CI-only changes
need proportionate validation.

## Platform matrix

| Surface | Checked? | Evidence or reason not run |
| --- | --- | --- |
| Web/PWA |  |  |
| Windows Electron |  |  |
| Linux package |  |  |
| macOS package |  |  |
| Relay |  |  |
| AI MCP |  |  |

## Review state

- [ ] Human-written outcome and non-goals are complete.
- [ ] Material UI changes include screenshots.
- [ ] All review conversations are resolved.
- [ ] Risk-bearing data, sync, AI, Electron or release changes have an independent human approval.
- [ ] Net handwritten changes are within 300–600 lines, or the exception is explained.
- [ ] This change does not smuggle unrelated feature work or cleanup into the stack.

## Unresolved conversations

List any unresolved point and its owner. This must be empty before merge.
