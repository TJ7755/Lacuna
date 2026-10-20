# Forwarding courses and independent Gaps classes

The [other-device Share panel](share-other-device.png) exposes the existing link,
Copy action and QR code without publisher credentials. Link replacement remains
inside the separate management disclosure.

The Gaps connection form accepts a public course link on
[desktop](gaps-course-link-desktop.png) and [mobile](gaps-course-link-mobile.png).
The class owns its encrypted connection and teacher key whilst content continues
from the original publisher.

Browser regression coverage uses the real relay handler backed by its in-memory
store. It verifies direct and class-link imports, publisher updates, copying without
write credentials, independent class creation, encrypted connection downloads,
restoration and absence of a learner database in standalone Gaps. The trial-enabled
daily-flow scenario exercises class setup, a pinned invitation, pupil consent and
encrypted evidence delivery to the independent class.

The screenshots are automated test captures; they are not evidence of a human
teacher trial or production deployment. Native Electron packages were not exercised.
