import { XLSX_MIME, type FileWriter } from './sinks/excel-sink';

/** Uint8Array -> base64, in chunks so big files don't overflow the call stack. */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * FileWriter for the extension: saves the file in the Downloads folder with chrome.downloads,
 * overwriting the previous version. Chrome only allows paths inside Downloads.
 * Needs the optional "downloads" permission (asked when you turn Excel on).
 */
export const downloadsWriter: FileWriter = {
  async write(fileName, bytes) {
    if (!chrome.downloads) throw new Error('Allow downloads: turn Excel off and on again in Integrations.');

    const options = { filename: fileName, conflictAction: 'overwrite' as const, saveAs: false };
    let id: number;
    let blobUrl = '';
    try {
      // Chrome: data: URL, because the popup can close before a blob: download starts.
      id = await chrome.downloads.download({ ...options, url: `data:${XLSX_MIME};base64,${toBase64(bytes)}` });
    } catch {
      // Firefox does not download data: URLs: use a blob: URL, freed when the download ends.
      blobUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: XLSX_MIME }));
      id = await chrome.downloads.download({ ...options, url: blobUrl });
    }
    try {
      await waitUntilDone(id);
    } finally {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    }
  },
};

/** Resolve when the download finishes; reject with a clear message if it fails. */
function waitUntilDone(id: number, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => finish(), timeoutMs); // still running: assume OK
    const listener = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id !== id || !delta.state) return;
      if (delta.state.current === 'complete') finish();
      if (delta.state.current === 'interrupted') {
        chrome.downloads.search({ id }).then(([item]) => {
          const reason = item?.error ?? 'unknown error';
          finish(new Error(`Could not write the Excel file (${reason}). If it is open in Excel, close it and try again.`));
        });
      }
    };
    function finish(error?: Error) {
      clearTimeout(timer);
      if (done) return;
      done = true;
      chrome.downloads.onChanged.removeListener(listener);
      if (error) reject(error);
      else resolve();
    }
    chrome.downloads.onChanged.addListener(listener);
    // Small files can finish before the listener is added: check the current state too.
    chrome.downloads.search({ id }).then(([item]) => {
      if (item?.state === 'complete') finish();
      if (item?.state === 'interrupted') {
        finish(new Error(`Could not write the Excel file (${item.error ?? 'unknown error'}). If it is open in Excel, close it and try again.`));
      }
    });
  });
}
