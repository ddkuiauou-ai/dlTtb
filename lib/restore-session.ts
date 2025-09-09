// is/lib/restore-session.ts
type RestoreRead = {
    should: boolean;
    anchorPostId: string | null;
    anchorPage: number | null;
    sourceUrl: string | null;
};

const K = (base: string, key: string) => `${key}-${base}/latest`;

export function markNavigateToPost(
    storageKey: string,
    opts: { anchorPostId: string; anchorPage?: number; sourceUrl?: string }
) {
    try {
        sessionStorage.setItem("lastSectionKey/latest", storageKey);
        sessionStorage.setItem(K(storageKey, "returnFromPost"), "1");
        sessionStorage.setItem(K(storageKey, "anchorPostId"), opts.anchorPostId);
        if (opts.anchorPage != null) {
            sessionStorage.setItem(K(storageKey, "anchorPage"), String(opts.anchorPage));
        }
        if (opts.sourceUrl) {
            sessionStorage.setItem(K(storageKey, "sourceUrl"), opts.sourceUrl);
        }
    } catch { }
}

export function prepareReturnFromDetail(storageKey: string, postId: string) {
    try {
        sessionStorage.setItem(K(storageKey, "returnFromPost"), "1");
        sessionStorage.setItem(K(storageKey, "anchorPostId"), postId);
    } catch { }
}

export function readAndClearRestore(storageKey: string): RestoreRead {
    try {
        const should = sessionStorage.getItem(K(storageKey, "returnFromPost")) === "1";
        const anchorPostId = sessionStorage.getItem(K(storageKey, "anchorPostId"));
        const anchorPageStr = sessionStorage.getItem(K(storageKey, "anchorPage"));
        const sourceUrl = sessionStorage.getItem(K(storageKey, "sourceUrl"));
        sessionStorage.removeItem(K(storageKey, "returnFromPost"));
        sessionStorage.removeItem(K(storageKey, "anchorPostId"));
        sessionStorage.removeItem(K(storageKey, "anchorPage"));
        sessionStorage.removeItem(K(storageKey, "sourceUrl"));
        return {
            should,
            anchorPostId: anchorPostId || null,
            anchorPage: anchorPageStr ? parseInt(anchorPageStr, 10) : null,
            sourceUrl: sourceUrl || null,
        };
    } catch {
        return { should: false, anchorPostId: null, anchorPage: null, sourceUrl: null };
    }
}