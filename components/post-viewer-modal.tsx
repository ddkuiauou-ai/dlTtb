'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useModal } from '@/context/modal-context';
import type { Post } from '@/lib/types';
import { PostDetail } from '@/components/post-detail';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollProgress } from '@/components/animate-ui/components/scroll-progress';

// Helper to check if the user is typing in an input
const isTyping = (el: Element | null) => {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || el.isContentEditable;
};


// Helper function to fetch a single post from the static JSON files
async function getStaticPost(id: string): Promise<Post | null> {
  try {
    const res = await fetch(`/data/posts/v1/${id}.json`);
    if (!res.ok) {
      console.error(`Failed to fetch post data for id: ${id}`);
      return null;
    }
    const data = await res.json();
    return data as Post;
  } catch (error) {
    console.error(error);
    return null;
  }
}

// Skeleton loader for the post detail view
function PostDetailSkeleton() {
  return (
    <div className="p-6">
      <Skeleton className="h-8 w-2/3 mb-4" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}

export function PostViewerModal() {
  const { isOpen, closeModal, postId, navigateToPost } = useModal();
  const [post, setPost] = useState<Post | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Data fetching effect
  useEffect(() => {
    if (postId) {
      setIsLoading(true);
      setPost(null);
      getStaticPost(postId)
        .then(data => {
          setPost(data);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setPost(null);
    }
  }, [postId]);

  // Scroll to top when post changes
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [postId]);

  // Help overlay effect
  useEffect(() => {
    if (isOpen) {
      setShowHelp(true);
      const timer = setTimeout(() => setShowHelp(false), 6000);
      const hide = () => setShowHelp(false);
      window.addEventListener("keydown", hide, { once: true });
      return () => {
        clearTimeout(timer);
        window.removeEventListener("keydown", hide);
      };
    }
  }, [isOpen]);

  // Keyboard shortcuts effect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTyping(document.activeElement)) return;

      // Navigation
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateToPost('prev');
        return;
      } 
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateToPost('next');
        return;
      }

      const scrollEl = contentRef.current;
      if (!scrollEl) return;

      const handleScroll = (amount: number) => {
        scrollEl.scrollBy({ top: amount, behavior: 'smooth' });
      };

      // Scrolling
      switch (e.code) {
        case "KeyJ":
        case "ArrowDown":
          e.preventDefault();
          handleScroll(80);
          return;
        case "KeyK":
        case "ArrowUp":
          e.preventDefault();
          handleScroll(-80);
          return;
        case "PageDown":
        case "Space":
          e.preventDefault();
          if (e.code === "Space" && scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 2) {
            navigateToPost('next');
          } else {
            handleScroll(scrollEl.clientHeight);
          }
          return;
        case "PageUp":
          e.preventDefault();
          handleScroll(-scrollEl.clientHeight);
          return;
        case "Home":
          e.preventDefault();
          scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        case "End":
          e.preventDefault();
          scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
          return;
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, navigateToPost]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeModal();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-screen max-w-screen sm:w-screen sm:max-w-screen md:max-w-4xl h-[90dvh] md:h-5/6 p-0 flex flex-col rounded-none sm:rounded-none md:rounded-lg top-0 left-0 translate-x-0 translate-y-0 md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{post?.title || "Loading..."}</DialogTitle>
          <DialogDescription>Post content</DialogDescription>
        </DialogHeader>
        
        <ScrollProgress ref={contentRef} className="flex-1 p-0">
          {isLoading && <PostDetailSkeleton />}
          {!isLoading && post && <PostDetail post={post} inDialog={true} />}
          {!isLoading && postId && !post && (
            <div className="p-6 text-center">Post not found or failed to load.</div>
          )}
        </ScrollProgress>

        {showHelp && (
          <div className="pointer-events-auto fixed bottom-4 left-4 right-4 z-[60] md:left-auto md:right-8 md:w-auto">
            <div className="rounded-md bg-black/70 text-white text-xs md:text-[12px] px-3 py-2 shadow-lg flex flex-col gap-1 max-w-md animate-in fade-in-0 slide-in-from-bottom-2">
              <div className="font-medium mb-0.5">모달 단축키</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span><span className="border border-white/30 rounded px-1 py-0.5 mr-1">←/→</span>이전/다음 글</span>
                <span><span className="border border-white/30 rounded px-1 py-0.5 mr-1">J/K</span>스크롤</span>
                <span><span className="border border-white/30 rounded px-1 py-0.5 mr-1">Space</span>페이지 스크롤</span>
                <span><span className="border border-white/30 rounded px-1 py-0.5 mr-1">Home/End</span>맨 위/아래</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
