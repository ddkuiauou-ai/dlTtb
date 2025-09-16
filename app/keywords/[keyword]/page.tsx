import { getPostsByKeyword, getTopKeywords } from '@/lib/queries';
import KeywordFeed from '@/components/KeywordFeed.client';

export const dynamic = 'force-static';
// export const dynamicParams = false;
export const revalidate = false;

export async function generateStaticParams() {
  const topKeywords = await getTopKeywords(50);
  return topKeywords.map(({ keyword }) => ({
    keyword: encodeURIComponent(keyword),
  }));
}

type PageProps = {
  params: {
    keyword: string;
  };
};

export default async function Page({ params }: PageProps) {
  try {
    const { keyword: slug } = params;
    const decodedKeyword = decodeURIComponent(slug);

    const initialRange: TimeRange = '1w'; // Default range
    const initialPosts = await getPostsByKeyword(decodedKeyword, { page: 1, pageSize: 20, range: initialRange });

    return <KeywordFeed
      initialPosts={initialPosts}
      keyword={decodedKeyword}
      initialRange={initialRange}
    />;
  } catch (error) {
    console.error("Error in keyword page render:", error);
    return <div>Error rendering page. See build logs for details.</div>
  }
}
