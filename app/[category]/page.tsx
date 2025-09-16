import CategoryFeedClient from '@/components/CategoryFeed.client';
import { getPostsByCategory, getAllPosts, getPostsWithVideo, getPostsByYouTube } from '@/lib/queries';

export const dynamic = 'force-static';
export const dynamicParams = false;
export const revalidate = false;

const CATEGORIES = ['news', 'humor', 'info', 'qna', 'review', 'debate', 'back', 'zzal', 'politics', 'shopping', 'etc', 'video', 'youtube', 'it', 'sports', 'all'];

const CATEGORY_LABELS: Record<string, string> = {
  news: "뉴스",
  humor: "유머",
  info: "정보",
  qna: "질문",
  review: "후기",
  debate: "토론",
  back: "후방",
  zzal: "짤",
  politics: "정치",
  shopping: "쇼핑",
  etc: "기타",
  video: "비디오",
  youtube: "유튜브",
  it: "IT",
  sports: "스포츠",
  game: "게임",
  all: "전체",
};

export async function generateStaticParams() {
  return CATEGORIES.map((category) => ({ category }));
}

type PageProps = {
  params: {
    category: string;
  };
};

export default async function Page({ params }: PageProps) {
  const { category } = params;

  const range = '24h'; // Hardcode to default range

  // SSG: 빌드 시점에 카테고리별로 다른 쿼리를 사용하여 데이터를 미리 가져옵니다.
  let initialPosts;
  const options = { page: 1, pageSize: 30, range: range as any };

  if (category === 'all') {
    initialPosts = await getAllPosts(options);
  } else if (category === 'video') {
    initialPosts = await getPostsWithVideo(options);
  } else if (category === 'youtube') {
    initialPosts = await getPostsByYouTube(options);
  } else {
    initialPosts = await getPostsByCategory(category, options);
  }

  const categoryLabel = CATEGORY_LABELS[category] ?? "전체";

  return <CategoryFeedClient
    category={category}
    categoryLabel={categoryLabel}
    initialPosts={initialPosts as any}
    initialRange={range}
  />;
}