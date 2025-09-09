interface PostEmbedsProps {
    embeds?: { type: string; url: string; title?: string; thumbnail?: string }[];
}

export default function PostEmbeds({ embeds }: PostEmbedsProps) {
    if (!embeds || embeds.length === 0) return null;

    const toYouTubeEmbed = (url: string) => {
        try {
            const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
            const isYT = u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be');
            if (!isYT) return url;

            let embedUrl = url;
            if (u.hostname.includes('youtu.be')) {
                const id = u.pathname.replace(/^\//, '');
                if (id) embedUrl = `https://www.youtube.com/embed/${id}`;
            } else if (u.hostname.includes('youtube.com')) {
                if (u.pathname.startsWith('/watch')) {
                    const id = u.searchParams.get('v');
                    if (id) embedUrl = `https://www.youtube.com/embed/${id}`;
                } else if (u.pathname.startsWith('/embed/')) {
                    embedUrl = u.toString();
                }
            }

            const eu = new URL(embedUrl, u);
            eu.searchParams.set('enablejsapi', '1');
            try { eu.searchParams.set('origin', typeof window !== 'undefined' ? window.location.origin : 'http://localhost'); } catch {}
            if (!eu.searchParams.has('modestbranding')) eu.searchParams.set('modestbranding', '1');
            if (!eu.searchParams.has('rel')) eu.searchParams.set('rel', '0');
            return eu.toString();
        } catch {
            return url;
        }
    };

    return (
        <div className="space-y-4">
            {embeds.map((embed, i) => {
                if (embed.type === "youtube") {
                    const src = toYouTubeEmbed(embed.url);
                    return (
                        <iframe
                            key={embed.url + i}
                            src={src}
                            title={embed.title || "YouTube embed"}
                            className="w-full aspect-video rounded-lg"
                            allowFullScreen
                            tabIndex={-1}
                        />
                    );
                }
                // 기타 임베드 (ex: 트위터, iframe)
                return (
                    <a
                        key={embed.url + i}
                        href={embed.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block border rounded p-2 hover:bg-gray-50"
                    >
                        {embed.title || embed.url}
                    </a>
                );
            })}
        </div>
    );
}
