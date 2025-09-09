"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Menu, X } from "lucide-react"
import { emitCommunity, emitCommunities } from "@/lib/communityFilter"
import CommunityPresenceSelector from "@/components/community-presence-selector";
import { SearchBar } from "@/components/search-bar";

interface Site {
  id: string;
  board: string;
  name: string | null;
}

interface HeaderClientProps {
  sites: Site[];
}

export function HeaderClient({ sites }: HeaderClientProps) {
  const [selectedCommunity, setSelectedCommunity] = useState("전체")
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showHelper, setShowHelper] = useState(true)
  const [showKeyHint, setShowKeyHint] = useState(false)

  // Show the keyboard hint banner once, then hide for a period
  const KEYHINT_KEY = 'isshoo:keyhint:dismissedAt:v1';
  const HINT_TTL_DAYS = 14; // show again after 14 days

  // Initialize showKeyHint from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEYHINT_KEY);
      if (!raw) { setShowKeyHint(true); return; }
      const ts = Number(raw);
      if (!Number.isFinite(ts)) { setShowKeyHint(true); return; }
      const elapsedDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
      setShowKeyHint(elapsedDays >= HINT_TTL_DAYS);
    } catch {
      setShowKeyHint(true);
    }
  }, []);

  const dismissKeyHint = () => {
    try { localStorage.setItem(KEYHINT_KEY, String(Date.now())); } catch { }
    setShowKeyHint(false);
  };

  // Persisted community selection across routes
  const COMM_KEY = 'isshoo:communities:selected:v1';
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COMM_KEY);
      const saved = raw ? (JSON.parse(raw) as string[]) : null;
      // Clamp to known sites
      const allIds = Array.from(new Set(sites.map(s => s.id)));
      const clamped = saved ? saved.filter(id => allIds.includes(id)) : null;
      setSelectedIds(clamped);
      // Emit to consumers so views reflect saved selection immediately
      if (!clamped || clamped.length === allIds.length) {
        emitCommunities(null);
        emitCommunity("전체");
        setSelectedCommunity("전체");
      } else {
        emitCommunities(clamped);
        if (clamped.length === 1) {
          emitCommunity(clamped[0]);
          setSelectedCommunity(clamped[0]);
        } else {
          emitCommunity("전체");
          setSelectedCommunity("전체");
        }
      }
    } catch {
      // default: all selected
      setSelectedIds(null);
      emitCommunities(null);
      emitCommunity("전체");
      setSelectedCommunity("전체");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites.map(s => s.id).join(',')]);

  // Use site id as the community key; display name as label
  const iconMap: Record<string, string> = {
    clien: 'https://www.clien.net/favicon.ico',
    damoang: 'https://damoang.net/favicon.ico',
    ppomppu: 'https://www.ppomppu.co.kr/favicon.ico',
    fmkorea: 'https://www.fmkorea.com/favicon.ico',
  };
  const communitiesAll = Array.from(new Map(sites.map(s => [s.id, (s.name || s.id)])).entries()).map(([id, label]) => ({ id, label, iconUrl: iconMap[id] }));

  return (
    <header className="sticky top-0 z-50 bg-white border-b shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center space-x-4">
            <a href="/" className="focus:outline-none">
              <h1 className="text-2xl font-bold text-blue-600 cursor-pointer hover:opacity-80 transition">
                Isshoo <span className="text-xs text-gray-500 align-top">이슈</span>
              </h1>
            </a>
            <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">인기글 모아보기</span>
          </div>

          {/* Desktop Navigation (Community Multi-select Avatars) */}
          <div className="hidden md:flex items-center">
            <CommunityPresenceSelector
              items={communitiesAll}
              value={selectedIds}
              size="sm"
              overlap="tight"
              tooltipSide="bottom"
              tooltipOffset={10}
              hoverLift="-20%"
              onChange={(idsOrAll) => {
                // idsOrAll === null means ALL selected (전체)
                if (idsOrAll == null) {
                  try { localStorage.setItem(COMM_KEY, JSON.stringify(communitiesAll.map(c => c.id))); } catch { }
                  setSelectedIds(null);
                  setSelectedCommunity("전체");
                  emitCommunities(null);
                  emitCommunity("전체"); // backward compatibility with listeners
                } else {
                  // For UX parity, when only one is selected, mirror single-select
                  if (idsOrAll.length === 1) {
                    setSelectedIds([...idsOrAll]);
                    setSelectedCommunity(idsOrAll[0]);
                    emitCommunity(idsOrAll[0]);
                  } else {
                    setSelectedIds([...idsOrAll]);
                    setSelectedCommunity("전체");
                  }
                  try { localStorage.setItem(COMM_KEY, JSON.stringify(idsOrAll)); } catch { }
                  emitCommunities(idsOrAll);
                }
              }}
            />
          </div>

          {/* Search Bar */}
          <div className="flex-1 flex justify-end md:justify-center md:px-8 lg:px-16">
            <div className="w-full max-w-md">
              <SearchBar />
            </div>
          </div>

          {/* Mobile Menu Button */}
          <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {/* Info Banner */}
        {showHelper && (
          <div className="mt-2 mb-2 rounded-md bg-blue-50 text-blue-800 text-xs px-3 py-2 flex items-start justify-between gap-3">
            <div>
              <strong className="mr-1">안내</strong>
              상단은 선택한 범위에 맞춘 요약/추천 영역입니다. 아래로 더 내리면 ‘최신’ 피드가 계속 이어집니다. 커뮤니티 탭은 <b>화면 필터만</b> 적용되며, 추가 로드는 선택한 범위의 전체 피드를 이어받습니다.
            </div>
            <button onClick={() => setShowHelper(false)} className="shrink-0 text-blue-700 hover:text-blue-900" aria-label="닫기">✕</button>
          </div>
        )}

        {/* Keyboard Shortcuts Hint (concise) */}
        {showKeyHint && (
          <div className="-mt-1 mb-2 flex items-center justify-between rounded-md bg-gray-50 border text-gray-700 px-3 py-1.5 text-[11px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-gray-600">단축키</span>
              <span className="inline-flex items-center gap-1"><span className="border rounded px-1 py-0.5 bg-white">←/→</span><span>이전/다음</span></span>
              <span className="inline-flex items-center gap-1"><span className="border rounded px-1 py-0.5 bg-white">↑/↓</span><span>스크롤</span></span>
              <span className="inline-flex items-center gap-1"><span className="border rounded px-1 py-0.5 bg-white">Space</span><span>페이지↓</span></span>
              <span className="inline-flex items-center gap-1"><span className="border rounded px-1 py-0.5 bg-white">Shift+Space</span><span>페이지↑</span></span>
              <span className="inline-flex items-center gap-1"><span className="border rounded px-1 py-0.5 bg-white">Enter</span><span>재생/댓글로 이동</span></span>
            </div>
            <button onClick={dismissKeyHint} className="shrink-0 text-gray-500 hover:text-gray-700" aria-label="닫기">✕</button>
          </div>
        )}

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t">
            <div className="mb-4">
              <SearchBar />
            </div>
            <div className="mb-4 overflow-x-auto">
              <CommunityPresenceSelector
                items={communitiesAll}
                value={selectedIds}
                size="sm"
                overlap="tight"
                tooltipSide="bottom"
                tooltipOffset={10}
                hoverLift="-20%"
                onChange={(idsOrAll) => {
                  if (idsOrAll == null) {
                    try { localStorage.setItem(COMM_KEY, JSON.stringify(communitiesAll.map(c => c.id))); } catch { }
                    setSelectedIds(null);
                    setSelectedCommunity("전체");
                    emitCommunities(null);
                    emitCommunity("전체");
                  } else {
                    if (idsOrAll.length === 1) { setSelectedCommunity(idsOrAll[0]); emitCommunity(idsOrAll[0]); }
                    else { setSelectedCommunity("전체"); }
                    setSelectedIds([...idsOrAll]);
                    try { localStorage.setItem(COMM_KEY, JSON.stringify(idsOrAll)); } catch { }
                    emitCommunities(idsOrAll);
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
