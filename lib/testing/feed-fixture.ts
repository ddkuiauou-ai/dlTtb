import type { Post } from '@/lib/types';

export const FIXTURE_PAGE_SIZE = 40;
export const FIXTURE_POST_COUNT = 120;
export const FIXTURE_GENERATED_AT = '2026-10-05T00:00:00.000Z';
export const fixtureScenarios = ['normal', 'delayed', 'error', 'missing', 'duplicates', 'duplicate-only'] as const;
export type FixtureScenario = typeof fixtureScenarios[number];

export function isFixtureScenario(value: string): value is FixtureScenario {
  return fixtureScenarios.some(scenario => scenario === value);
}

export function makeFixturePosts(scenario: string, count = FIXTURE_POST_COUNT): Post[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `fixture-${scenario}-${String(index + 1).padStart(3, '0')}`,
    url: `https://example.invalid/fixture/${index + 1}`,
    title: `회귀 검증 글 ${String(index + 1).padStart(3, '0')}`,
    community: 'fixture', communityId: 'fixture', communityLabel: '검증', boardLabel: '회귀',
    comments: index % 7, upvotes: index % 13, viewCount: 100 + index,
    timestamp: FIXTURE_GENERATED_AT, timeAgo: '2026년 10월 5일 오전 09:00',
    thumbnail: null, content: '외부 사이트나 업무 DB를 사용하지 않는 합성 글입니다.',
  }));
}

export function fixtureCardHeight(index: number, mixed: boolean): number {
  return mixed ? [102, 202, 302][index % 3] : 102;
}
