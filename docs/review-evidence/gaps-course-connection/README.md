# Gaps course connection

Synthetic GCSE Biology courses only. No real pupil data, ownership credential or
passphrase appears in these screenshots.

- [Desktop course card](desktop.png): a saved connection, its verification date,
  key setup and local removal actions.
- [Mobile course card](mobile.png): the same workflow at 390 pixels without
  horizontal overflow.
- [Lacuna export](export.png): the encrypted connection-file export on a published
  course's Share page, after passphrase inputs have been cleared.

Captured from the frozen `6a4011c6` candidate through the isolated repository
browser runner. The Gaps run passed seven checks, including wrong-passphrase
rejection, real-handler owner verification, reload, encrypted-only persistence,
key preparation and removal that preserves the published share. The main-site
run passed five checks covering export, teacher entry, share updates and unpublish.

These are local candidate checks. They do not prove a production domain assignment,
teacher-key publication or active pupil results collection.
