'use client';

import * as React from 'react';
import { motion, LayoutGroup } from 'motion/react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AvatarGroup, AvatarGroupTooltip } from '@/components/animate-ui/components/avatar-group';
import { cn } from '@/lib/utils';

export type CommunityItem = {
  id: string;
  label: string;
  iconUrl?: string | null;
};

export interface CommunityPresenceSelectorProps {
  items: CommunityItem[];
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  /**
   * Controlled selected ids. null => all selected.
   * When provided, component renders according to this value and does not manage internal selection state.
   */
  value?: string[] | null;
  /**
   * Change callback (null => all selected)
   */
  onChange?: (selected: string[] | null) => void;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
  tooltipOffset?: number;
  overlap?: 'tight' | 'normal';
  hoverLift?: string | number; // e.g., '-20%'
}

const AVATAR_MOTION_TRANSITION = {
  type: 'spring',
  stiffness: 200,
  damping: 25,
} as const;

const GROUP_CONTAINER_TRANSITION = {
  type: 'spring',
  stiffness: 150,
  damping: 20,
} as const;

function fallbackText(label: string) {
  if (!label) return '?';
  // Keep 2 visible chars for KR/EN nicely
  const t = label.trim();
  // If has space, take first word initial
  if (/\s/.test(t)) {
    const parts = t.split(/\s+/).filter(Boolean);
    const head = parts[0] || t;
    return head.slice(0, 2);
  }
  return t.slice(0, 2);
}

export default function CommunityPresenceSelector({ items, className, size = 'md', value, onChange, tooltipSide = 'top', tooltipOffset = 14, overlap = 'normal', hoverLift }: CommunityPresenceSelectorProps) {
  const controlled = value !== undefined;
  const [internalSelectedIds, setInternalSelectedIds] = React.useState<string[]>(() => items.map(i => i.id));
  const [togglingGroup, setTogglingGroup] = React.useState<'selected' | 'unselected' | null>(null);

  // Clamp controlled value to available items
  const effectiveSelectedIds: string[] = React.useMemo(() => {
    if (controlled) {
      if (value === null) return items.map(i => i.id);
      const allowed = new Set(items.map(i => i.id));
      return (value || []).filter(id => allowed.has(id));
    }
    return internalSelectedIds;
  }, [controlled, value, items, internalSelectedIds]);

  // When items change in uncontrolled mode, reset to all; in controlled mode, do nothing.
  React.useEffect(() => {
    if (!controlled) {
      setInternalSelectedIds(items.map(i => i.id));
      onChange?.(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map(i => i.id).join(','), controlled]);

  const selected = React.useMemo(() => items.filter(i => effectiveSelectedIds.includes(i.id)), [items, effectiveSelectedIds]);
  const unselected = React.useMemo(() => items.filter(i => !effectiveSelectedIds.includes(i.id)), [items, effectiveSelectedIds]);

  const dims = size === 'lg' ? { h: 'h-14', s: 'size-14', b: 'border-4' } : size === 'sm' ? { h: 'h-8', s: 'size-8', b: 'border-2' } : { h: 'h-12', s: 'size-12', b: 'border-3' };
  const space = overlap === 'tight' ? '-space-x-2' : '-space-x-3';

  const toggle = (id: string) => {
    const prev = effectiveSelectedIds;
    const has = prev.includes(id);
    const next = has ? prev.filter(x => x !== id) : [...prev, id];
    if (next.length === 0) return; // enforce at least one selected
    setTogglingGroup(has ? 'selected' : 'unselected');
    const allIds = items.map(i => i.id);
    const allSelected = next.length === allIds.length && allIds.every(x => next.includes(x));
    onChange?.(allSelected ? null : [...next]);
    if (!controlled) setInternalSelectedIds(next);
    setTimeout(() => setTogglingGroup(null), 500);
  };

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <LayoutGroup>
        {selected.length > 0 && (
          <motion.div
            layout
            className={cn('bg-neutral-200 dark:bg-neutral-700/70 p-0.5 rounded-full', togglingGroup === 'selected' ? 'z-5' : 'z-10')}
            transition={GROUP_CONTAINER_TRANSITION}
          >
            <AvatarGroup
              key={selected.map((u) => u.id).join('_') + '-selected'}
              className={cn(dims.h, space)}
              translate={hoverLift}
              tooltipProps={{ side: tooltipSide, sideOffset: tooltipOffset }}
            >
              {selected.map((c) => (
                <motion.div
                  key={c.id}
                  layoutId={`avatar-${c.id}`}
                  className="cursor-pointer"
                  onClick={() => toggle(c.id)}
                  animate={{ filter: 'grayscale(0)', scale: 1 }}
                  transition={AVATAR_MOTION_TRANSITION}
                  initial={false}
                >
                  <Avatar className={cn(dims.s, dims.b, 'border-neutral-300 dark:border-neutral-700')}
                  >
                    {c.iconUrl ? <AvatarImage src={c.iconUrl} /> : null}
                    <AvatarFallback>{fallbackText(c.label)}</AvatarFallback>
                    <AvatarGroupTooltip>
                      <p>{c.label}</p>
                    </AvatarGroupTooltip>
                  </Avatar>
                </motion.div>
              ))}
            </AvatarGroup>
          </motion.div>
        )}

        {unselected.length > 0 && (
          <motion.div
            layout
            className={cn('bg-neutral-200 dark:bg-neutral-700/70 p-0.5 rounded-full', togglingGroup === 'unselected' ? 'z-5' : 'z-10')}
            transition={GROUP_CONTAINER_TRANSITION}
          >
            <AvatarGroup
              key={unselected.map((u) => u.id).join('_') + '-unselected'}
              className={cn(dims.h, space)}
              translate={hoverLift}
              tooltipProps={{ side: tooltipSide, sideOffset: tooltipOffset }}
            >
              {unselected.map((c) => (
                <motion.div
                  key={c.id}
                  layoutId={`avatar-${c.id}`}
                  className="cursor-pointer"
                  onClick={() => toggle(c.id)}
                  animate={{ filter: 'grayscale(1)', scale: 1 }}
                  transition={AVATAR_MOTION_TRANSITION}
                  initial={false}
                >
                  <Avatar className={cn(dims.s, dims.b, 'border-neutral-300 dark:border-neutral-700')}
                  >
                    {c.iconUrl ? <AvatarImage src={c.iconUrl} /> : null}
                    <AvatarFallback>{fallbackText(c.label)}</AvatarFallback>
                    <AvatarGroupTooltip>
                      <p>{c.label}</p>
                    </AvatarGroupTooltip>
                  </Avatar>
                </motion.div>
              ))}
            </AvatarGroup>
          </motion.div>
        )}
      </LayoutGroup>
    </div>
  );
}
