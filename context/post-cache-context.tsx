'use client';

import { createContext, useContext, ReactNode, useState, useCallback } from 'react';
import type { Post } from '@/lib/types';

interface PostCacheContextType {
  posts: Map<string, Post>;
  addPosts: (posts: Post[]) => void;
}

const PostCacheContext = createContext<PostCacheContextType | undefined>(undefined);

export function PostCacheProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<Map<string, Post>>(new Map());

  const addPosts = useCallback((newPosts: Post[]) => {
    setPosts(prevPosts => {
      const newPostsMap = new Map(prevPosts);
      newPosts.forEach(post => {
        newPostsMap.set(post.id, post);
      });
      return newPostsMap;
    });
  }, []);

  return (
    <PostCacheContext.Provider value={{ posts, addPosts }}>
      {children}
    </PostCacheContext.Provider>
  );
}

export function usePostCache() {
  const context = useContext(PostCacheContext);
  if (context === undefined) {
    throw new Error('usePostCache must be used within a PostCacheProvider');
  }
  return context;
}
