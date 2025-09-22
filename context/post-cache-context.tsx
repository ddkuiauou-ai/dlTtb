'use client';

import { createContext, useContext, ReactNode, useState, useCallback, useMemo } from 'react';
import type { Post } from '@/lib/types';

interface PostCacheContextType {
  postsBySection: Map<string, Map<string, Post>>;
  addPostsToSection: (sectionKey: string, posts: Post[]) => void;
  replacePostsForSection: (sectionKey: string, posts: Post[]) => void;
}

const PostCacheContext = createContext<PostCacheContextType | undefined>(undefined);

export function PostCacheProvider({ children }: { children: ReactNode }) {
  const [postsBySection, setPostsBySection] = useState<Map<string, Map<string, Post>>>(new Map());

  const addPostsToSection = useCallback((sectionKey: string, newPosts: Post[]) => {
    setPostsBySection(prevPosts => {
      const next = new Map(prevPosts);
      const existing = next.get(sectionKey);
      const bucket = existing ? new Map(existing) : new Map<string, Post>();
      newPosts.forEach(post => {
        bucket.set(post.id, post);
      });
      next.set(sectionKey, bucket);
      return next;
    });
  }, []);

  const replacePostsForSection = useCallback((sectionKey: string, newPosts: Post[]) => {
    setPostsBySection(prevPosts => {
      const next = new Map(prevPosts);
      const bucket = new Map<string, Post>();
      newPosts.forEach(post => {
        bucket.set(post.id, post);
      });
      next.set(sectionKey, bucket);
      return next;
    });
  }, []);

  return (
    <PostCacheContext.Provider value={{ postsBySection, addPostsToSection, replacePostsForSection }}>
      {children}
    </PostCacheContext.Provider>
  );
}

const EMPTY_POST_MAP = new Map<string, Post>();

export function usePostCache(sectionKey?: string) {
  const context = useContext(PostCacheContext);
  if (context === undefined) {
    throw new Error('usePostCache must be used within a PostCacheProvider');
  }
  const { postsBySection, addPostsToSection, replacePostsForSection } = context;
  const aggregatedPosts = useMemo(() => {
    const merged = new Map<string, Post>();
    postsBySection.forEach(bucket => {
      bucket.forEach((post, id) => {
        merged.set(id, post);
      });
    });
    return merged;
  }, [postsBySection]);
  const posts = sectionKey ? (postsBySection.get(sectionKey) ?? EMPTY_POST_MAP) : aggregatedPosts;
  const getPostsForSection = (key: string) => postsBySection.get(key) ?? EMPTY_POST_MAP;

  return {
    posts,
    postsBySection,
    addPostsToSection,
    replacePostsForSection,
    getPostsForSection,
  } as const;
}
