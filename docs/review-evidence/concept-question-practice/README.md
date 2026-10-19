# Concept question practice browser evidence

These screenshots contain public synthetic fixtures, not private course or bank content. The implementation owner and an independent Luna reviewer inspected the desktop and mobile skills screens; the owner also inspected the multipart workspace.

- [Desktop skills](desktop-skills.png), 1280 × 800.
- [Mobile skills](mobile-skills.png), 390 × 844.
- [Mobile multipart practice](mobile-multipart.png), 390 × 844.

Captured by `PLAYWRIGHT_WEB_PORT=4317 bun run verify:browser -- --project=chromium concept-practice.spec.ts`: eight tests passed in 51.8 seconds. The isolated source receipt records commit `5272103b7c7c284b7732b4f1c908662e5e4f878b` plus staged diff SHA-256 `9aac62b3e23730c05acb002fa26c285e3f4c38488c2f9e47fc06f5ce0523c4fe`; source was unchanged during the run. The resulting source is included in the final polish commit.

Coverage includes invalid import with retained input and recovery, import/reimport, static written/calculation/native multiple-choice parts, partial credit, immutable corrections, undo, leave/resume/reload, finite generated variants and explicit familiar fallback, long maths/tables/options, narrow viewport bounds, visible focus and native keyboard type-ahead/Tab/Enter traversal. The long chooser regression failed before its width constraint at both viewports and passes here.

Private Physics and History banks were separately imported through throwaway browser courses and checked in IndexedDB. Private source text, screenshots and bank files are excluded from this repository. Generated families are stored once and resolved into attempt receipts. Mixed practice balances available type/difficulty/context cells; official mark-weighted paper/AO/series sidecars are not applied.
