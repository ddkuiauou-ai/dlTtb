"use client";

import { useRouter, usePathname } from "next/navigation";
import { getScopedRange } from "@/lib/feed-prefs";
import { BrandIcon } from "./brand-icon";
import { brands } from "@/lib/brands";

const categories = [
  { label: "전체", slug: "all" },
  { label: "유머", slug: "humor" },
  { label: "동영상", slug: "video" },
  { label: "유튜브", slug: "youtube", icon: "youtube" as keyof typeof brands },
  { label: "정보", slug: "info" },
  { label: "IT", slug: "it" },
  { label: "스포츠", slug: "sports" },
  { label: "게임", slug: "game" },
  { label: "질문", slug: "qna" },
  { label: "후기", slug: "review" },
  { label: "뉴스", slug: "news" },
  { label: "토론", slug: "debate" },
  { label: "후방", slug: "back" },
  { label: "짤", slug: "zzal" },
  { label: "정치", slug: "politics" },
  { label: "쇼핑", slug: "shopping" },
  { label: "기타", slug: "etc" },
];

export function CategoryList() {
  const pathname = usePathname();
  const router = useRouter();

  const handleCategoryClick = (slug: string) => {
    // 1. Get the stored range for this category, defaulting to 24h
    const range = getScopedRange('category', slug, '24h');

    // 2. Construct the destination URL
    const destination = range === '24h' ? `/${slug}` : `/${slug}/${range}`;

    // 3. Navigate
    router.push(destination);
  };

  return (
    <div className="grid grid-cols-4 gap-2">
      {categories.map(({ label, slug, icon }) => {
        const href = `/${slug}`;
        const isActive = pathname.startsWith(href);

        return (
          <button
            type="button"
            key={slug}
            onClick={() => handleCategoryClick(slug)}
            className={`flex items-center justify-center p-2 rounded-md transition-colors text-left ${isActive
              ? "bg-primary text-primary-foreground"
              : "bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
              }`}
          >
            {icon ? (
              <BrandIcon name={icon} useBrandColor className="w-6 h-6" />
            ) : (
              <span className="font-semibold text-sm">{label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}