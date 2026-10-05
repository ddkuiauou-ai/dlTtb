import { expect, test, type Locator, type Page, type Route } from 'playwright/test';
import { makeFixturePosts } from '../../lib/testing/feed-fixture';

const READ_KEY = 'readPosts:v2';
const posts = makeFixturePosts('normal');
const pageErrors = new WeakMap<Page, string[]>();

type FeedMetrics = { key: string; total: number; read: number; unread: number };
declare global {
  interface Window { __READ_STATUS_METRICS__?: FeedMetrics[]; }
}

test.beforeEach(async ({ context }) => {
  const trackErrors = (page: Page) => {
    const errors: string[] = [];
    pageErrors.set(page, errors);
    page.on('pageerror', error => errors.push(error.message));
  };
  context.pages().forEach(trackErrors);
  context.on('page', trackErrors);
  await context.route('**/data/keywords/manifest.json*', route => route.fulfill({ json: {} }));
  await context.route('**/data/posts/v1/fixture-*.json*', fulfillPost);
});

test.afterEach(async ({ context }) => {
  for (const page of context.pages()) {
    expect(pageErrors.get(page) ?? [], 'uncaught browser exceptions').toEqual([]);
  }
});

function detail(id: string) {
  const post = posts.find(item => item.id === id)!;
  return { ...post, embeds: [], categories: [], keywords: [], contentHtml: `<p>합성 상세 내용 ${id}</p>` };
}

async function fulfillPost(route: Route) {
  const id = new URL(route.request().url()).pathname.split('/').pop()!.replace(/\.json$/, '');
  await route.fulfill({ json: detail(id) });
}

async function openFeed(page: Page) {
  await page.goto('/test-feed?top=629', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-virtual-feed]')).toHaveAttribute('data-layout-ready', 'true');
  await expect(card(page, posts[0].id)).toBeVisible();
}

function card(page: Page, id: string): Locator {
  return page.locator(`[data-testid="feed"] .post-anchor[id="post-${id}"] > a`);
}

async function shownPost(page: Page, id: string) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(`합성 상세 내용 ${id}`, { exact: true })).toBeVisible();
}

async function storedReadIds(page: Page) {
  return page.evaluate(key => Object.keys(JSON.parse(localStorage.getItem(key) ?? '{}')).sort(), READ_KEY);
}

async function settleResponse(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function assertReadMetrics(page: Page, read: number) {
  await expect.poll(() => page.evaluate(() => {
    const latest = window.__READ_STATUS_METRICS__?.at(-1);
    return latest && { read: latest.read, totalIsConsistent: latest.total > 0 && latest.unread === latest.total - latest.read };
  })).toEqual({ read, totalIsConsistent: true });
}

test('modal keyboard navigation saves each displayed post and mutes its feed title', async ({ page }) => {
  await openFeed(page);
  const unreadColor = await card(page, posts[3].id).locator('.post-title').evaluate(element => getComputedStyle(element).color);
  await page.getByRole('button', { name: '검증 모달 열기', exact: true }).click();
  await shownPost(page, posts[0].id);
  await expect.poll(() => storedReadIds(page)).toEqual([posts[0].id]);

  await page.keyboard.press('ArrowRight');
  await shownPost(page, posts[1].id);
  await expect.poll(() => storedReadIds(page)).toEqual([posts[0].id, posts[1].id]);
  await page.keyboard.press('ArrowLeft');
  await shownPost(page, posts[0].id);
  await page.keyboard.press('ArrowRight');
  await shownPost(page, posts[1].id);

  await page.getByRole('dialog').locator('[data-slot="scroll-progress-container"]').evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await page.keyboard.press('Space');
  await shownPost(page, posts[2].id);
  await expect.poll(() => storedReadIds(page)).toEqual(posts.slice(0, 3).map(post => post.id));
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}'), READ_KEY);
  for (const post of posts.slice(0, 3)) {
    expect(saved[post.id]).toMatchObject({ title: post.title, url: post.url });
    expect(saved[post.id].ts).toBeGreaterThan(0);
  }

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const post of posts.slice(0, 3)) {
    await expect(card(page, post.id)).toHaveAttribute('data-read', '1');
    await expect(card(page, post.id).locator('.post-title')).toHaveCSS('font-weight', '400');
    await expect.poll(() => card(page, post.id).locator('.post-title').evaluate(element => getComputedStyle(element).color)).not.toBe(unreadColor);
  }
  await expect(card(page, posts[3].id)).not.toHaveAttribute('data-read', '1');
});

test('another tab updates read styling, unread filtering and recent posts, including removal and clear', async ({ page, context }) => {
  await openFeed(page);
  const other = await context.newPage();
  await openFeed(other);
  await page.evaluate(() => {
    window.__READ_STATUS_METRICS__ = [];
    window.addEventListener('feed:metrics', event => {
      const metrics = (event as CustomEvent<FeedMetrics>).detail;
      if (metrics.key === '/api/test-feed/normal') window.__READ_STATUS_METRICS__!.push(metrics);
    });
  });
  const unreadTitle = card(page, posts[0].id).locator('.post-title');
  const unreadColor = await unreadTitle.evaluate(element => getComputedStyle(element).color);
  const recent = page.getByTestId('read-posts');
  await expect(recent.getByRole('heading', { name: '최근 읽은 글' })).toHaveCount(0);

  await other.evaluate(({ key, first, second }) => {
    localStorage.setItem(key, JSON.stringify({
      [first.id]: { ts: Date.now() - 1000, title: first.title, url: first.url },
      [second.id]: { ts: Date.now(), title: second.title, url: second.url },
    }));
  }, { key: READ_KEY, first: posts[0], second: posts[1] });
  await expect(card(page, posts[0].id)).toHaveAttribute('data-read', '1');
  await expect(unreadTitle).toHaveCSS('font-weight', '400');
  await expect.poll(() => unreadTitle.evaluate(element => getComputedStyle(element).color)).not.toBe(unreadColor);
  await expect(recent.getByRole('heading', { name: '최근 읽은 글' })).toHaveCount(1);
  await expect(recent.locator('li')).toHaveText([posts[1].title, posts[0].title]);
  await assertReadMetrics(page, 2);
  await test.info().attach('cross-tab-read-styling', { body: await page.screenshot(), contentType: 'image/png' });

  await page.getByRole('button', { name: '읽음 필터 전환', exact: true }).click();
  await expect(card(page, posts[0].id)).toHaveCount(0);
  await expect(card(page, posts[1].id)).toHaveCount(0);
  await other.evaluate(key => localStorage.removeItem(key), READ_KEY);
  await expect(card(page, posts[0].id)).toBeVisible();
  await expect(card(page, posts[1].id)).toBeVisible();
  await expect(card(page, posts[0].id)).not.toHaveAttribute('data-read', '1');
  await expect(unreadTitle).toHaveCSS('color', unreadColor);
  await expect(recent.getByRole('heading', { name: '최근 읽은 글' })).toHaveCount(0);
  await assertReadMetrics(page, 0);

  await other.evaluate(({ key, post }) => localStorage.setItem(key, JSON.stringify({
    [post.id]: { ts: Date.now(), title: post.title, url: post.url },
  })), { key: READ_KEY, post: posts[0] });
  await expect(card(page, posts[0].id)).toHaveCount(0);
  await expect(recent.locator('li')).toHaveText([posts[0].title]);
  await assertReadMetrics(page, 1);
  await other.evaluate(() => localStorage.clear());
  await expect(card(page, posts[0].id)).toBeVisible();
  await expect(card(page, posts[0].id)).not.toHaveAttribute('data-read', '1');
  await expect(unreadTitle).toHaveCSS('color', unreadColor);
  await expect(recent.getByRole('heading', { name: '최근 읽은 글' })).toHaveCount(0);
  await assertReadMetrics(page, 0);
  await test.info().attach('cross-tab-feed-metrics', {
    body: JSON.stringify(await page.evaluate(() => window.__READ_STATUS_METRICS__), null, 2),
    contentType: 'application/json',
  });
});

test('a late previous modal request cannot replace the current post or mark unseen content', async ({ page }) => {
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  const requested = page.waitForRequest(request => request.url().endsWith(`/${posts[1].id}.json`));
  await page.route(`**/data/posts/v1/${posts[1].id}.json`, async route => { await delayed; await fulfillPost(route); });
  await openFeed(page);
  await page.getByRole('button', { name: '검증 모달 열기', exact: true }).click();
  await shownPost(page, posts[0].id);
  await page.keyboard.press('ArrowRight');
  await requested;
  await page.keyboard.press('ArrowRight');
  await shownPost(page, posts[2].id);
  await expect.poll(() => storedReadIds(page)).toEqual([posts[0].id, posts[2].id]);

  const completed = page.waitForEvent('requestfinished', request => request.url().endsWith(`/${posts[1].id}.json`));
  release();
  await completed;
  await settleResponse(page);
  await shownPost(page, posts[2].id);
  expect(await storedReadIds(page)).toEqual([posts[0].id, posts[2].id]);
});

test('closing the modal before its pending post loads leaves that post unread', async ({ page }) => {
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  const requested = page.waitForRequest(request => request.url().endsWith(`/${posts[1].id}.json`));
  await page.route(`**/data/posts/v1/${posts[1].id}.json`, async route => { await delayed; await fulfillPost(route); });
  await openFeed(page);
  await page.getByRole('button', { name: '검증 모달 열기', exact: true }).click();
  await shownPost(page, posts[0].id);
  await page.keyboard.press('ArrowRight');
  await requested;
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const completed = page.waitForEvent('requestfinished', request => request.url().endsWith(`/${posts[1].id}.json`));
  release();
  await completed;
  await settleResponse(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await storedReadIds(page)).toEqual([posts[0].id]);
  await expect(card(page, posts[1].id)).not.toHaveAttribute('data-read', '1');
});
