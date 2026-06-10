export function downloadBlob(document: Document, blob: Blob, filename: string) {
  const objectURL = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = objectURL;
  a.rel = 'noopener';
  a.download = filename;

  try {
    document.body.append(a);
    a.click();
  } finally {
    a.remove();
    // There is no page-level "download completed" event. Defer one task so the click
    // activation can resolve the blob URL before we release our reference to it.
    setTimeout(() => {
      URL.revokeObjectURL(objectURL);
    });
  }
}
