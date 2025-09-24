
'use client';

import * as React from 'react';
import { motion, LayoutGroup } from 'motion/react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AvatarGroup, AvatarGroupTooltip } from '@/components/animate-ui/components/avatar-group';
import { cn } from '@/lib/utils';
import { Dock, DockIcon } from "@/components/ui/dock";
import { TooltipProvider } from "@/components/animate-ui/components/tooltip";

// Types and Constants
// =================================================================

export type CommunityItem = {
  id: string;
  label: string;
  iconUrl?: string | null;
};

export interface CommunityPresenceSelectorProps {
  items: CommunityItem[];
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  value?: string[] | null;
  onChange?: (selected: string[] | null) => void;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
  tooltipOffset?: number;
  overlap?: 'tight' | 'normal';
  hoverLift?: string | number;
}

const AVATAR_MOTION_TRANSITION = { type: 'spring', stiffness: 200, damping: 25 };
const GROUP_CONTAINER_TRANSITION = { type: 'spring', stiffness: 150, damping: 20 };
const ANIMATION_DURATION = 500; // ms

// Helper Components
// =================================================================

const MemoizedTooltipContent = React.memo(({ label }: { label: string }) => {
  return <p>{label}</p>;
});
MemoizedTooltipContent.displayName = 'MemoizedTooltipContent';

function fallbackText(label: string) {
  if (!label) return '?';
  const t = label.trim();
  if (/\s/.test(t)) {
    const parts = t.split(/\s+/).filter(Boolean);
    const head = parts[0] || t;
    return head.slice(0, 2);
  }
  return t.slice(0, 2);
}

// View Components (Memoized for Performance)
// =================================================================

const CollapsedView = React.memo(({ selected, items, dims }: { selected: CommunityItem[], items: CommunityItem[], dims: { s: string, b: string } }) => {
  const firstSelected = selected[0] ?? items[0];
  if (!firstSelected) return null;

  return (
    <div className={cn("relative grid place-items-center", dims.s)}>
      {items.map((c, i) => (
        <motion.div
          key={c.id}
          layoutId={`avatar-${c.id}`}
          className="col-start-1 row-start-1"
          style={{ opacity: c.id === firstSelected.id ? 1 : 0, zIndex: items.length - i }}
        >
          <Avatar className={cn(dims.s, dims.b, "border-neutral-300 dark:border-neutral-700")}>
            {c.iconUrl ? <AvatarImage src={c.iconUrl} /> : null}
            <AvatarFallback>{fallbackText(c.label)}</AvatarFallback>
          </Avatar>
        </motion.div>
      ))}
      {selected.length > 1 && (
        <div className={cn("absolute bottom-0 right-0 translate-x-1/2 translate-y-1/4 bg-blue-500 text-white text-xs rounded-full h-5 min-w-[1.25rem] px-1.5 flex items-center justify-center border-2 border-white z-50")}>
          +{selected.length - 1}
        </div>
      )}
    </div>
  );
});
CollapsedView.displayName = 'CollapsedView';

const DockView = React.memo(({ items, unselected, toggle, dims }: { items: CommunityItem[], unselected: CommunityItem[], toggle: (id: string) => void, dims: { s: string, b: string } }) => (
  <div className="flex items-center justify-center h-full">
    <Dock direction="middle" iconSize={32} iconMagnification={48} className="border-none bg-transparent p-0 shadow-none backdrop-blur-none">
      {items.reverse().map((c: CommunityItem) => (
        <DockIcon key={c.id}>
          <motion.div layoutId={`avatar-${c.id}`} className="cursor-pointer" onClick={() => toggle(c.id)}>
            <Avatar className={cn(dims.s, dims.b, "border-neutral-300 dark:border-neutral-700", unselected.some((u: CommunityItem) => u.id === c.id) && "grayscale")}>
              {c.iconUrl ? <AvatarImage src={c.iconUrl} /> : null}
              <AvatarFallback>{fallbackText(c.label)}</AvatarFallback>
            </Avatar>
          </motion.div>
        </DockIcon>
      ))}
    </Dock>
  </div>
));
DockView.displayName = 'DockView';

const ExpandedView = React.memo(({ selected, unselected, toggle, dims, space, hoverLift, tooltipSide, tooltipOffset, togglingGroup, className }: any) => (
  <div className={cn('flex items-center justify-center gap-4', className)}>
    {selected.length > 0 && (
      <motion.div layout className={cn('bg-neutral-200 dark:bg-neutral-700/70 p-0.5 rounded-full', togglingGroup === 'selected' ? 'z-5' : 'z-10')} transition={GROUP_CONTAINER_TRANSITION}>
        <AvatarGroup key={selected.map((u: CommunityItem) => u.id).join('_') + '-selected'} className={cn(dims.h, space)} translate={hoverLift} tooltipProps={{ side: tooltipSide, sideOffset: tooltipOffset }}>
          {selected.map((c: CommunityItem) => (
            <motion.div key={c.id} layoutId={`avatar-${c.id}`} className="cursor-pointer" onClick={() => toggle(c.id)} animate={{ filter: 'grayscale(0)', scale: 1 }} transition={AVATAR_MOTION_TRANSITION} initial={false}>
              <Avatar className={cn(dims.s, dims.b, 'border-neutral-300 dark:border-neutral-700')}>
                {c.iconUrl ? <AvatarImage src={c.iconUrl} /> : null}
                <AvatarFallback>{fallbackText(c.label)}</AvatarFallback>
                <AvatarGroupTooltip><MemoizedTooltipContent label={c.label} /></AvatarGroupTooltip>
              </Avatar>
            </motion.div>
          ))}
        </AvatarGroup>
      </motion.div>
    )}
    {unselected.length > 0 && (
      <motion.div layout className={cn('bg-neutral-200 dark:bg-neutral-700/70 p-0.5 rounded-full', togglingGroup === 'unselected' ? 'z-5' : 'z-10')} transition={GROUP_CONTAINER_TRANSITION}>
        <AvatarGroup key={unselected.map((u: CommunityItem) => u.id).join('_') + '-unselected'} className={cn(dims.h, space)} translate={hoverLift} tooltipProps={{ side: tooltipSide, sideOffset: tooltipOffset }}>
          {unselected.map((c: CommunityItem) => (
            <motion.div key={c.id} layoutId={`avatar-${c.id}`} className="cursor-pointer" onClick={() => toggle(c.id)} animate={{ filter: 'grayscale(1)', scale: 1 }} transition={AVATAR_MOTION_TRANSITION} initial={false}>
              <Avatar className={cn(dims.s, dims.b, 'border-neutral-300 dark:border-neutral-700')}>
                {c.iconUrl ? <AvatarImage src={c.iconUrl} /> : null}
                <AvatarFallback>{fallbackText(c.label)}</AvatarFallback>
                <AvatarGroupTooltip><MemoizedTooltipContent label={c.label} /></AvatarGroupTooltip>
              </Avatar>
            </motion.div>
          ))}
        </AvatarGroup>
      </motion.div>
    )}
  </div>
));
ExpandedView.displayName = 'ExpandedView';

// Main Component
// =================================================================

export default function CommunityPresenceSelector({ items, className, size = 'md', value, onChange, tooltipSide = 'top', tooltipOffset = 14, overlap = 'normal', hoverLift }: CommunityPresenceSelectorProps) {
  const controlled = value !== undefined;
  const [internalSelectedIds, setInternalSelectedIds] = React.useState<string[]>(() => items.map(i => i.id));
  const [togglingGroup, setTogglingGroup] = React.useState<'selected' | 'unselected' | null>(null);
  const [isHovered, setIsHovered] = React.useState(false);
  const [isAnimating, setIsAnimating] = React.useState(false);
  const animationTimer = React.useRef<NodeJS.Timeout>();

  // Animate on hover change
  React.useEffect(() => {
    setIsAnimating(true);
    animationTimer.current = setTimeout(() => setIsAnimating(false), ANIMATION_DURATION);
    return () => clearTimeout(animationTimer.current);
  }, [isHovered]);

  // Sync state with props
  const effectiveSelectedIds: string[] = React.useMemo(() => {
    if (controlled) {
      if (value === null) return items.map(i => i.id);
      const allowed = new Set(items.map(i => i.id));
      return (value || []).filter(id => allowed.has(id));
    }
    return internalSelectedIds;
  }, [controlled, value, items, internalSelectedIds]);

  const itemIds = React.useMemo(() => items.map(i => i.id).join(','), [items]);
  React.useEffect(() => {
    if (!controlled) {
      setInternalSelectedIds(items.map(i => i.id));
      onChange?.(null);
    }
  }, [itemIds, controlled, onChange, items]);

  const selected = React.useMemo(() => items.filter(i => effectiveSelectedIds.includes(i.id)), [items, effectiveSelectedIds]);
  const unselected = React.useMemo(() => items.filter(i => !effectiveSelectedIds.includes(i.id)), [items, effectiveSelectedIds]);

  // Memoize display-related values
  const dims = React.useMemo(() => size === 'lg' ? { h: 'h-14', s: 'size-14', b: 'border-4' } : size === 'sm' ? { h: 'h-8', s: 'size-8', b: 'border-2' } : { h: 'h-12', s: 'size-12', b: 'border-3' }, [size]);
  const space = React.useMemo(() => overlap === 'tight' ? '-space-x-2' : '-space-x-3', [overlap]);

  // Memoize callback
  const toggle = React.useCallback((id: string) => {
    const prev = effectiveSelectedIds;
    const has = prev.includes(id);
    const next = has ? prev.filter((x: string) => x !== id) : [...prev, id];
    if (next.length === 0) return;
    setTogglingGroup(has ? 'selected' : 'unselected');
    const allIds = items.map(i => i.id);
    const allSelected = next.length === allIds.length && allIds.every(x => next.includes(x));
    onChange?.(allSelected ? null : [...next]);
    if (!controlled) setInternalSelectedIds(next);
    setTimeout(() => setTogglingGroup(null), 500);
  }, [effectiveSelectedIds, items, onChange, controlled]);

  const renderContent = () => {
    const showDock = isAnimating;
    const showExpanded = isHovered && !isAnimating;
    const showCollapsed = !isHovered && !isAnimating;

    if (showDock) {
      return <DockView items={[...selected, ...unselected]} unselected={unselected} toggle={toggle} dims={dims} />;
    }
    if (showExpanded) {
      return <ExpandedView selected={selected} unselected={unselected} toggle={toggle} dims={dims} space={space} hoverLift={hoverLift} tooltipSide={tooltipSide} tooltipOffset={tooltipOffset} togglingGroup={togglingGroup} className={className} />;
    }
    if (showCollapsed) {
      return <CollapsedView selected={selected} items={[...selected, ...unselected]} dims={dims} />;
    }
    return null;
  };

  return (
    <TooltipProvider>
      <div
        className={cn('flex items-center justify-center min-h-[64px]', className)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <LayoutGroup>{renderContent()}</LayoutGroup>
      </div>
    </TooltipProvider>
  );
}
