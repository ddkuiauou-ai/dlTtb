'use client';

import { useState, useEffect, useCallback } from 'react';

interface KeywordManifest {
  keywords: string[];
  slugMap: Record<string, string>;
}

// Use a module-level cache to prevent re-fetching on every component instance.
let manifestCache: KeywordManifest | null = null;
let fetchPromise: Promise<KeywordManifest> | null = null;

export function useKeywordManifest() {
  const [manifest, setManifest] = useState<KeywordManifest | null>(manifestCache);

  useEffect(() => {
    if (manifestCache) {
      setManifest(manifestCache);
      return;
    }

    if (!fetchPromise) {
        fetchPromise = fetch('/data/keywords/manifest.json')
        .then(res => {
            if (!res.ok) {
                throw new Error(`Failed to fetch keyword manifest: ${res.statusText}`);
            }
            return res.json();
        })
        .then(data => {
            manifestCache = data;
            return data;
        })
        .catch(err => {
            console.error(err);
            // In case of error, set a default empty manifest to prevent retries
            manifestCache = { keywords: [], slugMap: {} };
            return manifestCache;
        });
    }

    fetchPromise.then(data => {
        setManifest(data);
    });

  }, []);

  const getKeywordLink = useCallback((keyword: string): string => {
    const m = manifestCache;
    if (!m) {
      // Return search link as a fallback while manifest is loading or if it failed
      return `/search?q=${encodeURIComponent(keyword)}`;
    }
    const slug = m.slugMap[keyword];
    if (slug) {
      return `/keywords/${slug}`;
    }
    return `/search?q=${encodeURIComponent(keyword)}`;
  }, []);

  return { getKeywordLink, isLoading: !manifest };
}
