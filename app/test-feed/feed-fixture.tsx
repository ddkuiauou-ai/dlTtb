'use client';

import { useEffect, useRef, useState } from 'react';
import InfinitePostList from '@/components/infinite-post-list';
import PostGrid from '@/components/post-grid';
import { PostListProvider } from '@/context/post-list-context';
import { usePostCache } from '@/context/post-cache-context';
import { PostCard } from '@/components/post-card';
import { useModal } from '@/context/modal-context';
import { markNavigateToPost } from '@/lib/restore-session';
import { idbCache } from '@/lib/idb-cache';
import { ReadPostList } from '@/components/ReadPostList.client';
import { FIXTURE_PAGE_SIZE, fixtureCardHeight, isFixtureScenario, makeFixturePosts } from '@/lib/testing/feed-fixture';

declare global {
  interface Window { __FIXTURE_CACHE__?: typeof idbCache; }
}

export default function FeedFixture({ scenario, topHeight, mixed, legacy, columns, emptySeed, fixed, naturalUpper }: { scenario: string; topHeight: number; mixed: boolean; legacy: boolean; columns: string; emptySeed: boolean; fixed: boolean; naturalUpper: boolean }) {
  const [safeScenario, setScenario] = useState(isFixtureScenario(scenario) ? scenario : 'normal');
  const posts = makeFixturePosts(safeScenario);
  const [hasSeed, setHasSeed] = useState(!emptySeed);
  const initial = hasSeed ? posts.slice(0, FIXTURE_PAGE_SIZE) : [];
  const [height, setHeight] = useState(Math.max(0, Math.min(5000, topHeight)));
  const [populated, setPopulated] = useState(true);
  const [skeleton, setSkeleton] = useState(false);
  const [cardLayout, setCardLayout] = useState<'list' | 'grid'>('list');
  const [feedLayout, setFeedLayout] = useState<'list' | 'grid'>('list');
  const [readFilter, setReadFilter] = useState('all');
  const { openModal } = useModal();
  const base = `/api/test-feed/${safeScenario}`;
  const heights = posts.map((post, index) => `#post-${post.id}{height:${fixtureCardHeight(index, mixed)}px;overflow:hidden}`);
  const storageKey = `fixture-${safeScenario}-${mixed}-${columns}`;
  useEffect(() => {
    window.__FIXTURE_CACHE__ = idbCache;
    return () => { delete window.__FIXTURE_CACHE__; };
  }, []);
  const openFixtureModal = () => {
    const node = Array.from(document.querySelectorAll('[data-testid="feed"] .post-anchor')).find(element => element.getBoundingClientRect().top >= 0);
    const id = node?.id.replace(/^post-/, '') ?? posts[0].id;
    markNavigateToPost(storageKey, { anchorPostId: id, anchorPage: Math.floor(posts.findIndex(post => post.id === id) / FIXTURE_PAGE_SIZE) + 1, sourceUrl: location.pathname + location.search });
    openModal(id, posts.map(post => post.id));
  };

  return (
    <main data-testid="fixture" data-scenario={safeScenario} data-mixed={String(mixed)} style={{ width: 'min(1200px, 100%)', margin: '0 auto' }}>
      <style>{`.fixture-feed .post-anchor{box-sizing:border-box}.fixture-feed{overflow-anchor:none}${fixed ? heights.join('') : ''}`}</style>
      <nav style={{ position: 'fixed', top: 0, right: 0, zIndex: 50, background: 'white', padding: 4 }} aria-label="검증 제어">
        <button onClick={() => setHeight(3000)}>상단 3000</button>{' '}
        <button onClick={() => setHeight(180)}>상단 180</button>{' '}
        <button onClick={() => setPopulated(value => !value)}>상단 데이터 전환</button>{' '}
        <button onClick={() => { setSkeleton(true); setTimeout(() => { setSkeleton(false); setHeight(180); }, 500); }}>스켈레톤 교체</button>
        {' '}<button onClick={() => setHasSeed(true)}>첫 페이지 갱신</button>
        {' '}<button onClick={() => setCardLayout(value => value === 'list' ? 'grid' : 'list')}>카드 모양 전환</button>
        {' '}<button onClick={() => setFeedLayout(value => value === 'list' ? 'grid' : 'list')}>목록 방식 전환</button>
        {' '}<button onClick={() => setReadFilter(value => value === 'all' ? 'unread' : 'all')}>읽음 필터 전환</button>
        {' '}<button onClick={openFixtureModal}>검증 모달 열기</button>
        {' '}<button onClick={() => setScenario('normal')}>피드 B 전환</button>
      </nav>
      <section data-testid="upper-sections" style={naturalUpper ? undefined : { height, overflow: 'hidden' }}>
        {skeleton ? <div style={{ height: 300 }} aria-label="상단 스켈레톤">불러오는 중…</div> : <PostGrid title="급상승 검증" layout="grid" initialPosts={populated ? makeFixturePosts('upper', 3) : []} enablePaging={false} />}
      </section>
      <section className="fixture-feed" data-testid="feed">
        <PostListProvider postIds={posts.map(post => post.id)}>
          <InfinitePostList initialPosts={initial} layout={feedLayout} cardLayoutOverride={cardLayout} readFilter={readFilter} jsonBase={base} storageKeyPrefix={storageKey} listColumns={columns === '3' ? '3-2-1' : 'auto-2'} windowScrollMargin={legacy ? 0 : 'auto'} />
        </PostListProvider>
      </section>
      {fixed ? <div data-testid="reference" aria-hidden="true" style={{ position: 'absolute', left: -20000, top: 0, width: 'min(1200px, 100%)' }}>
        {posts.map((post, index) => <div key={post.id} data-reference-id={post.id} data-card-height={fixtureCardHeight(index, mixed)} style={{ height: fixtureCardHeight(index, mixed) }}>{post.title}</div>)}
      </div> : <NaturalReference scenario={safeScenario} columns={columns} layout={cardLayout} />}
      <aside data-testid="read-posts" style={{ position: 'fixed', left: -20000, top: 0 }}><ReadPostList /></aside>
    </main>
  );
}

function NaturalReference({ scenario, columns, layout }: { scenario: string; columns: string; layout: 'list' | 'grid' }) {
  const { replacePostsForSection } = usePostCache();
  const root = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(1);
  const posts = makeFixturePosts(scenario);
  const key = `fixture-reference-${scenario}`;
  useEffect(() => { replacePostsForSection(key, makeFixturePosts(scenario)); }, [key, scenario, replacePostsForSection]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const update = () => setCols(Math.max(1, Math.min(columns === '3' && innerWidth >= 1024 ? 3 : 2, Math.floor((element.clientWidth + 16) / (352 + 16)))));
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, [columns]);
  return <div ref={root} data-testid="reference" aria-hidden="true" style={{ position: 'absolute', left: -20000, top: 0, width: 'min(1200px, 100%)', display: 'grid', columnGap: 16, rowGap: 16, gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
    <PostListProvider postIds={posts.map(post => post.id)}>{posts.map((post, index) => <div key={post.id} data-reference-id={post.id} data-page-start={index % 40 === 0 ? 'true' : 'false'}>
      {index % 40 === 0 && <div style={{ height: 1 }} />}
      <PostCard postId={post.id} layout={layout} sectionKey={key} />
    </div>)}</PostListProvider>
  </div>;
}
