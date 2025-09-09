interface PostInfo {
  id: string;
  title: string;
}

interface ReadRecord {
  ts: number;
  title: string;
}

export function markPostAsRead(post: PostInfo) {
    if (!post || !post.id || !post.title) return;

    try {
        const KEY = "readPosts:v2"; // v2 for new data structure
        const raw = localStorage.getItem(KEY);
        const data: Record<string, ReadRecord> = raw ? JSON.parse(raw) : {};
        const now = Date.now();

        // Add new record
        data[post.id] = { ts: now, title: post.title };

        // Prune old entries
        const MAX_AGE_DAYS = 30;
        const MAX_ITEMS = 5000;
        const maxAgeMs = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

        const pruned = Object.fromEntries(
            Object.entries(data)
                .filter(([, record]) => (now - record.ts) < maxAgeMs)
                .sort(([, a], [, b]) => b.ts - a.ts) // Sort by timestamp descending
                .slice(0, MAX_ITEMS) // Keep most recent N
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