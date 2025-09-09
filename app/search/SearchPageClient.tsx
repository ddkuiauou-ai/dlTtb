'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import MiniSearch, { type SearchResult } from 'minisearch';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Doc {
  id: string;
  title: string;
  image?: string;
  [key: string]: any;
}

export default function SearchPageClient() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';
  
  const [miniSearch, setMiniSearch] = useState<MiniSearch<Doc> | null>(null);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetch('/data/search-index.json')
      .then(res => res.text()) // Use .text() to get the raw JSON string
      .then(data => {
        const search = MiniSearch.loadJSON<Doc>(data, {
          fields: ['title', 'content', 'keywords'],
          storeFields: ['id', 'title', 'image'],
          idField: 'id',
        });
        setMiniSearch(search);
      })
      .catch(err => {
        console.error("Failed to load search index:", err);
        setMiniSearch(null);
      });
  }, []);

  useEffect(() => {
    if (!miniSearch) return;

    if (query) {
      const searchResults = miniSearch.search(query, { prefix: true, fuzzy: 0.2 });
      setResults(searchResults);
    } else {
      setResults([]);
    }
    setIsLoading(false);
  }, [query, miniSearch]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
        </div>
      )
    }

    if (!results || results.length === 0) {
      return <p>검색 결과가 없습니다.</p>;
    }

    return (
      <ul className="space-y-4">
        {results.map((result) => (
          <li key={result.id}>
            <Link href={`/posts/${result.id}`}>
              <div className="flex items-center p-4 border rounded-lg hover:bg-gray-50">
                {result.image && (
                  <img src={result.image} alt={result.title} className="w-24 h-24 object-cover rounded-md mr-4" />
                )}
                <div>
                  <h3 className="text-lg font-semibold text-blue-600 hover:underline">{result.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">Match score: {result.score.toFixed(2)}</p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">
          검색 결과: <span className="font-bold text-blue-600">{query}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {renderContent()}
      </CardContent>
    </Card>
  );
}
