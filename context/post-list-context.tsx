'use client';

import { createContext, useContext, ReactNode } from 'react';

interface PostListContextType {
  postIds: string[];
}

const PostListContext = createContext<PostListContextType | undefined>(undefined);

export function PostListProvider({ children, postIds }: { children: ReactNode; postIds: string[] }) {
  return (
    <PostListContext.Provider value={{ postIds }}>
      {children}
    </PostListContext.Provider>
  );
}

export function usePostList() {
  const context = useContext(PostListContext);
  if (context === undefined) {
    throw new Error('usePostList must be used within a PostListProvider');
  }
  return context;
}
