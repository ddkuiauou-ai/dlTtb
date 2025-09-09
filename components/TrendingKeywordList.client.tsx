'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { useKeywordManifest } from '@/hooks/use-keyword-manifest';

interface TrendingKeywordListProps {
  keywords: Array<{ keyword: string; count: number }>;
}

export function TrendingKeywordList({ keywords }: TrendingKeywordListProps) {
  const { getKeywordLink } = useKeywordManifest();

  return (
    <div className="flex flex-wrap gap-2">
      {keywords.map((item, index) => (
        <Link key={item.keyword} href={getKeywordLink(item.keyword)} passHref>
          <Badge
            variant={index < 3 ? "default" : "secondary"}
            className="cursor-pointer hover:opacity-80"
          >
            {index + 1}. {item.keyword}
          </Badge>
        </Link>
      ))}
    </div>
  );
}
