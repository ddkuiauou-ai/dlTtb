"use client";

import { useEffect } from "react";
import { markPostAsRead } from "@/lib/read-marker";

interface ReadMarkerProps {
    canonicalId: string;
    routeId?: string;
    title: string;
    url?: string | null;
}

export function ReadMarker({ canonicalId, routeId, title, url }: ReadMarkerProps) {
    useEffect(() => {
        markPostAsRead({ id: canonicalId, title, url });
        // If routeId is different, we can mark it as well, though the title is the same.
        if (routeId && routeId !== canonicalId) {
            markPostAsRead({ id: routeId, title, url });
        }
    }, [canonicalId, routeId, title, url]);

    return null;
}
