"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Triggers a soft refresh when the user scrolls upward to the very top
 * of the main page ("/"). Also supports touch pull detection on mobile.
 */
export default function TopRefreshOnScroll({
  cooldownMs = 4000,
  pullThreshold = 70,
  topThreshold = 2,
  enableScrollTopTrigger = false,
  scrollUpDistanceThreshold = 320,
  showSpinner = true,
  spinnerDurationMs = 1400,
  spinnerText = "새로고침 중…",
}: {
  cooldownMs?: number;
  pullThreshold?: number; // touch pull distance in px to trigger at top
  topThreshold?: number;  // scrollY <= this is considered at top
  enableScrollTopTrigger?: boolean; // if true, allow non-touch upward scroll trigger
  scrollUpDistanceThreshold?: number; // required upward scroll distance before triggering at top
  showSpinner?: boolean;
  spinnerDurationMs?: number;
  spinnerText?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Only enable on the main route
  const enabled = pathname === "/";

  const lastYRef = useRef<number>(0);
  const scrollingUpRef = useRef<boolean>(false);
  const coolingRef = useRef<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Touch pull-to-refresh support
  const touchStartYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef<number>(0);
  // Track accumulated upward scroll distance (non-touch)
  const upAccumRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const triggerRefresh = () => {
      if (coolingRef.current) return;
      coolingRef.current = true;
      // Soft refresh server components without a hard navigation
      router.refresh();
      if (showSpinner) {
        setIsRefreshing(true);
        window.setTimeout(() => setIsRefreshing(false), spinnerDurationMs);
      }
      // Cooldown to avoid repeated triggers
      window.setTimeout(() => {
        coolingRef.current = false;
      }, cooldownMs);
    };

    const onScroll = () => {
      const y = window.scrollY || 0;
      const last = lastYRef.current;
      const movingUp = y < last;
      scrollingUpRef.current = movingUp; // true if moving upward

      // Accumulate upward movement; reset on downward scroll
      if (movingUp) {
        upAccumRef.current += Math.max(0, last - y);
      } else {
        upAccumRef.current = 0;
      }
      lastYRef.current = y;

      // If enabled: require a substantial upward scroll before triggering at top
      if (
        enableScrollTopTrigger &&
        movingUp &&
        y <= topThreshold &&
        last > topThreshold &&
        upAccumRef.current >= scrollUpDistanceThreshold
      ) {
        upAccumRef.current = 0;
        triggerRefresh();
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      // Only start tracking a pull if already at the very top
      if ((window.scrollY || 0) <= topThreshold) {
        touchStartYRef.current = e.touches[0]?.clientY ?? null;
        pullDistanceRef.current = 0;
      } else {
        touchStartYRef.current = null;
        pullDistanceRef.current = 0;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (touchStartYRef.current == null) return;
      const currentY = e.touches[0]?.clientY ?? 0;
      const delta = currentY - touchStartYRef.current;
      // Only count downward pull
      pullDistanceRef.current = Math.max(0, delta);
    };

    const onTouchEnd = () => {
      if (touchStartYRef.current == null) return;
      const pulled = pullDistanceRef.current;
      touchStartYRef.current = null;
      pullDistanceRef.current = 0;
      if ((window.scrollY || 0) <= topThreshold && pulled >= pullThreshold) {
        triggerRefresh();
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });

    // Initialize lastY
    lastYRef.current = window.scrollY || 0;
    upAccumRef.current = 0;

    return () => {
      window.removeEventListener("scroll", onScroll as any);
      window.removeEventListener("touchstart", onTouchStart as any);
      window.removeEventListener("touchmove", onTouchMove as any);
      window.removeEventListener("touchend", onTouchEnd as any);
    };
  }, [
    enabled,
    router,
    cooldownMs,
    pullThreshold,
    topThreshold,
    enableScrollTopTrigger,
    scrollUpDistanceThreshold,
  ]);

  return showSpinner ? (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed left-1/2 z-[60] transition-all duration-200 ease-out
      -translate-x-1/2 ${isRefreshing ? "opacity-100" : "opacity-0 -translate-y-3"}
      top-[calc(env(safe-area-inset-top,0)+0.75rem)]`}
    >
      <div className="flex items-center gap-2 rounded-full bg-black/70 text-white text-xs px-3 py-1.5 shadow-lg backdrop-blur-sm">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>{spinnerText}</span>
      </div>
    </div>
  ) : null;
}
