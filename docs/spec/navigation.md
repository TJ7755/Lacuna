# Navigation and state continuity

[App](../../src/App.tsx) owns routes; [AppShell](../../src/components/layout/AppShell.tsx) owns shared
chrome. Resolve current URLs and loaded modules there, not from a copied route table.

Navigation preserves meaningful Course/Lesson scope and entered work. Recovery, Back and returning
from full-screen study must not strand the learner or silently redirect a different destination
selected during a pending save. Interrupted course flow retains identity and replans on resume.

Today's Course titles use navigation buttons; Course paths have their own semantics. Tests should
follow the delivered control's role rather than changing product semantics to rescue an old locator.
Single-Lesson Courses can expose their Lesson directly without creating another Course hierarchy.
Archived material remains reachable through its explicit read-only route.

The next route starts loading immediately. Exiting outlets retain their old parameters while the
location changes, so redirect guards must check presence. Departing controls and focus traps become
inert immediately; they cannot handle input intended for the incoming page. Preserve focus chosen
by the learner while asynchronous work settles. See [rendering pitfalls](../maintenance/engineering-notes.md).

Question-set editing, overview and attempts share a loading boundary and skeleton. Missing sets
or attempts show a focused heading and direct return action. Failed initial reads offer Try again
without reloading or discarding saved work; Technical details stay collapsed. Read-only editing
explains the restriction and retains saved drafts. An attempt retry preserves navigation focus
chosen while its read was pending.

Shared disclosures keep drafts while closed, expose the relevant action first, and do not leave
invisible controls in the Tab order. Closing a confirmation restores a sensible opener only when
its caller has not deliberately chosen another focus target.

Search preserves scope, query and explicit filters. Searching must not mutate study state.
Creation and import share reachable entry points but retain their own validation and destination
semantics. A failed module load must reach bounded recovery instead of an endless skeleton.

[Specification index](../SPEC.md)
