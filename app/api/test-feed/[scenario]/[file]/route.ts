import { NextResponse } from 'next/server';
import { FIXTURE_GENERATED_AT, FIXTURE_PAGE_SIZE, isFixtureScenario, makeFixturePosts } from '@/lib/testing/feed-fixture';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ scenario: string; file: string }> }) {
  if (process.env.NODE_ENV === 'production') return new NextResponse(null, { status: 404 });
  const { scenario, file } = await context.params;
  if (!isFixtureScenario(scenario)) return new NextResponse(null, { status: 404 });
  const headers = { 'Cache-Control': 'no-store' };
  if (file === 'manifest.json') {
    const lastPage = scenario === 'duplicate-only' ? 5 : 3;
    return NextResponse.json({ generatedAt: FIXTURE_GENERATED_AT, lastPage, maxPages: lastPage, seedPolicy: 'live-seed-dedupe' }, { headers });
  }
  const page = /^page-([2-5])\.json$/.exec(file);
  if (!page) return new NextResponse(null, { status: 404, headers });
  const pageNum = Number(page[1]);
  if (pageNum > 3 && scenario !== 'duplicate-only') return new NextResponse(null, { status: 404, headers });
  if (scenario === 'delayed') await new Promise(resolve => setTimeout(resolve, 500));
  if (scenario === 'error' && pageNum === 2) return new NextResponse(null, { status: 503, headers });
  if (scenario === 'missing' && pageNum === 3) return new NextResponse(null, { status: 404, headers });
  const first = scenario === 'duplicate-only' ? Math.max(0, pageNum - 3) * FIXTURE_PAGE_SIZE : (pageNum - 1) * FIXTURE_PAGE_SIZE;
  const posts = makeFixturePosts(scenario).slice(first, first + FIXTURE_PAGE_SIZE);
  if (scenario === 'duplicates') posts.unshift(makeFixturePosts(scenario)[0]);
  return NextResponse.json({ generatedAt: FIXTURE_GENERATED_AT, page: pageNum, posts }, { headers });
}
