"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ReadRecord {
  ts: number;
  title: string;
}

interface ReadPost extends ReadRecord {
  id: string;
}

export function ReadPostList() {
  const [readPosts, setReadPosts] = useState<ReadPost[]>([]);

  const loadReadPosts = () => {
    try {
      const KEY = "readPosts:v2";
      const raw = localStorage.getItem(KEY);
      const data: Record<string, ReadRecord> = raw ? JSON.parse(raw) : {};

      const sortedPosts = Object.entries(data)
        .map(([id, record]) => ({ id, ...record }))
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 20); // Show top 20 most recent

      setReadPosts(sortedPosts);
    } catch (e) {
      console.error("Failed to load read posts from localStorage", e);
    }
  };

  useEffect(() => {
    loadReadPosts();
    window.addEventListener("readPosts:updated", loadReadPosts);
    return () => {
      window.removeEventListener("readPosts:updated", loadReadPosts);
    };
  }, []);

  if (readPosts.length === 0) {
    return null; // Don't show the section if there are no read posts
  }

  return (
    <div className="p-4 border-t border-gray-200">
      <h3 className="font-semibold mb-2 text-sm text-gray-800">최근 읽은 글</h3>
      <ul className="space-y-2">
        {readPosts.map(post => (
          <li key={post.id}>
            <Link href={`/posts/${post.id}`} className="text-sm text-gray-600 hover:text-black truncate block" title={post.title}>
              {post.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}