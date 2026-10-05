import assert from 'node:assert/strict';
import test from 'node:test';
import { Virtualizer, windowScroll } from '@tanstack/react-virtual';
import { correctFeedViewportAnchor, feedDocumentOffset, virtualRowOffset } from '../virtual-feed-geometry';

function model(heights: number[], margin: number, viewport: number, overscan = 3) {
  let onOffset: ((offset: number, scrolling: boolean) => void) | undefined;
  const scrollCalls: ScrollToOptions[] = [];
  const fakeWindow = { window: null as unknown, scrollTo: (options: ScrollToOptions) => scrollCalls.push(options) };
  fakeWindow.window = fakeWindow;
  const virtualizer = new Virtualizer<Window, Element>({
    count: heights.length,
    getScrollElement: () => fakeWindow as unknown as Window,
    estimateSize: () => 216,
    initialRect: { width: 1280, height: viewport },
    initialOffset: 0,
    overscan,
    scrollMargin: margin,
    scrollToFn: windowScroll,
    observeElementRect: (_, callback) => callback({ width: 1280, height: viewport }),
    observeElementOffset: (_, callback) => { onOffset = callback; callback(0, false); return () => {}; },
  });
  virtualizer._willUpdate();
  virtualizer.getVirtualItems();
  heights.forEach((height, index) => { virtualizer.resizeItem(index, height); virtualizer.getVirtualItems(); });
  return { virtualizer, scrollCalls, scroll: (offset: number) => onOffset?.(offset, false) };
}

function expectedRows(heights: number[], margin: number, scroll: number, viewport: number) {
  let start = margin;
  return heights.flatMap((height, index) => {
    const end = start + height;
    const row = { index, start, end };
    start = end;
    return row.start < scroll + viewport && row.end > scroll ? [row] : [];
  });
}

test('document position is independent of current window scroll, including fractional pixels', () => {
  assert.equal(feedDocumentOffset(137.5, 492), 629.5);
  assert.equal(feedDocumentOffset(-3370.5, 4000), 629.5);
  assert.equal(feedDocumentOffset(Number.NaN, 0), 0);
});

test('paired document margin and local row placement cover all visible rows across layouts', () => {
  let cases = 0;
  for (const margin of [0, 180, 629, 3000]) for (const viewport of [360, 720, 983]) {
    for (const cols of [1, 2, 3]) for (const posts of [0, 1, 2, 3, 17, 59, 122]) {
      for (const pattern of [90, 118, 216, 440, 'mixed'] as const) {
        const heights = Array.from({ length: Math.ceil(posts / cols) }, (_, index) => pattern === 'mixed' ? [90, 118, 384, 173, 620, 240, 188][index % 7] : pattern);
        const total = heights.reduce((sum, height) => sum + height, 0);
        const max = Math.max(0, margin + total - viewport);
        const { virtualizer, scroll } = model(heights, margin, viewport, Math.max(2, Math.ceil(viewport * 0.3 / 216)));
        for (const offset of [0, Math.min(492, max), Math.min(margin, max), Math.min(margin + 250, max), Math.min(margin + total / 2, max), max]) {
          scroll(offset);
          const actual = virtualizer.getVirtualItems();
          const byIndex = new Map(actual.map(row => [row.index, row]));
          for (const expected of expectedRows(heights, margin, offset, viewport)) {
            const row = byIndex.get(expected.index);
            assert.ok(row, `missing ${expected.index} at margin=${margin} scroll=${offset}`);
            assert.equal(margin + virtualRowOffset(row.start, margin), expected.start);
          }
          cases += 1;
        }
      }
    }
  }
  assert.equal(cases, 7560);
});

test('legacy zero margin and margin-only placement reproduce the regression controls', () => {
  const heights = Array<number>(50).fill(118);
  const legacy = model(heights, 0, 983);
  legacy.scroll(492);
  const indexes = new Set(legacy.virtualizer.getVirtualItems().map(row => row.index));
  assert.ok(expectedRows(heights, 629, 492, 983).some(row => !indexes.has(row.index)));
  const marginOnly = model(heights, 629, 983);
  const first = marginOnly.virtualizer.getVirtualItems()[0];
  assert.equal(629 + first.start - 629, 629);
  assert.notEqual(629 + first.start, 629);
});

test('360 successive position and count changes retain visible coverage on the same virtualizer', () => {
  let cases = 0;
  for (const viewport of [360, 720, 983]) for (const cols of [1, 2, 3]) {
    const { virtualizer, scroll } = model(Array(Math.ceil(59 / cols)).fill(216), 629, viewport);
    for (const margin of [629, 180, 3000, 0, 629]) for (const count of [Math.ceil(59 / cols), Math.ceil(122 / cols)]) {
      virtualizer.setOptions({ ...virtualizer.options, count, scrollMargin: margin });
      const heights = Array(count).fill(216);
      const max = Math.max(0, margin + count * 216 - viewport);
      for (const offset of [0, Math.min(492, max), max / 2, max]) {
        scroll(offset);
        const rows = new Map(virtualizer.getVirtualItems().map(row => [row.index, row]));
        for (const expected of expectedRows(heights, margin, offset, viewport)) {
          const row = rows.get(expected.index);
          assert.ok(row, `missing ${expected.index} after margin=${margin} count=${count}`);
          assert.equal(margin + virtualRowOffset(row.start, margin), expected.start);
        }
        cases += 1;
      }
    }
  }
  assert.equal(cases, 360);
});

test('position changes and appended rows preserve existing measured heights', () => {
  const { virtualizer, scroll } = model(Array<number>(60).fill(118), 629, 983);
  scroll(4000);
  const before = virtualizer.getVirtualItems().map(row => row.index);
  virtualizer.setOptions({ ...virtualizer.options, count: 80 });
  assert.deepEqual(virtualizer.getVirtualItems().map(row => row.index), before);
  virtualizer.setOptions({ ...virtualizer.options, scrollMargin: 3000 });
  virtualizer.getVirtualItems();
  assert.ok(virtualizer.measurementsCache.slice(0, 60).every(row => row.size === 118));
});

test('default window scroller applies corrections when a measured row above the viewport grows', () => {
  const { virtualizer, scroll, scrollCalls } = model(Array<number>(40).fill(200), 629, 983);
  scroll(900);
  scrollCalls.length = 0;
  virtualizer.resizeItem(0, 220);
  assert.equal(scrollCalls.at(-1)?.top, 920);
});

test('a retained feed anchor is selected within its root when an upper section repeats the same ID', () => {
  const scrollCalls: ScrollToOptions[] = [];
  const inside = { id: 'post-shared:42', getBoundingClientRect: () => ({ top: 118 }) };
  const outside = { id: inside.id, getBoundingClientRect: () => ({ top: -900 }) };
  const root = {
    contains: (element: unknown) => element === inside,
    querySelectorAll: (selector: string) => {
      assert.equal(selector, '.post-anchor[id]');
      return [inside];
    },
  } as unknown as HTMLElement;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { scrollBy: (options: ScrollToOptions) => scrollCalls.push(options) } });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { getElementById: () => outside } });
    assert.equal(correctFeedViewportAnchor(root, { id: inside.id, top: 100 }), true);
    assert.equal(scrollCalls.at(-1)?.top, 18);
    assert.equal(correctFeedViewportAnchor(root, { id: 'post-absent', top: 100 }), false);
    assert.equal(scrollCalls.length, 1);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
