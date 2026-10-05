# Deleting a local game

The Delete game dialog prepares a read-only inventory before confirmation. Cancel does not remove notebook records, files, progress, or exports. The app waits for pending saves, unmounts the game editor/player, and stops its background room sync before deleting.

Confirmation atomically removes the notebook, progress, and asset ownership history from this profile. It writes a content-free deletion marker and a resumable cleanup record. Late notebook/progress writes are rejected, including writes queued before deletion. An embedded game is not automatically imported again after restart. Explicitly importing a saved copy can restore it.

Cleanup removes matching creator drafts, image-capture drafts, unshared semantic-cache entries, app-owned recording files, transcription jobs/results/working files, and locally hosted challenge rooms. The recording ownership history includes files detached from a notebook after this version first saved it. A recording still owned by another saved game is kept. Shared model/runtime downloads, account credentials, application settings, other app profiles, and the user's original upload paths are kept. Chromium's disposable HTTP cache is cleared; future recording responses use `no-store`.

Native exports are optional, separately selected removals. This version records exact outputs it creates in the current profile. It checks the canonical path, filesystem identity, and exported notebook/archive hash before calling the operating system's Trash operation. Renderer-supplied filesystem paths are not accepted. Symlinks, changed outputs, the running application, and application data directories are rejected. A partial or interrupted operation can be retried without moving an already removed output again.

Limits are shown in the dialog: older untracked exports and other people's copies cannot be discovered; exported applications have independent profiles. Immutable recordings inside the running application bundle remain until that app copy is moved to Trash outside the app. Orphaned recordings detached before ownership tracking existed cannot be attributed retroactively. Deletion is ordinary filesystem/database removal, not a guarantee of forensic erasure or removal from system backups.

The storage API exposes `prepareNotebookDeletion`, `deleteNotebook`, `loadPendingNotebookCleanupIds`, `retryNotebookCleanup`, and `isNotebookDeleted`. A failed secondary cleanup preserves its minimal journal so the UI can offer retry after restart; successful cleanup retains only the deletion marker needed to prevent accidental reseeding.

Tests use temporary profiles/files. The native deletion smoke intercepts the final OS Trash call with an isolated test destination; it does not touch the user's Trash or games.
