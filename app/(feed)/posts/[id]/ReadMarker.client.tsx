"use client";

import { useEffect } from "react";
import { markPostAsRead } from "@/lib/read-marker";

interface ReadMarkerProps {
    canonicalId: string;
    routeId?: string;
    title: string;
}

export function ReadMarker({ canonicalId, routeId, title }: ReadMarkerProps) {
    useEffect(() => {
        markPostAsRead({ id: canonicalId, title });
        // If routeId is different, we can mark it as well, though the title is the same.
        if (routeId && routeId !== canonicalId) {
            markPostAsRead({ id: routeId, title });
        }
    }, [canonicalId, routeId, title]);

    return null;
}
