"use client";

import * as React from "react";

import { CountingNumber } from "@/components/animate-ui/text/counting-number";

const driftSpring = { stiffness: 28, damping: 160 };

const MIN_FORCE_PULSE_MS = 45_000;

export type SidebarStat = {
  current: number;
  previous: number;
  ratePerMinute: number;
};

export type SidebarStatsSnapshot = {
  posts: SidebarStat;
  comments: SidebarStat;
  activeUsers: SidebarStat;
};

type SidebarStatsProps = {
  stats: SidebarStatsSnapshot;
};

export function SidebarStats({ stats }: SidebarStatsProps) {
  return (
    <div className="space-y-3 text-sm">
      <StatisticLine label="총 게시글" stat={stats.posts} />
      <StatisticLine label="총 댓글" stat={stats.comments} />
      <StatisticLine label="활성 사용자" stat={stats.activeUsers} />
    </div>
  );
}

type StatisticLineProps = {
  label: string;
  stat: SidebarStat;
};

function StatisticLine({ label, stat }: StatisticLineProps) {
  const displayValue = useDriftingValue(stat);

  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium tabular-nums">
        <CountingNumber
          fromNumber={stat.current}
          number={displayValue}
          transition={driftSpring}
        />
      </span>
    </div>
  );
}

function useDriftingValue(stat: SidebarStat) {
  const { current, previous, ratePerMinute } = stat;
  const [displayValue, setDisplayValue] = React.useState(current);
  const residualRef = React.useRef(0);
  const lastBumpRef = React.useRef<number>(Date.now());

  const effectiveRate = React.useMemo(() => {
    const safeRate = Number.isFinite(ratePerMinute) ? Math.max(0, ratePerMinute) : 0;
    const momentumRate = Math.max(0, current - previous) / 30;
    const volumeHint = Math.max(0.35, Math.log10(current + 10) * 0.32);

    return Math.max(safeRate, momentumRate, volumeHint);
  }, [current, previous, ratePerMinute]);

  React.useEffect(() => {
    setDisplayValue(current);
    residualRef.current = 0;
    lastBumpRef.current = Date.now();
  }, [current]);

  React.useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const scheduleNext = () => {
      if (cancelled) return;
      const interval = computeNextIntervalMs(effectiveRate);

      timeoutId = setTimeout(() => {
        if (cancelled) return;

        const addition = computeAddition(effectiveRate, interval, current, previous);

        setDisplayValue((prev) => {
          let nextValue = prev;
          let applied = 0;
          const total = residualRef.current + addition;

          if (total >= 1) {
            applied = Math.floor(total);
            residualRef.current = total - applied;
          } else {
            const now = Date.now();
            const overdue = now - lastBumpRef.current > MIN_FORCE_PULSE_MS;
            const shouldPulse = overdue || Math.random() < total;

            if (shouldPulse) {
              applied = 1;
              residualRef.current = Math.max(0, total - 1);
            } else {
              residualRef.current = total;
            }
          }

          if (applied > 0) {
            lastBumpRef.current = Date.now();
            nextValue = prev + applied;
          }

          return nextValue;
        });

        scheduleNext();
      }, interval);
    };

    scheduleNext();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [effectiveRate, current, previous]);

  return displayValue;
}

function computeNextIntervalMs(rate: number) {
  const clamped = Math.min(Math.max(rate, 0), 12);
  const normalized = clamped / 12; // 0 ~ 1
  const maxInterval = 13_500;
  const minInterval = 4_500;
  const base = maxInterval - (maxInterval - minInterval) * normalized;
  const jitter = base * (0.18 + Math.random() * 0.22);

  return Math.max(minInterval * 0.6, base * 0.78 + jitter);
}

function computeAddition(
  rate: number,
  intervalMs: number,
  current: number,
  previous: number,
) {
  const intervalMinutes = intervalMs / 60_000;
  const momentum = Math.max(0, current - previous) / 30;
  const base = Math.max(0, rate) * intervalMinutes;
  const momentumBoost = momentum * intervalMinutes * 0.65;
  const noise = base * (Math.random() * 0.6 - 0.25);
  const softFloor = base * 0.35;

  return Math.max(softFloor, base + momentumBoost + noise);
}
