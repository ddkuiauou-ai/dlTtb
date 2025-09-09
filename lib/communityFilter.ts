// lib/communityFilter.ts
export const COMMUNITY_EVENT = "community-filter";
// v2: support multi-select of communities
export const COMMUNITY_EVENT_V2 = "community-filter-v2";

export const emitCommunity = (value: string) => {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(COMMUNITY_EVENT, { detail: value }));
    }
};

export const onCommunity = (handler: (v: string) => void) => {
    const listener = (e: Event) => {
        const v = (e as CustomEvent<string>).detail ?? "전체";
        handler(v);
    };
    if (typeof window !== "undefined") {
        window.addEventListener(COMMUNITY_EVENT, listener as EventListener);
    }
    // 해제 함수 반환
    return () => {
        if (typeof window !== "undefined") {
            window.removeEventListener(COMMUNITY_EVENT, listener as EventListener);
        }
    };
};

// Multi-select APIs (null means "전체" / all selected)
export type CommunitySelection = string[] | null;

export const emitCommunities = (ids: CommunitySelection) => {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(COMMUNITY_EVENT_V2, { detail: ids }));
    }
};

export const onCommunities = (handler: (ids: CommunitySelection) => void) => {
    const listener = (e: Event) => {
        const v = (e as CustomEvent<CommunitySelection>).detail ?? null;
        handler(v);
    };
    if (typeof window !== "undefined") {
        window.addEventListener(COMMUNITY_EVENT_V2, listener as EventListener);
    }
    return () => {
        if (typeof window !== "undefined") {
            window.removeEventListener(COMMUNITY_EVENT_V2, listener as EventListener);
        }
    };
};
