# Gaps: school trial data notice

This describes the production **web trial for one class of about 30 pupils**.
Gaps lets a teacher read study reports from a course they have published in Lacuna.
Desktop reporting is not enabled. This notice describes the service; the school
decides its own arrangements for informing pupils, handling requests and using results.

## The pupil chooses

Importing a course or entering a teacher's class code does not turn reporting on.
The pupil must enter a name or class identifier and choose **Share insights with
your teacher**. The choice applies to that course on that device. They can turn
it off in the course's Class insights settings and keep studying without reporting.

While the app is open and online, it can automatically send a report for the latest
completed UTC day. Pupils can also choose **Send latest progress** in their Gaps
class view to publish work recorded today. Publishing again replaces that device's
snapshot for the day rather than adding its activity twice. The teacher chooses
**Refresh results** to read the latest accepted snapshot; this is not live monitoring.
Reports can include study recorded earlier in the selected day, before the pupil
opted in. Days missed while offline are not backfilled. A UTC day ends at midnight
UTC, which is not always local midnight.

## What the teacher receives

Reports can include the chosen name or class identifier, a random identifier for
that course on that device, activity times, question prompts, submitted answers,
recorded marks, marking criteria, card recall and disputed or self-marked results.
The device identifier lets the teacher recognise reports from the same device
across days; a different device can appear separately. This is **not anonymous**
to the teacher, and the chosen name is not verified identity.

Only the selected course and reporting day are included. Private notes,
annotations and reflections are excluded. Reports have activity and size limits;
busy days, long answers and criterion detail can be shortened. They are not a
complete copy of the pupil's learning history.

## What the service can see

The pupil's app encrypts report content for the teacher's key before uploading it.
The relay stores encrypted packets; it does not receive the teacher's private key
or recovery passphrase and cannot decrypt those packets in normal operation.
The teacher's browser decrypts reports locally after explicit unlock.

The relay still sees the course identifier, reporting day, random submission slot,
teacher-key fingerprint, submission time, update revision and packet size. A private
write token authorises updates to a device's snapshot; the relay stores its hash,
not the token itself. The hosting provider
processes network information, including IP addresses and request logs, to serve
and protect the service. Encryption does not hide this metadata. There are no
public or keyless participation counters in this trial. Gaps reporting does not
send these reports to an AI service.

## Retention, stopping and deletion

An encrypted report becomes inaccessible through the relay 84 days after the end
of its reporting day. A daily cleanup job removes expired stored objects in
batches, so physical deletion can take longer. This period describes report
storage, not every hosting log or copy held by a teacher.

Turning reporting off stops future sends and cancels an upload where possible.
It cannot withdraw a packet already accepted by the relay. The course owner can
delete the published share to remove its relay reports as well; this also removes
the shared course link. Removing a connection from Gaps only removes that browser's
connection, not relay reports. Neither expiry nor deletion erases copies a teacher
has already retained or the pupil's local course. Contact the teacher about a
report or a retained copy; do not post pupil data in a public GitHub issue.

## Devices that clear storage

Before the trial, check with school IT whether pupil and teacher devices clear
browser storage at logout. This can remove study history, reporting consent and
saved teacher access even when the browser grants persistent storage. Rehearse
Lacuna Settings → Backups or Device sync to a retained device, and keep teacher
recovery files and codes outside any cleared profile.

## Limits and responsibilities

Anyone with the class code can submit fabricated reports. A missing report does
not prove absence or lack of study; a report is not verified attainment. Use it
as a prompt for teaching and discussion, not an attendance register.

Keep the teacher's connection file, recovery file and their passphrases private.
Pupils receive only the class code or join link, obtained directly from the teacher.
Losing both the saved teacher key and its encrypted recovery file can make old
reports unreadable; a passphrase alone cannot recreate the key. A compromised
device, substituted invitation or compromised application can defeat these
protections. Closing and locking Gaps clears its open report view; it cannot erase
screenshots, downloads or other copies made outside that view.

Follow the [trial operations procedure](gaps-trial-operations.md) for retention and withdrawal.
