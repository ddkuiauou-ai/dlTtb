"use client";

import { useEffect } from "react";

export function ReadMarker({ canonicalId, routeId }: { canonicalId: string; routeId?: string }) {
    useEffect(() => {
        try {
            const KEY = "readPosts:v1";
            const raw = localStorage.getItem(KEY);
            const data: Record<string, number> = raw ? JSON.parse(raw) : {};
            const now = Date.now();

            // save both ids (route and canonical) to be safe
            data[canonicalId] = now;
            if (routeId && routeId !== canonicalId) data[routeId] = now;

            // Prune old entries
            const MAX_AGE_DAYS = 30;
            const MAX_ITEMS = 5000;
            const maxAgeMs = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
            const pruned = Object.fromEntries(
              Object.entries(data)
                .filter(([, ts]) => (now - ts) < maxAgeMs)
                .slice(-MAX_ITEMS) // Keep most recent N
            );
            localStorage.setItem(KEY, JSON.stringify(pruned));

            // notify layout to re-apply marks (client navigation)
            window.dispatchEvent(new Event("readPosts:updated"));

            // optional debug
            if (localStorage.getItem("debugReadMark") === "1") {
                // eslint-disable-next-line no-console
                console.debug("[read-mark:detail]", { canonicalId, routeId, size: Object.keys(pruned).length });
            }
        } catch {
            // no-op
        }
    }, [canonicalId, routeId]);

    return null;
}