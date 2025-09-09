import { Suspense } from 'react';
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Sidebar } from "@/components/sidebar";
import SearchPageClient from "./SearchPageClient";
import { Skeleton } from '@/components/ui/skeleton';

// A simple skeleton loader for the search page content
function SearchLoadingSkeleton() {
    return (
        <div className="space-y-4">
            <Skeleton className="h-10 w-1/2" />
            <div className="space-y-4 mt-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
            </div>
        </div>
    )
}

export default function SearchPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="w-full max-w-screen-xl mx-auto px-0 md:px-4 py-6">
        <div className="flex gap-6">
          <div className="flex-1">
            <Suspense fallback={<SearchLoadingSkeleton />}>
              <SearchPageClient />
            </Suspense>
          </div>
          <div className="hidden xl:block w-80 shrink-0">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-scroll [scrollbar-gutter:stable_both-edges] transform-gpu will-change-transform [contain:layout_paint]">
              <Sidebar />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
