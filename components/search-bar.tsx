'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import MiniSearch, { type SearchResult } from 'minisearch';
import { Button } from '@/components/ui/button';
import { DialogTitle } from "@/components/ui/dialog";
import { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { File } from 'lucide-react';

// Define the structure of the documents we stored in the index
interface SearchDocument {
  id: string;
  title: string;
  image?: string;
}

export function SearchBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<(SearchResult & SearchDocument)[]>([]);
  const [loading, setLoading] = useState(false);

  // Use a ref to hold the minisearch instance
  const miniSearch = useRef<MiniSearch<SearchDocument> | null>(null);

  // Effect to handle keyboard shortcut for opening the search
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // 2) 다이얼로그 열릴 때 로드
  useEffect(() => {
    if (open && !miniSearch.current) {
      setLoading(true);
      fetch('/data/search-index.json')
        .then(res => res.text())
        .then(data => {
          miniSearch.current = MiniSearch.loadJSON<SearchDocument>(data, {
            fields: ['title', 'content', 'keywords'],
            storeFields: ['id', 'title', 'image'],
            idField: 'id',
          });
        })
        .catch(err => console.error('Failed to load search index:', err))
        .finally(() => setLoading(false));
    }
  }, [open]);

  // 3) 검색 시 null 가드
  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    const ms = miniSearch.current;
    if (query.length > 1 && ms) {
      // 결과에 storeFields가 이미 포함됨
      const searchResults = ms.search(query, { prefix: true, fuzzy: 0.2 }) as Array<SearchResult & SearchDocument>;
      setResults(searchResults);
    } else {
      setResults([]);
    }
  }, []);

  const handleSelect = (id: string) => {
    router.push(`/posts/${id}`);
    setOpen(false);
  };

  return (
    <>
      <Button
        variant="outline"
        className="relative h-8 w-full justify-start rounded-[0.5rem] bg-background text-sm font-normal text-muted-foreground shadow-none sm:pr-12 md:w-40 lg:w-64"
        onClick={() => setOpen(true)}
      >
        <span className="hidden lg:inline-flex">게시물 검색...</span>
        <span className="inline-flex lg:hidden">검색...</span>
        <kbd className="pointer-events-none absolute right-[0.3rem] top-[0.3rem] hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <DialogTitle className="sr-only">검색하기</DialogTitle>

        <CommandInput
          placeholder="무엇이든 검색하세요..."
          value={search}
          onValueChange={handleSearch}
        />
        <CommandList>
          {loading && <CommandEmpty>인덱스를 불러오는 중...</CommandEmpty>}
          {!loading && results.length === 0 && search.length > 1 && <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>}
          <CommandGroup heading="게시물">
            {results.map(({ id, title, score, image }) => (
              <CommandItem
                key={id}
                value={`${title}-${id}`}
                onSelect={() => handleSelect(id)}
                className="flex items-center"
              >
                {image ? (
                  <img src={image} alt={title} className="mr-2 h-8 w-8 object-cover rounded" />
                ) : (
                  <File className="mr-2 h-4 w-4" />
                )}
                <span>{title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}