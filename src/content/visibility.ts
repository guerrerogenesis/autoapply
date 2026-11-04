/**
 * Security fix #1: only fill fields a person can really see.
 * Malicious pages hide extra fields (display:none parent, opacity 0, off-screen,
 * 1×1 px, clipped containers) to steal data that the user never sees being filled.
 */

/** Smaller than this (in px) is not a real input for a human. */
export const MIN_SIZE = 8;

/** jsdom (tests) has no layout: geometry checks only run in a real browser. */
function hasLayout(el: Element): boolean {
  return el.ownerDocument.documentElement.getBoundingClientRect().width > 0;
}

/** clip: rect(top, right, bottom, left) with (almost) no area, the "sr-only" trick. */
function isClippedAway(clip: string): boolean {
  if (!clip.startsWith('rect(')) return false;
  const n = (clip.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  if (n.length === 1) return true; // rect(0px): same value on all sides
  if (n.length !== 4) return false;
  const [top, right, bottom, left] = n;
  return bottom - top < MIN_SIZE || right - left < MIN_SIZE;
}

export function isUserVisible(el: HTMLElement): boolean {
  if (el.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
  const win = el.ownerDocument.defaultView;
  if (!win) return false;

  // 1. CSS on the field AND every parent (a hidden parent hides the field).
  for (let node: Element | null = el; node; node = node.parentElement) {
    const style = win.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    if (style.opacity !== '' && parseFloat(style.opacity) < 0.1) return false;
    if (isClippedAway(style.clip)) return false; // "sr-only" pattern
  }

  if (!hasLayout(el)) return true;

  // 2. Browser check that also covers content-visibility and closed <details>.
  if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
    return false;
  }

  // 3. Size and position.
  const rect = el.getBoundingClientRect();
  if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) return false;
  const pageLeft = rect.left + win.scrollX;
  const pageTop = rect.top + win.scrollY;
  if (pageLeft + rect.width <= 0 || pageTop + rect.height <= 0) return false; // off-screen left / top
  if (pageLeft >= Math.max(win.innerWidth, el.ownerDocument.documentElement.clientWidth)) return false; // off-screen right

  // 4. Clipped by a parent with overflow hidden (e.g. a 0px-high container).
  for (let node = el.parentElement; node && node !== el.ownerDocument.body; node = node.parentElement) {
    const style = win.getComputedStyle(node);
    if (style.overflow === 'visible' && style.overflowX === 'visible' && style.overflowY === 'visible') continue;
    const box = node.getBoundingClientRect();
    const visibleWidth = Math.min(rect.right, box.right) - Math.max(rect.left, box.left);
    const visibleHeight = Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top);
    if (visibleWidth < MIN_SIZE || visibleHeight < MIN_SIZE) return false;
  }
  return true;
}
