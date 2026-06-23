// lib/uploadthing.ts
// Screenshot deletion lives here. Wired to the real UploadThing delete API in
// Step 2. For now it's a no-op so the resolve/delete route logic is already final.

export async function deleteScreenshot(key: string | undefined): Promise<void> {
  if (!key) return
  // TODO(Step2): call UploadThing's delete API (UTApi().deleteFiles([key])).
  // Swallow errors there — a failed screenshot delete must not fail the comment op.
}
