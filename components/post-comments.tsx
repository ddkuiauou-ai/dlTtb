interface PostCommentsProps {
    comments?: { id: string; author?: string; content: string; timestamp?: string; likeCount?: number }[];
}

export default function PostComments({ comments }: PostCommentsProps) {
    if (!comments || comments.length === 0) return null;
    return (
        <section className="mt-8">
            <h2 className="text-lg font-semibold mb-4">댓글</h2>
            <ul className="space-y-4">
                {comments.map((c) => (
                    <li key={c.id} className="border rounded p-3 bg-gray-50">
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                            <span>{c.author || "익명"}</span>
                            {c.timestamp && <span>· {c.timestamp}</span>}
                            {typeof c.likeCount === "number" && <span>· 추천 {c.likeCount}</span>}
                        </div>
                        <div className="text-gray-900 whitespace-pre-line">{c.content}</div>
                    </li>
                ))}
            </ul>
        </section>
    );
}
