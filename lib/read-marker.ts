interface PostInfo {
  id: string;
  title: string;
  url?: string | null;
}

interface ReadRecord {
  ts: number;
  title: string;
  url?: string;
}

export const READ_POSTS_KEY = "readPosts:v2";

// Keep every read-state consumer in sync, including after a tab resumes.
export function subscribeToReadPosts(onChange: () => void): () => void {
    if (typeof window === "undefined") return () => {};

    const onStorage = (event: StorageEvent) => {
        if (event.key !== READ_POSTS_KEY && event.key !== null) return;
        try {
            if (event.storageArea !== window.localStorage) return;
        } catch { return; }
        onChange();
    };
    const onVisible = () => {
        if (document.visibilityState === "visible") onChange();
    };

    window.addEventListener("readPosts:updated", onChange);
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", onChange);
    document.addEventListener("visibilitychange", onVisible);
    onChange();

    return () => {
        window.removeEventListener("readPosts:updated", onChange);
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("pageshow", onChange);
        document.removeEventListener("visibilitychange", onVisible);
    };
}

function coerceUrl(candidate: unknown): string | undefined {
  return typeof candidate === "string" && candidate.trim() ? candidate : undefined;
}

export function markPostAsRead(post: PostInfo) {
    if (!post || !post.id || !post.title) return;

    try {
        const KEY = READ_POSTS_KEY;
        const raw = localStorage.getItem(KEY);
        const data: Record<string, ReadRecord> = raw ? JSON.parse(raw) : {};
        const now = Date.now();

        const previous = data[post.id];
        const url = coerceUrl(post.url) ?? coerceUrl(previous?.url);

        // Add new record
        data[post.id] = url ? { ts: now, title: post.title, url } : { ts: now, title: post.title };

        // Prune old entries
        const MAX_AGE_DAYS = 30;
        const MAX_ITEMS = 5000;
        const maxAgeMs = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

        const pruned = Object.fromEntries(
            Object.entries(data)
                .filter(([, record]) => record && typeof record.ts === "number" && typeof record.title === "string")
                .filter(([, record]) => (now - record.ts) < maxAgeMs)
                .sort(([, a], [, b]) => b.ts - a.ts) // Sort by timestamp descending
                .slice(0, MAX_ITEMS) // Keep most recent N
                .map(([id, record]) => {
                    const normalized: ReadRecord = { ts: record.ts, title: record.title };
                    const normalizedUrl = coerceUrl(record.url);
                    if (normalizedUrl) {
                        normalized.url = normalizedUrl;
                    }
                    return [id, normalized] as const;
                })
        );

        localStorage.setItem(KEY, JSON.stringify(pruned));

        // notify layout to re-apply marks (client navigation)
        window.dispatchEvent(new Event("readPosts:updated"));

        // optional debug
        if (localStorage.getItem("debugReadMark") === "1") {
            // eslint-disable-next-line no-console
            console.debug("[read-mark]", { postId: post.id, title: post.title, size: Object.keys(pruned).length });
        }
    } catch {
        // no-op
    }
}
