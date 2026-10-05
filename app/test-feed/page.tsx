import { notFound } from 'next/navigation';
import FeedFixture from './feed-fixture';

export const dynamic = 'force-dynamic';

export default async function TestFeedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const params = await searchParams;
  const value = (key: string, fallback: string) => typeof params[key] === 'string' ? params[key] as string : fallback;
  return <FeedFixture scenario={value('scenario', 'normal')} topHeight={Number(value('top', '629'))} mixed={value('mixed', '0') === '1'} legacy={value('legacy', '0') === '1'} columns={value('columns', '2')} emptySeed={value('emptySeed', '0') === '1'} fixed={value('fixed', '1') === '1'} naturalUpper={value('naturalUpper', '0') === '1'} />;
}
