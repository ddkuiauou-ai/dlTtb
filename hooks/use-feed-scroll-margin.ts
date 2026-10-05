"use client";

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import {
  correctFeedViewportAnchor,
  feedDocumentOffset,
  readFeedViewportAnchor,
} from '@/lib/virtual-feed-geometry';
import type { FeedViewportAnchor } from '@/lib/virtual-feed-geometry';

/** Observe preceding layout as well as the feed: a feed can move without resizing. */
export function useFeedScrollMargin(
  rootRef: MutableRefObject<HTMLDivElement | null>,
  mode: number | 'auto',
  restoringRef: MutableRefObject<boolean>,
  layoutAnchoringRef: MutableRefObject<boolean>,
) {
  const [position, setPosition] = useState({ margin: typeof mode === 'number' ? mode : 0, ready: false });
  const positionRef = useRef(position);
  const anchorRef = useRef<FeedViewportAnchor | null>(null);
  const userIntentRef = useRef(0);

  const captureAnchor = useCallback(() => {
    if (!restoringRef.current && !layoutAnchoringRef.current && rootRef.current) {
      anchorRef.current = readFeedViewportAnchor(rootRef.current);
    }
  }, [layoutAnchoringRef, restoringRef, rootRef]);

  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const root: HTMLDivElement = element;
    let alive = true;
    let measureFrame = 0;
    let anchorFrame = 0;
    let observer: ResizeObserver | null = null;
    const mutation = new MutationObserver(() => {
      observeLayout();
      scheduleMeasure();
    });

    const scheduleAnchor = () => {
      if (anchorFrame) cancelAnimationFrame(anchorFrame);
      anchorFrame = requestAnimationFrame(() => {
        anchorFrame = 0;
        captureAnchor();
      });
    };

    const measure = () => {
      measureFrame = 0;
      if (!alive) return;
      // A scroll capture runs on the next frame. Do not consume its stale
      // anchor when a same-frame layout change follows a return to the top.
      if (window.scrollY <= 0.5) anchorRef.current = null;
      const margin = typeof mode === 'number'
        ? mode
        : feedDocumentOffset(root.getBoundingClientRect().top, window.scrollY);
      const previous = positionRef.current;
      if (!previous.ready || Math.abs(margin - previous.margin) > 0.5) {
        if (previous.ready && anchorRef.current && !restoringRef.current && !layoutAnchoringRef.current) {
          correctFeedViewportAnchor(root, anchorRef.current);
        }
        const next = { margin, ready: true };
        positionRef.current = next;
        setPosition(next);
      }
      scheduleAnchor();
    };

    function scheduleMeasure() {
      if (!alive || measureFrame) return;
      measureFrame = requestAnimationFrame(measure);
    }

    function observeLayout() {
      observer?.disconnect();
      mutation.disconnect();
      observer = new ResizeObserver(scheduleMeasure);
      observer.observe(root);
      for (let element: Element | null = root; element?.parentElement; element = element.parentElement) {
        const parent = element.parentElement;
        observer.observe(parent);
        mutation.observe(parent, { childList: true });
        for (let sibling = element.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
          observer.observe(sibling);
          mutation.observe(sibling, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
        }
        if (parent === document.body) break;
      }
    }

    const onUserIntent = (event: Event) => {
      if (event instanceof KeyboardEvent && !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) return;
      userIntentRef.current += 1;
    };
    observeLayout();
    measure();
    window.addEventListener('scroll', scheduleAnchor, { passive: true });
    window.addEventListener('resize', scheduleMeasure, { passive: true });
    window.addEventListener('wheel', onUserIntent, { passive: true });
    window.addEventListener('touchstart', onUserIntent, { passive: true });
    window.addEventListener('pointerdown', onUserIntent, { passive: true, capture: true });
    window.addEventListener('mousedown', onUserIntent, { passive: true, capture: true });
    window.addEventListener('keydown', onUserIntent);
    document.addEventListener('load', scheduleMeasure, true);
    document.fonts?.addEventListener('loadingdone', scheduleMeasure);
    return () => {
      alive = false;
      observer?.disconnect();
      mutation.disconnect();
      if (measureFrame) cancelAnimationFrame(measureFrame);
      if (anchorFrame) cancelAnimationFrame(anchorFrame);
      window.removeEventListener('scroll', scheduleAnchor);
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('wheel', onUserIntent);
      window.removeEventListener('touchstart', onUserIntent);
      window.removeEventListener('pointerdown', onUserIntent, true);
      window.removeEventListener('mousedown', onUserIntent, true);
      window.removeEventListener('keydown', onUserIntent);
      document.removeEventListener('load', scheduleMeasure, true);
      document.fonts?.removeEventListener('loadingdone', scheduleMeasure);
    };
  }, [captureAnchor, layoutAnchoringRef, mode, restoringRef, rootRef]);

  return { ...position, anchorRef, userIntentRef, captureAnchor };
}
