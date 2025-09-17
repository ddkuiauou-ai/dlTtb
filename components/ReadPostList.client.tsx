"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SignedIn, SignedOut } from '@clerk/clerk-react';

interface ReadRecord {
  ts: number;
  title: string;
  url?: string;
}

interface ReadPost extends ReadRecord {
  id: string;
}

const linkClassName = "text-sm text-gray-600 hover:text-black truncate block";

export function ReadPostList() {
  const [readPosts, setReadPosts] = useState<ReadPost[]>([]);

  const loadReadPosts = () => {
    try {
      const KEY = "readPosts:v2";
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== "object") {
        setReadPosts([]);
        return;
      }

      const sortedPosts = Object.entries(parsed as Record<string, unknown>)
        .reduce<ReadPost[]>((acc, [id, value]) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) {
            return acc;
          }
          const record = value as Partial<ReadRecord>;
          if (typeof record.ts !== "number" || typeof record.title !== "string") {
            return acc;
          }
          const url = typeof record.url === "string" ? record.url : undefined;
          acc.push({ id, ts: record.ts, title: record.title, url });
          return acc;
        }, [])
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
            <SignedIn>
              <Link
                href={`/posts/${post.id}`}
                className={linkClassName}
                title={post.title}
              >
                {post.title}
              </Link>
            </SignedIn>
            <SignedOut>
              <a
                href={post.url ?? `/posts/${post.id}`}
                className={linkClassName}
                title={post.title}
                target="_blank"
                rel="noopener noreferrer"
              >
                {post.title}
              </a>
            </SignedOut>
          </li>
        ))}
      </ul>
    </div>
  );
}