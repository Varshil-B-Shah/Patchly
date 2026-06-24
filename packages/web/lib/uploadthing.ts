// lib/uploadthing.ts
// Screenshot deletion. Called from resolve + delete + bulk-delete routes.
// Errors are swallowed — a failed delete must never fail the comment operation.

import { UTApi } from 'uploadthing/server'

export async function deleteScreenshot(key: string | undefined): Promise<void> {
  if (!key) return
  try {
    await new UTApi().deleteFiles([key])
  } catch (err) {
    console.warn('[Patchly] UploadThing delete failed (non-fatal):', err)
  }
}
