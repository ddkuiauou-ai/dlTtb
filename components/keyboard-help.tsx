'use client';

import { HelpCircle } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

const shortcuts = [
  { key: '←', description: '이전 글' },
  { key: '→', description: '다음 글' },
  { key: 'J / ↓', description: '아래로 스크롤' },
  { key: 'K / ↑', description: '위로 스크롤' },
  { key: 'Space', description: '페이지 스크롤 / 다음 글' },
  { key: 'Home', description: '맨 위로' },
  { key: 'End', description: '맨 아래로' },
  { key: 'Esc', description: '닫기' },
];

export function KeyboardHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="absolute top-3 right-3 text-gray-500 hover:text-gray-800">
          <HelpCircle className="h-5 w-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60">
        <div className="grid gap-4">
          <h4 className="font-medium leading-none">키보드 단축키</h4>
          <div className="grid gap-2">
            {shortcuts.map((shortcut) => (
              <div key={shortcut.key} className="grid grid-cols-2 items-center gap-4">
                <kbd className="px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">
                  {shortcut.key}
                </kbd>
                <span className="text-sm text-muted-foreground">
                  {shortcut.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
