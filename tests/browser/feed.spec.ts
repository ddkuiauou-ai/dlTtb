import { expect, test, type Page } from 'playwright/test';
import { FIXTURE_GENERATED_AT, makeFixturePosts } from '../../lib/testing/feed-fixture';

const pageErrors = new WeakMap<Page, string[]>();
const coarseLogs = new WeakMap<Page, unknown[][]>();
test.beforeEach(async ({ page, context, browser }) => {
  test.info().annotations.push({ type: 'browser-version', description: browser.version() });
  const errors: string[] = [];
  pageErrors.set(page, errors);
  const logs: unknown[][] = [];
  coarseLogs.set(page, logs);
  page.on('console', message => {
    if (!message.text().includes('scroll:coarse')) return;
    void Promise.all(message.args().map(argument => argument.jsonValue())).then(args => { logs.push(args); console.log('Fixture coarse jump:', ...args); }).catch(() => {});
  });
  page.on('pageerror', error => { errors.push(error.message); console.error(`Fixture browser error: ${error.message}`); });
  if (process.env.FEED_TEST_PARSE_DIAGNOSTIC) {
    const cdp = await context.newCDPSession(page);
    cdp.on('Debugger.scriptFailedToParse', async event => {
      try {
        const source = await cdp.send('Debugger.getScriptSource', { scriptId: event.scriptId });
        await test.info().attach('failed-browser-script', { body: source.scriptSource, contentType: 'text/javascript' });
        console.error('Fixture parse failure:', event.url, 'source length', source.scriptSource.length);
      } catch { /* The page may have closed before the diagnostic callback. */ }
    });
    page.on('pageerror', () => {
      void cdp.send('Debugger.enable').catch(() => {});
      void page.evaluate(() => Array.from(document.scripts).filter(script => !script.src && script.type !== 'application/json').flatMap(script => {
        try { new Function(script.textContent ?? ''); return []; }
        catch (error) { return [{ id: script.id, error: String(error), source: script.textContent ?? '' }]; }
      })).then(async scripts => {
        for (const script of scripts) {
          await test.info().attach('invalid-inline-script', { body: script.source, contentType: 'text/javascript' });
          console.error('Invalid fixture inline script:', script.id, script.error, 'source length', script.source.length);
        }
      }).catch(() => {});
    });
  }
});

test.afterEach(async ({ page }) => {
  if (coarseLogs.get(page)?.length) await test.info().attach('coarse-jump-measurements', { body: JSON.stringify(coarseLogs.get(page), null, 2), contentType: 'application/json' });
  const root = page.locator('[data-virtual-feed]');
  if (await root.count()) {
    try { await test.info().attach('final-coordinate-state', { body: JSON.stringify(await inspect(page), null, 2), contentType: 'application/json' }); } catch { /* A failed navigation can leave an incomplete document. */ }
  }
  expect(pageErrors.get(page) ?? [], 'uncaught browser exceptions').toEqual([]);
});

async function settle(page: Page) {
  await expect(page.locator('[data-virtual-feed]')).toHaveAttribute('data-layout-ready', 'true');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function inspect(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-virtual-feed]') as HTMLElement;
    const firstGrid = root.querySelector('[data-index] > .grid') as HTMLElement;
    const cols = getComputedStyle(firstGrid).gridTemplateColumns.split(' ').filter(Boolean).length;
    const offset = root.getBoundingClientRect().top + window.scrollY;
    const margin = Number(root.dataset.scrollMargin);
    const references = Array.from(document.querySelectorAll('[data-reference-id]')).map(el => ({
      id: (el as HTMLElement).dataset.referenceId!,
      height: (el as HTMLElement).dataset.cardHeight ? Number((el as HTMLElement).dataset.cardHeight) : el.getBoundingClientRect().height,
    }));
    const base = `/api/test-feed/${(document.querySelector('[data-scenario]') as HTMLElement).dataset.scenario}`;
    const nav = window.__FEED_NAV__?.get(base);
    const loaded = nav?.getIds() ?? [];
    const activeReferences = loaded.map(id => references.find(reference => reference.id === id)).filter((reference): reference is { id: string; height: number } => Boolean(reference));
    const expected: string[] = [];
    const expectedTops = new Map<string, number>();
    let rowTop = offset;
    for (let i = 0; i < loaded.length; i += cols) {
      const cards = activeReferences.slice(i, Math.min(i + cols, loaded.length));
      for (const card of cards) {
        expectedTops.set(card.id, rowTop - window.scrollY);
        if (rowTop < window.scrollY + window.innerHeight && rowTop + card.height > window.scrollY) expected.push(card.id);
      }
      rowTop += Math.max(...cards.map(card => card.height)) + 16;
    }
    const rendered = Array.from(root.querySelectorAll('.post-anchor')) as HTMLElement[];
    const ids = rendered.map(el => el.id.replace(/^post-/, ''));
    const missing = expected.filter(id => !ids.includes(id));
    const positionErrors = rendered.map(el => ({ id: el.id.replace(/^post-/, ''), top: el.getBoundingClientRect().top }))
      .filter(el => expected.includes(el.id))
      .map(el => ({ id: el.id, error: Math.abs(el.top - (expectedTops.get(el.id) ?? el.top)) }));
    const assignedRowPositionErrors = Array.from(root.querySelectorAll<HTMLElement>('[data-index]')).map(row => {
      const assignedOffset = new DOMMatrixReadOnly(row.style.transform).m42;
      const expectedViewportTop = root.getBoundingClientRect().top + assignedOffset;
      return { index: Number(row.dataset.index), assignedOffset, expectedViewportTop, actualViewportTop: row.getBoundingClientRect().top, error: Math.abs(row.getBoundingClientRect().top - expectedViewportTop) };
    });
    return { offset, margin, cols, missing, ids, expected, positionErrors, assignedRowPositionErrors, loaded, hasMore: nav?.hasMore(), scrollY: window.scrollY, rowCount: root.querySelectorAll('[data-index]').length };
  });
}

async function assertCoverage(page: Page) {
  await settle(page);
  await expect.poll(async () => (await inspect(page)).missing).toEqual([]);
  const state = await inspect(page);
  expect(Math.abs(state.offset - state.margin)).toBeLessThanOrEqual(1);
  expect(Math.max(...state.assignedRowPositionErrors.map(row => row.error), 0)).toBeLessThanOrEqual(1);
  expect(new Set(state.ids).size).toBe(state.ids.length);
  return state;
}

async function anchor(page: Page) {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('[data-virtual-feed] .post-anchor')) as HTMLElement[];
    const node = nodes.find(el => el.getBoundingClientRect().top >= 0 && el.getBoundingClientRect().top < innerHeight) ?? nodes[0];
    return { id: node.id, top: node.getBoundingClientRect().top };
  });
}

test('explicit margin 0 remains a failing positive-offset control', async ({ page }) => {
  await page.goto('/test-feed?legacy=1&top=3000', { waitUntil: 'networkidle' });
  await settle(page);
  await page.evaluate(() => window.scrollTo(0, 3050));
  await expect.poll(async () => (await inspect(page)).missing.length).toBeGreaterThan(0);
});

for (const width of [390, 820, 1440]) {
  test(`correct coordinates and visible rows at width ${width}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 983 });
    await page.goto('/test-feed?top=629&columns=3', { waitUntil: 'networkidle' });
    for (const y of [0, 492, 679, 900, 1200, 1500]) {
      await page.evaluate(scroll => window.scrollTo(0, scroll), y);
      await assertCoverage(page);
    }
    const state = await inspect(page);
    expect(state.cols).toBe(width < 768 ? 1 : width < 1024 ? 2 : 3);
    expect(Math.max(...state.positionErrors.map(item => item.error), 0)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0);
    await test.info().attach('coordinate-measurements', { body: JSON.stringify(state, null, 2), contentType: 'application/json' });
  });
}

test('initial empty, short, and tall upper sections retain every visible feed ID', async ({ page }) => {
  const measurements = [];
  for (const top of [0, 180, 3000]) {
    await page.goto(`/test-feed?top=${top}`, { waitUntil: 'domcontentloaded' });
    for (const relative of [0, 50, 492, 1000]) {
      await page.evaluate(y => window.scrollTo(0, y), top + relative);
      const state = await assertCoverage(page);
      expect(Math.max(...state.positionErrors.map(item => item.error), 0)).toBeLessThanOrEqual(1);
      measurements.push({ top, relative, ...state });
    }
  }
  await test.info().attach('upper-offset-measurements', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
});

test('late upper height changes preserve the reader while top readers stay at top', async ({ page }) => {
  await page.goto('/test-feed?top=629', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo(0, 1200));
  await assertCoverage(page);
  const before = await anchor(page);
  await page.getByRole('button', { name: '상단 3000', exact: true }).click();
  await expect.poll(async () => (await inspect(page)).offset).toBe(3000);
  await assertCoverage(page);
  await expect.poll(() => page.locator(`[data-virtual-feed] .post-anchor[id="${before.id}"]`).evaluate(el => el.getBoundingClientRect().top)).toBeCloseTo(before.top, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: '상단 180', exact: true }).click();
  await expect.poll(async () => (await inspect(page)).offset).toBe(180);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await assertCoverage(page);
  await page.getByRole('button', { name: '상단 3000', exact: true }).click();
  await expect.poll(async () => (await inspect(page)).offset).toBe(3000);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('button', { name: '상단 180', exact: true }).click();
  await expect.poll(async () => (await inspect(page)).offset).toBe(180);
  await page.getByRole('button', { name: '상단 데이터 전환', exact: true }).click();
  await assertCoverage(page);
  await page.getByRole('button', { name: '스켈레톤 교체', exact: true }).click();
  await expect(page.getByLabel('상단 스켈레톤')).toHaveCount(0);
  await assertCoverage(page);
});

test('returning to top and growing upper content in the same task does not reuse a stale anchor', async ({ page }) => {
  await page.goto('/test-feed?top=629', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo(0, 1200));
  await assertCoverage(page);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const button = Array.from(document.querySelectorAll('button')).find(element => element.textContent?.trim() === '상단 3000');
    button!.click();
  });
  await expect.poll(async () => (await inspect(page)).offset).toBe(3000);
  await settle(page);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

for (const scenario of ['normal', 'delayed', 'duplicates', 'missing', 'error', 'duplicate-only']) {
  test(`append ${scenario}: IDs survive, deduplicate, and terminate`, async ({ page }) => {
    const requests: string[] = [];
    page.on('request', request => { if (request.url().includes('/api/test-feed/')) requests.push(request.url()); });
    await page.goto(`/test-feed?scenario=${scenario}&top=629`, { waitUntil: 'networkidle' });
    await assertCoverage(page);
    const original = (await inspect(page)).loaded.slice(0, 40);
    for (let step = 0; step < 30; step++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await settle(page);
      const state = await inspect(page);
      if (!state.hasMore) break;
      await page.waitForTimeout(scenario === 'delayed' ? 150 : 40);
    }
    await expect.poll(async () => (await inspect(page)).hasMore).toBe(false);
    const final = await inspect(page);
    expect(final.loaded.slice(0, 40)).toEqual(original);
    expect(new Set(final.loaded).size).toBe(final.loaded.length);
    expect(final.loaded.length).toBe(scenario === 'error' ? 40 : scenario === 'missing' ? 80 : 120);
    // A manifest promising a page that returns 404 is an incomplete generation.
    if (scenario === 'error' || scenario === 'missing') {
      await expect(page.getByRole('status')).toContainText('다음 글을 불러오지 못했습니다.');
      await expect(page.getByText('더 이상 글이 없습니다.', { exact: true })).toHaveCount(0);
    } else {
      await expect(page.getByText('더 이상 글이 없습니다.', { exact: true })).toHaveCount(1);
    }
    await page.evaluate(() => window.scrollTo(0, 629));
    await assertCoverage(page);
    const requestCount = requests.length;
    await page.waitForTimeout(500);
    expect(requests.length).toBe(requestCount);
    expect(requests.some(url => url.includes('page-1.json'))).toBe(false);
  });
}

test('mixed measured rows remain positioned after append and return to the start', async ({ page }) => {
  await page.goto('/test-feed?mixed=1&columns=3', { waitUntil: 'networkidle' });
  await assertCoverage(page);
  for (let step = 0; step < 30; step++) {
    await page.evaluate(() => window.scrollBy(0, 350));
    await settle(page);
    if (!(await inspect(page)).hasMore) break;
  }
  await expect.poll(async () => (await inspect(page)).loaded.length).toBe(120);
  for (const y of [900, 679, 629]) {
    await page.evaluate(scroll => window.scrollTo(0, scroll), y);
    await assertCoverage(page);
  }
});

test('direct page 3 access loads the target and recycled sentinels update the URL', async ({ page }) => {
  await page.goto('/test-feed?top=629&page=3', { waitUntil: 'networkidle' });
  await settle(page);
  await expect.poll(async () => (await inspect(page)).loaded.length).toBe(120);
  await expect(page.locator('[data-virtual-feed] .post-anchor[id="post-fixture-normal-081"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => new URL(location.href).searchParams.get('page'))).toBe('3');
  await page.evaluate(() => window.scrollTo(0, 629));
  await assertCoverage(page);
  await expect.poll(() => page.evaluate(() => new URL(location.href).searchParams.get('page'))).toBeNull();
  for (let step = 0; step < 8; step++) { await page.evaluate(() => window.scrollBy(0, 350)); await settle(page); }
  // A virtualized item may have left the DOM. Use the independent fixed-height
  // coordinates to bring page 2's first sentinel back into the observed band.
  await page.evaluate(() => {
    const root = document.querySelector('[data-virtual-feed]')!;
    const offset = root.getBoundingClientRect().top + scrollY;
    window.scrollTo(0, offset + 20 * (102 + 16) - innerHeight * 0.18);
  });
  const target = page.locator('[data-virtual-feed] .post-anchor[id="post-fixture-normal-041"]');
  await expect(target).toBeVisible();
  await expect.poll(() => page.evaluate(() => new URL(location.href).searchParams.get('page'))).toBe('2');
});

test('a detail return marker runs the actual restore hook and consumes its session keys', async ({ page }) => {
  await page.addInitScript(() => {
    const key = 'fixture-normal-false-2';
    sessionStorage.setItem('lastSectionKey/latest', key);
    sessionStorage.setItem(`returnFromPost-${key}/latest`, '1');
    sessionStorage.setItem(`anchorPostId-${key}/latest`, 'fixture-normal-063');
    sessionStorage.setItem(`anchorPage-${key}/latest`, '2');
  });
  await page.goto('/test-feed?top=629', { waitUntil: 'networkidle' });
  await settle(page);
  const target = page.locator('[data-virtual-feed] .post-anchor[id="post-fixture-normal-063"]');
  await expect(target).toBeVisible();
  await expect.poll(() => target.evaluate(el => Math.abs(el.getBoundingClientRect().top - (Math.round(innerHeight * 0.12) + 8)))).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => sessionStorage.getItem('returnFromPost-fixture-normal-false-2/latest'))).toBeNull();
  await expect.poll(() => page.evaluate(() => new URL(location.href).searchParams.get('page'))).toBe('2');
});

test('detail restoration chooses the active feed card when an upper section has the same post ID', async ({ page }) => {
  await page.addInitScript(() => {
    const key = 'fixture-normal-false-2';
    sessionStorage.setItem('lastSectionKey/latest', key);
    sessionStorage.setItem(`returnFromPost-${key}/latest`, '1');
    sessionStorage.setItem(`anchorPostId-${key}/latest`, 'fixture-normal-063');
    sessionStorage.setItem(`anchorPage-${key}/latest`, '2');
    const observer = new MutationObserver(() => {
      if (document.querySelector('[data-duplicate-upper]')) return;
      const upper = document.querySelector('[data-testid="upper-sections"]');
      const card = document.querySelector('[data-virtual-feed] .post-anchor[id="post-fixture-normal-063"]');
      if (!upper || !card) return;
      const clone = card.cloneNode(true) as HTMLElement;
      clone.dataset.duplicateUpper = 'true';
      Object.assign(clone.style, { position: 'absolute', top: '100px', left: '130px', width: '300px', height: '102px', pointerEvents: 'none' });
      upper.prepend(clone);
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.goto('/test-feed?top=629', { waitUntil: 'domcontentloaded' });
  await settle(page);
  await expect(page.locator('[data-duplicate-upper]')).toHaveCount(1);
  expect(await page.evaluate(() => document.getElementById('post-fixture-normal-063')?.hasAttribute('data-duplicate-upper'))).toBe(true);
  const target = page.locator('[data-virtual-feed] .post-anchor[id="post-fixture-normal-063"]');
  await expect(target).toBeVisible();
  await expect.poll(() => target.evaluate(el => Math.abs(el.getBoundingClientRect().top - (Math.round(innerHeight * 0.12) + 8)))).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => sessionStorage.getItem('returnFromPost-fixture-normal-false-2/latest'))).toBeNull();
  await assertCoverage(page);
  await test.info().attach('duplicate-id-scope-measurements', { body: JSON.stringify(await page.evaluate(() => {
    const target = document.querySelector('[data-virtual-feed] .post-anchor[id="post-fixture-normal-063"]')!;
    const upper = document.querySelector('[data-duplicate-upper]')!;
    return { activeFeedTop: target.getBoundingClientRect().top, upperCopyTop: upper.getBoundingClientRect().top, expectedAlignment: Math.round(innerHeight * 0.12) + 8, documentLookupChoosesUpper: document.getElementById('post-fixture-normal-063') === upper, sourceLookupScope: 'active feed root' };
  }), null, 2), contentType: 'application/json' });
});

test('width and column changes preserve the same reading anchor', async ({ page }) => {
  await page.goto('/test-feed?top=629&columns=3', { waitUntil: 'networkidle' });
  for (const y of [629, 900, 1200]) { await page.evaluate(scroll => window.scrollTo(0, scroll), y); await assertCoverage(page); }
  const before = await anchor(page);
  await page.setViewportSize({ width: 390, height: 983 });
  await expect.poll(async () => (await inspect(page)).cols).toBe(1);
  await expect.poll(() => page.locator(`[data-virtual-feed] .post-anchor[id="${before.id}"]`).evaluate((el, top) => Math.abs(el.getBoundingClientRect().top - top), before.top)).toBeLessThanOrEqual(2);
  await page.setViewportSize({ width: 1440, height: 983 });
  await expect.poll(async () => (await inspect(page)).cols).toBe(3);
  await expect.poll(() => page.locator(`[data-virtual-feed] .post-anchor[id="${before.id}"]`).evaluate((el, top) => Math.abs(el.getBoundingClientRect().top - top), before.top)).toBeLessThanOrEqual(2);
});

test('wheel intent during a column change keeps the reader chosen position', async ({ page }) => {
  await page.goto('/test-feed?top=629&columns=3', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo(0, 1200));
  await assertCoverage(page);
  await page.setViewportSize({ width: 390, height: 983 });
  await page.mouse.move(200, 300);
  await page.mouse.wheel(0, 360);
  await page.waitForTimeout(150);
  const userScrollY = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(750);
  expect(Math.abs(await page.evaluate(() => window.scrollY) - userScrollY)).toBeLessThanOrEqual(2);
  await assertCoverage(page);
});

test('a pending append cannot revive column anchoring cancelled by a wheel event', async ({ page }) => {
  let release!: () => void;
  let started = 0;
  const delayedResponse = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/test-feed/normal/page-2.json', async route => {
    started++;
    await delayedResponse;
    await route.fulfill({ json: { generatedAt: FIXTURE_GENERATED_AT, page: 2, posts: makeFixturePosts('normal').slice(40, 80) } });
  });
  await page.goto('/test-feed?top=629&columns=3', { waitUntil: 'domcontentloaded' });
  await settle(page);
  await page.evaluate(() => window.scrollTo(0, 1200));
  await assertCoverage(page);
  await expect.poll(() => started).toBeGreaterThan(0);
  await page.setViewportSize({ width: 390, height: 983 });
  await page.mouse.move(200, 300);
  await page.mouse.wheel(0, 360);
  await page.waitForTimeout(32);
  const userScrollY = await page.evaluate(() => window.scrollY);
  release();
  await expect.poll(async () => (await inspect(page)).loaded.length).toBeGreaterThanOrEqual(80);
  await page.waitForTimeout(750);
  expect(Math.abs(await page.evaluate(() => window.scrollY) - userScrollY)).toBeLessThanOrEqual(2);
  await assertCoverage(page);
});

test('read filtering and switching the list/grid path retain feed IDs', async ({ page }) => {
  await page.goto('/test-feed?top=629', { waitUntil: 'networkidle' });
  await assertCoverage(page);
  await page.evaluate(() => {
    localStorage.setItem('readPosts:v2', JSON.stringify({
      'fixture-normal-001': { ts: Date.now(), title: '회귀 검증 글 001' },
      'fixture-normal-002': { ts: Date.now(), title: '회귀 검증 글 002' },
    }));
    window.dispatchEvent(new Event('readPosts:updated'));
  });
  await page.getByRole('button', { name: '읽음 필터 전환', exact: true }).click();
  await expect.poll(async () => (await inspect(page)).loaded.includes('fixture-normal-001')).toBe(false);
  await assertCoverage(page);
  await page.getByRole('button', { name: '읽음 필터 전환', exact: true }).click();
  await expect.poll(async () => (await inspect(page)).loaded.includes('fixture-normal-001')).toBe(true);
  const ids = (await inspect(page)).loaded;
  await page.getByRole('button', { name: '목록 방식 전환', exact: true }).click();
  await expect(page.locator('[data-virtual-feed]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__FEED_NAV__?.get('/api/test-feed/normal')?.getIds())).toEqual(ids);
  await page.getByRole('button', { name: '목록 방식 전환', exact: true }).click();
  await assertCoverage(page);
});

test('closing the actual modal clears the detail return marker', async ({ page }) => {
  await page.route('**/data/posts/v1/fixture-*.json*', route => route.fulfill({ json: { id: 'fixture-normal-001', title: '검증 상세 글', timestamp: '2026-10-05T00:00:00Z', embeds: [], categories: [], keywords: [], contentHtml: '<p>합성 상세 내용</p>' } }));
  await page.route('**/data/keywords/manifest.json*', route => route.fulfill({ json: {} }));
  await page.goto('/test-feed?top=629', { waitUntil: 'networkidle' });
  await assertCoverage(page);
  await page.getByRole('button', { name: '검증 모달 열기', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('returnFromPost-fixture-normal-false-2/latest'))).toBeNull();
});

test('same-section empty seed adopts newly supplied first-page posts', async ({ page }) => {
  await page.goto('/test-feed?emptySeed=1&top=3000', { waitUntil: 'networkidle' });
  await settle(page);
  expect(await page.evaluate(() => window.__FEED_NAV__?.get('/api/test-feed/normal')?.getIds().length)).toBe(0);
  await page.getByRole('button', { name: '첫 페이지 갱신', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__FEED_NAV__?.get('/api/test-feed/normal')?.getIds().length)).toBe(40);
  await page.evaluate(() => window.scrollTo(0, 3050));
  await assertCoverage(page);
});

test('different JSON generation preserves current posts and presents an update notice', async ({ page }) => {
  await page.route('**/api/test-feed/normal/page-3.json', async route => {
    const response = await route.fetch();
    const data = await response.json();
    data.generatedAt = '2026-10-05T01:00:00.000Z';
    data.posts = data.posts.map((post: { id: string }) => ({ ...post, id: `new-generation-${post.id}` }));
    await route.fulfill({ response, json: data });
  });
  await page.goto('/test-feed?top=629', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo(0, 1200));
  await assertCoverage(page);
  const before = await anchor(page);
  const idsBefore = (await inspect(page)).loaded;
  await page.evaluate(() => window.__FEED_NAV__?.get('/api/test-feed/normal')?.requestLoadMore());
  await expect(page.getByRole('status')).toContainText('새 글 목록이 업데이트되었습니다.');
  const after = await inspect(page);
  expect(after.loaded.slice(0, idsBefore.length)).toEqual(idsBefore);
  expect(after.loaded.every(id => !id.startsWith('new-generation-'))).toBe(true);
  expect(after.hasMore).toBe(false);
  const top = await page.locator(`[data-virtual-feed] .post-anchor[id="${before.id}"]`).evaluate(el => el.getBoundingClientRect().top);
  expect(Math.abs(top - before.top)).toBeLessThanOrEqual(2);
});

test('natural upper cards and actual list/grid cards preserve coordinates and the reader', async ({ page }) => {
  await page.goto('/test-feed?fixed=0&naturalUpper=1', { waitUntil: 'networkidle' });
  // Auth/card cache hydration may initially leave only the section heading.
  // Start the reading-position assertion after actual cards have their sizes.
  await expect.poll(() => page.locator('[data-testid="upper-sections"]').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(200);
  await expect.poll(() => page.locator('[data-reference-id="fixture-normal-001"]').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(50);
  let previousOffset = -1;
  let stableOffsets = 0;
  await expect.poll(async () => {
    const offset = (await inspect(page)).offset;
    stableOffsets = Math.abs(offset - previousOffset) <= 0.5 ? stableOffsets + 1 : 0;
    previousOffset = offset;
    return stableOffsets;
  }).toBeGreaterThanOrEqual(3);
  await assertCoverage(page);
  const initialOffset = (await inspect(page)).offset;
  await page.evaluate(y => window.scrollTo(0, y + 100), initialOffset);
  await assertCoverage(page);
  const before = await anchor(page);
  await page.getByRole('button', { name: '상단 데이터 전환', exact: true }).click();
  await expect.poll(async () => (await inspect(page)).offset).toBeLessThan(initialOffset);
  await assertCoverage(page);
  expect(Math.abs(await page.locator(`[data-virtual-feed] .post-anchor[id="${before.id}"]`).evaluate(el => el.getBoundingClientRect().top) - before.top)).toBeLessThanOrEqual(2);
  const nextAnchor = await anchor(page);
  await page.getByRole('button', { name: '카드 모양 전환', exact: true }).click();
  await assertCoverage(page);
  await expect.poll(() => page.locator(`[data-virtual-feed] .post-anchor[id="${nextAnchor.id}"]`).evaluate((el, top) => Math.abs(el.getBoundingClientRect().top - top), nextAnchor.top)).toBeLessThanOrEqual(2);
  await page.getByRole('button', { name: '카드 모양 전환', exact: true }).click();
  await assertCoverage(page);
});

test('a manual retry after a failed page appends the remaining generation once', async ({ page }) => {
  await page.goto('/test-feed?scenario=error&top=629', { waitUntil: 'networkidle' });
  await assertCoverage(page);
  for (let step = 0; step < 12; step++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await settle(page);
    if (!(await inspect(page)).hasMore) break;
  }
  await expect(page.getByRole('status')).toContainText('다음 글을 불러오지 못했습니다.');
  const before = (await inspect(page)).loaded;
  await page.route('**/api/test-feed/error/page-2.json', route => route.fulfill({ json: { generatedAt: FIXTURE_GENERATED_AT, page: 2, posts: makeFixturePosts('error').slice(40, 80) } }));
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect.poll(async () => (await inspect(page)).loaded.length).toBe(120);
  const after = (await inspect(page)).loaded;
  expect(after.slice(0, before.length)).toEqual(before);
  expect(new Set(after).size).toBe(after.length);
  await expect(page.getByText('더 이상 글이 없습니다.', { exact: true })).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, 629));
  await assertCoverage(page);
});

test('a late manifest from base A cannot replace base B generation or fetching state', async ({ page }) => {
  let release!: () => void;
  let started = 0;
  const delayedResponse = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/test-feed/delayed/manifest.json', async route => {
    started++;
    await delayedResponse;
    await route.fulfill({ json: { generatedAt: '2026-10-05T01:00:00.000Z', lastPage: 3, maxPages: 3, seedPolicy: 'live-seed-dedupe' } });
  });
  await page.goto('/test-feed?scenario=delayed&top=3000', { waitUntil: 'domcontentloaded' });
  await settle(page);
  await expect.poll(() => started).toBeGreaterThan(0);
  await page.getByRole('button', { name: '피드 B 전환', exact: true }).click();
  await expect(page.locator('[data-scenario]')).toHaveAttribute('data-scenario', 'normal');
  await expect.poll(() => page.evaluate(() => window.__FEED_NAV__?.get('/api/test-feed/normal')?.getIds().every(id => id.startsWith('fixture-normal-')))).toBe(true);
  release();
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__FEED_NAV__?.get('/api/test-feed/normal')?.requestLoadMore());
  // This assertion includes real Next development-route/network latency. The
  // original 10s poll expired immediately before a valid 120-ID commit; it is
  // not the independent geometry/reader stabilization tolerance.
  await expect.poll(() => page.evaluate(() => window.__FEED_NAV__?.get('/api/test-feed/normal')?.getIds().length ?? 0), { timeout: 20_000 }).toBeGreaterThanOrEqual(80);
  await page.evaluate(() => window.__FEED_NAV__?.get('/api/test-feed/normal')?.requestLoadMore());
  await expect.poll(() => page.evaluate(() => window.__FEED_NAV__?.get('/api/test-feed/normal')?.getIds().length), { timeout: 20_000 }).toBe(120);
  await expect(page.getByText('새 글 목록이 업데이트되었습니다.', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__FEED_NAV__?.get('/api/test-feed/normal')?.getIds().every(id => id.startsWith('fixture-normal-')))).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 3050));
  await assertCoverage(page);
});

test('a stale captured base A navigation callback cannot lock base B loading', async ({ page }) => {
  let release!: () => void;
  let started = 0;
  const delayedResponse = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/test-feed/delayed/manifest.json', async route => {
    started++;
    await delayedResponse;
    await route.fulfill({ json: { generatedAt: '2026-10-05T01:00:00.000Z', lastPage: 3, maxPages: 3, seedPolicy: 'live-seed-dedupe' } });
  });
  await page.goto('/test-feed?scenario=delayed&top=3000', { waitUntil: 'domcontentloaded' });
  await settle(page);
  await expect.poll(() => started).toBeGreaterThan(0);
  const savedApi = await page.evaluateHandle(() => window.__FEED_NAV__?.get('/api/test-feed/delayed'));
  expect(await savedApi.evaluate(api => typeof api?.requestLoadMore)).toBe('function');
  const bManifest = page.waitForResponse(response => response.url().endsWith('/api/test-feed/normal/manifest.json') && response.status() === 200);
  await page.getByRole('button', { name: '피드 B 전환', exact: true }).click();
  await bManifest;
  await expect.poll(() => page.evaluate(() => window.__FEED_NAV__?.get('/api/test-feed/normal')?.getIds().every(id => id.startsWith('fixture-normal-')))).toBe(true);
  const oldManifest = page.waitForResponse(response => response.url().endsWith('/api/test-feed/delayed/manifest.json') && response.status() === 200);
  release();
  await oldManifest;
  await savedApi.evaluate(api => api?.requestLoadMore());
  await page.evaluate(() => window.__FEED_NAV__?.get('/api/test-feed/normal')?.requestLoadMore());
  await expect.poll(() => page.evaluate(() => window.__FEED_NAV__?.get('/api/test-feed/normal')?.getIds().length ?? 0), { timeout: 20_000 }).toBeGreaterThanOrEqual(80);
  await expect.poll(() => page.evaluate(() => window.__FEED_NAV__?.get('/api/test-feed/normal')?.getIds().length), { timeout: 20_000 }).toBe(120);
  await expect(page.getByText('새 글 목록이 업데이트되었습니다.', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__FEED_NAV__?.get('/api/test-feed/normal')?.getIds().every(id => id.startsWith('fixture-normal-')))).toBe(true);
  await savedApi.dispose();
});

test('IndexedDB keeps ordered page payloads isolated across bases and generations', async ({ page }) => {
  await page.goto('/test-feed?top=3000', { waitUntil: 'networkidle' });
  await settle(page);
  const result = await page.evaluate(async () => {
    const cache = window.__FIXTURE_CACHE__!;
    const post = (id: string, title: string) => ({ id, title, comments: 0, upvotes: 0, viewCount: 0, timeAgo: '', thumbnail: '', content: '' });
    const a = [post('same-id', 'A'), post('second', 'A2')];
    await cache.writePage('/fixture-cache/A', 3, 'G1', a);
    await cache.writePage('/fixture-cache/B', 2, 'G2', [post('same-id', 'B')]);
    await cache.writePage('/fixture-cache/empty', 2, 'G1', []);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('isshoo-v1', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('pages', 'readwrite');
        transaction.objectStore('pages').put({ base: '/fixture-cache/legacy', page: 2, version: 'G1', postIds: ['same-id'], lastAccess: Date.now() }, '/fixture-cache/legacy|2');
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => { db.close(); reject(transaction.error); };
      };
    });
    return {
      a: await cache.readPage('/fixture-cache/A', 3, 'G1'),
      b: await cache.readPage('/fixture-cache/B', 2, 'G2'),
      empty: await cache.readPage('/fixture-cache/empty', 2, 'G1'),
      wrongGeneration: await cache.readPage('/fixture-cache/A', 3, 'G2'),
      legacy: await cache.readPage('/fixture-cache/legacy', 2, 'G1'),
    };
  });
  expect(result.a?.map(post => [post.id, post.title])).toEqual([['same-id', 'A'], ['second', 'A2']]);
  expect(result.b?.map(post => [post.id, post.title])).toEqual([['same-id', 'B']]);
  expect(result.empty).toEqual([]);
  expect(result.wrongGeneration).toBeNull();
  expect(result.legacy).toBeNull();
});

test('denied IndexedDB still allows a fresh manifest from the network', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(indexedDB, 'open', { value: () => { throw new DOMException('Fixture storage denial', 'SecurityError'); } });
  });
  await page.goto('/test-feed?top=3000', { waitUntil: 'networkidle' });
  await settle(page);
  const manifest = await page.evaluate(() => window.__FIXTURE_CACHE__!.getManifest('/api/test-feed/normal'));
  expect(manifest?.generatedAt).toBe('2026-10-05T00:00:00.000Z');
  expect(manifest?.lastPage).toBe(3);
});

for (const restoration of ['url', 'detail']) {
  test(`wheel intent cancels a pending ${restoration} restoration before a delayed page arrives`, async ({ page }) => {
    let release!: () => void;
    let started = 0;
    const delayedResponse = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/test-feed/normal/page-2.json', async route => {
      started++;
      await delayedResponse;
      await route.fulfill({ json: { generatedAt: FIXTURE_GENERATED_AT, page: 2, posts: makeFixturePosts('normal').slice(40, 80) } });
    });
    if (restoration === 'detail') {
      await page.addInitScript(() => {
        const key = 'fixture-normal-false-2';
        sessionStorage.setItem('lastSectionKey/latest', key);
        sessionStorage.setItem(`returnFromPost-${key}/latest`, '1');
        sessionStorage.setItem(`anchorPostId-${key}/latest`, 'fixture-normal-063');
        sessionStorage.setItem(`anchorPage-${key}/latest`, '2');
      });
    }
    await page.goto(`/test-feed?top=629${restoration === 'url' ? '&page=3' : ''}`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    await expect.poll(() => started).toBeGreaterThan(0);
    await page.mouse.move(500, 300);
    await page.mouse.wheel(0, 360);
    await page.waitForTimeout(150);
    const userScrollY = await page.evaluate(() => window.scrollY);
    release();
    await expect.poll(async () => (await inspect(page)).loaded.length).toBeGreaterThanOrEqual(80);
    await page.waitForTimeout(1000);
    expect(Math.abs(await page.evaluate(() => window.scrollY) - userScrollY)).toBeLessThanOrEqual(2);
    await assertCoverage(page);
  });
}

test('a real middle mouse input cancels pending URL restoration', async ({ page }) => {
  let release!: () => void;
  let started = 0;
  const delayedResponse = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/test-feed/normal/page-2.json', async route => {
    started++;
    await delayedResponse;
    await route.fulfill({ json: { generatedAt: FIXTURE_GENERATED_AT, page: 2, posts: makeFixturePosts('normal').slice(40, 80) } });
  });
  await page.goto('/test-feed?top=629&page=3', { waitUntil: 'domcontentloaded' });
  await settle(page);
  await expect.poll(() => started).toBeGreaterThan(0);
  // Click the empty page margin, avoiding both cards and fixture controls.
  await page.mouse.click(20, 350, { button: 'middle' });
  const userScrollY = await page.evaluate(() => window.scrollY);
  release();
  await expect.poll(async () => (await inspect(page)).loaded.length).toBeGreaterThanOrEqual(80);
  await page.waitForTimeout(1000);
  expect(Math.abs(await page.evaluate(() => window.scrollY) - userScrollY)).toBeLessThanOrEqual(2);
  await page.keyboard.press('Escape');
  await assertCoverage(page);
});
