// Hands a generated file (an export or report) to the person to keep.
//
// Web only for now: a temporary <a download> link. The Android app's WebView can't download
// blob links, so the backup work adds the native (Capacitor) version of this same function,
// with this same signature - callers don't change.
export async function saveFile(name: string, data: Blob, mimeType: string): Promise<void> {
  const blob = data.type === mimeType ? data : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
