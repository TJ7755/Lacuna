# Feedback form

Settings and Help use a Tally form, loaded only when the learner chooses **Send feedback**.
No Tally scripts run in Lacuna's own page, and no study data, page URL or referrer is attached.

To enable it, publish a form in the maintainer's Tally workspace and set
`VITE_TALLY_FEEDBACK_FORM_ID` to the identifier after `/r/` in its share URL before building.
The setting applies to both web and desktop builds. Leave it unset to hide the action, including
on managed deployments. Changing the identifier requires a rebuild.

Use a required message, optional category and optional contact. Keep the form public without
sign-in, make the destination and retention clear in its notice, and enable the owner's email
notifications. Confirm submission and receipt with a test response before enabling the live link.
Tally owns form validation and the submission confirmation. Responses stay private in its workspace.

The iframe is credentialless and has no access to Lacuna's local database. A plain form link is
available when embedding is blocked. No feedback is queued for later delivery by Lacuna.
