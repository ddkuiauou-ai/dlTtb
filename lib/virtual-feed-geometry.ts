/** Window virtualizers use document coordinates; row transforms use local coordinates. */
export function feedDocumentOffset(viewportTop: number, scrollY: number): number {
  const offset = viewportTop + scrollY;
  return Number.isFinite(offset) ? Math.max(0, offset) : 0;
}

export function virtualRowOffset(start: number, scrollMargin: number): number {
  return start - scrollMargin;
}

export type FeedViewportAnchor = { id: string; top: number };

/** A soft refresh can repeat a retained post in a newly selected upper section. */
export function findFeedAnchorElement(root: HTMLElement | null, id: string): HTMLElement | null {
  if (!root) return null;
  for (const element of root.querySelectorAll<HTMLElement>('.post-anchor[id]')) {
    if (element.id === id) return element;
  }
  return null;
}

export function readFeedViewportAnchor(root: HTMLElement): FeedViewportAnchor | null {
  if (window.scrollY <= 0.5) return null;
  let topEdge = 0;
  for (const header of document.querySelectorAll<HTMLElement>('header.sticky, [data-sticky="top"], [data-slot="app-header"]')) {
    const rect = header.getBoundingClientRect();
    if (rect.top <= 0 && rect.bottom > 0) topEdge = Math.max(topEdge, rect.bottom);
  }
  let closest: FeedViewportAnchor | null = null;
  let distance = Infinity;
  for (const element of root.querySelectorAll<HTMLElement>('.post-anchor[id]')) {
    const rect = element.getBoundingClientRect();
    if (rect.bottom <= topEdge || rect.top >= window.innerHeight) continue;
    const nextDistance = Math.abs(rect.top - topEdge);
    if (nextDistance < distance) {
      distance = nextDistance;
      closest = { id: element.id, top: rect.top };
    }
  }
  return closest;
}

/** Apply only the residual movement; the browser may already have anchored the viewport. */
export function correctFeedViewportAnchor(root: HTMLElement, anchor: FeedViewportAnchor): boolean {
  const element = findFeedAnchorElement(root, anchor.id);
  if (!element) return false;
  const delta = element.getBoundingClientRect().top - anchor.top;
  if (Math.abs(delta) > 0.5) window.scrollBy({ top: delta, behavior: 'auto' });
  return true;
}
