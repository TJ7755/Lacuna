# Upgrade and downgrade procedure

Export a full backup before upgrading and retain it outside the application profile.
Keep the previous installer with that backup if a downgrade may be needed.

Do not attempt an in-place database downgrade. To return to an older build, use a
separate profile with that build and restore its compatible pre-upgrade backup.
Verify the recovered course and study records before removing any newer profile.
