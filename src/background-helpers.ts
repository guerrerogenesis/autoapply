/**
 * Security fix #4 (defense in depth): content scripts must not read chrome.storage.
 * By default chrome.storage.local is readable from content scripts running inside web pages.
 * We restrict it to extension pages (popup, options) and the service worker.
 */
export async function restrictStorage(): Promise<void> {
  // Chrome only. Firefox does not have setAccessLevel: our content script never reads
  // storage anyway, so the protection still holds there (see SECURITY.md).
  if (typeof chrome.storage.local.setAccessLevel !== 'function') return;
  try {
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  } catch (error) {
    console.warn('Sabi: could not restrict storage access', error);
  }
}
