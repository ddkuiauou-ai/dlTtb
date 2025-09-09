"use client";

import { useEffect, useMemo, useState } from "react";

export type Range = "3h" | "6h" | "24h" | "1w";
function isValidRange(r: any): r is Range { return r === "3h" || r === "6h" || r === "24h" || r === "1w"; }

export type ViewMode = "grid" | "list";
export type ReadFilter = "all" | "read" | "unread";

type Entry = { vm: ViewMode; rf: ReadFilter; rg: Range; updatedAt: number };
type FeedPrefsMap = Record<string, Entry>;

const KEY = "isshoo:feedPrefs:v2";
const MAX_ITEMS = 500;

function scopeKey(type: "category" | "keyword", id: string) {
    const norm = encodeURIComponent(id.trim().toLowerCase());
    return `${type}:${norm}`;
}

function loadMap(): FeedPrefsMap {
    try {
        const raw = localStorage.getItem(KEY);
        const obj = raw ? JSON.parse(raw) : {};
        return obj && typeof obj === "object" ? obj as FeedPrefsMap : {};
    } catch {
        return {};
    }
}

function saveMap(map: FeedPrefsMap) {
    try {
        const entries = Object.entries(map)
            .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
            .slice(0, MAX_ITEMS);
        const pruned = Object.fromEntries(entries);
        localStorage.setItem(KEY, JSON.stringify(pruned));
        window.dispatchEvent(new Event("feedPrefs:updated"));
        if (localStorage.getItem("debugFeedPrefs") === "1") {
            // eslint-disable-next-line no-console
            console.debug("[feed-prefs] saved", { size: entries.length });
        }
    } catch { }
}

export function useScopedFeedPrefs(opts: {
    type: "category" | "keyword";
    id: string;
    defaults?: Partial<Pick<Entry, "vm" | "rf" | "rg">>;
}) {
    const { type, id, defaults } = opts;
    const skey = useMemo(() => scopeKey(type, id), [type, id]);

    const [vm, setVm] = useState<ViewMode>(defaults?.vm ?? "grid");
    const [rf, setRf] = useState<ReadFilter>(defaults?.rf ?? "all");
    const [rg, setRg] = useState<Range>(defaults?.rg ?? "24h");
    const [ready, setReady] = useState(false);

    // load once
    useEffect(() => {
        try {
            const map = loadMap();
            const hit = map[skey];
            if (hit) {
                setVm(hit.vm);
                setRf(hit.rf);
                setRg(hit.rg ?? "24h");
            }
        } finally {
            setReady(true);
        }
    }, [skey]);

    // persist on change
    useEffect(() => {
        if (!ready) return;
        try {
            const map = loadMap();
            const prev = map[skey];
            map[skey] = { vm, rf, rg, updatedAt: Date.now() };
            saveMap(map);
        } catch { }
    }, [skey, vm, rf, rg, ready]);

    // cross-tab / cross-route sync
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key !== KEY) return;
            const map = loadMap();
            const hit = map[skey];
            if (hit) {
                setVm(hit.vm);
                setRf(hit.rf);
                setRg(hit.rg ?? "24h");
            }
        };
        const onCustom = () => {
            const map = loadMap();
            const hit = map[skey];
            if (hit) {
                setVm(hit.vm);
                setRf(hit.rf);
                setRg(hit.rg ?? "24h");
            }
        };
        window.addEventListener("storage", onStorage);
        window.addEventListener("feedPrefs:updated", onCustom);
        return () => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener("feedPrefs:updated", onCustom);
        };
    }, [skey]);

    return {
        ready,
        viewMode: vm,
        readFilter: rf,
        range: rg,
        setViewMode: setVm,
        setReadFilter: setRf,
        setRange: setRg,
    } as const;
}

export function resetScopedFeedPrefs(type: "category" | "keyword", id: string) {
    try {
        const skey = scopeKey(type, id);
        const map = loadMap();
        delete map[skey];
        saveMap(map);
    } catch { }
}

export function getScopedRange(type: "category" | "keyword", id: string, fallback: Range = "24h"): Range {
  try {
    const skey = scopeKey(type, id);
    const map = loadMap();
    const hit = map[skey];
    return hit?.rg ?? fallback;
  } catch {
    return fallback;
  }
}

export function setScopedRange(type: "category" | "keyword", id: string, range: Range): void {
  if (!isValidRange(range)) return;
  try {
    const skey = scopeKey(type, id);
    const map = loadMap();
    const exists = map[skey];
    map[skey] = {
      vm: exists?.vm ?? "grid",
      rf: exists?.rf ?? "all",
      rg: range,
      updatedAt: Date.now(),
    };
    saveMap(map);
  } catch { /* no-op */ }
}