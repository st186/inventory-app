// Saves a file the app made (backup, export) where the person can find it.
// - Android app: a web view cannot download a blob: link, so the bytes go to the native Files
//   plugin (android/.../FilePlugin.java) in base64 pieces of about 1 MB (one giant string through
//   the bridge can run the web view out of memory). It writes to Downloads/Bunny Momos and opens
//   the share sheet.
// - iPhone / iPad (Safari or the Home Screen app): the share sheet ("Save to Files"), where a
//   download link after the work is done often does nothing. Cancelling it throws, so the caller
//   doesn't count the file as saved.
// - Other browsers: the usual download link.
import { Capacitor, registerPlugin } from '@capacitor/core';

interface FilesPluginApi {
  saveFile(options: { name: string; base64: string; mimeType: string; append?: boolean; done?: boolean; share?: boolean }): Promise<{ uri?: string; location?: string }>;
}

const Files = registerPlugin<FilesPluginApi>('Files');
const isAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
// A multiple of 3 so each piece is whole base64 on its own.
const PIECE = 768 * 1024;

function base64Of(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('Could not read the file'));
    reader.readAsDataURL(blob);
  });
}

export async function saveFile(name: string, data: Blob, mimeType: string): Promise<void> {
  if (isAndroidApp()) {
    let offset = 0;
    do {
      const piece = data.slice(offset, offset + PIECE);
      const done = offset + PIECE >= data.size;
      await Files.saveFile({ name, mimeType, base64: await base64Of(piece), append: offset > 0, done, share: true });
      offset += PIECE;
    } while (offset < data.size);
    return;
  }
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS && typeof navigator.share === 'function') {
    const file = new File([data], name, { type: mimeType });
    if (!navigator.canShare || navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return;
      } catch (err) {
        // Too long after the tap for Safari (NotAllowedError): fall back to the link below.
        if ((err as Error)?.name !== 'NotAllowedError') throw err;
      }
    }
  }
  const url = URL.createObjectURL(data.type === mimeType ? data : new Blob([data], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Give the browser a moment to start the download before freeing the memory.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
