"use client";

import { useState } from "react";
import { Heart, MessageCircle, Trash2 } from "lucide-react";
import { NewsComments } from "./news-comments";
import { NewsFeedPost } from "./types";

interface NewsPostCardProps {
  post: NewsFeedPost;
  token: string;
  tenantSlug: string;
  currentUserId: number;
  togglingLike: boolean;
  deletingPost: boolean;
  onToggleLike: (post: NewsFeedPost) => Promise<void>;
  onDeletePost: (postId: number) => Promise<void>;
  onCommentsCountChange: (postId: number, count: number) => void;
}

export function NewsPostCard({
  post,
  token,
  tenantSlug,
  currentUserId,
  togglingLike,
  deletingPost,
  onToggleLike,
  onDeletePost,
  onCommentsCountChange,
}: NewsPostCardProps) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const isAuthor = post.author.id === currentUserId;

  return (
    <article className="news-post-card">
      <header className="news-post-head">
        <div>
          <p className="news-post-author">{post.author.name}</p>
          <p className="news-post-date">{new Date(post.createdAt).toLocaleString("ru-RU")}</p>
        </div>
        {isAuthor ? (
          <button
            type="button"
            className="secondary-button small"
            onClick={() => onDeletePost(post.id)}
            disabled={deletingPost}
          >
            <Trash2 size={14} />
            Удалить
          </button>
        ) : null}
      </header>

      <p className="news-post-body">{post.body}</p>

      {post.attachments.length > 0 ? (
        <div className={post.attachments.length === 1 ? "news-media-grid single" : "news-media-grid"}>
          {post.attachments.map((attachment) => (
            <div key={attachment.id} className="news-media-tile">
              {attachment.mediaType === "IMAGE" ? (
                <img src={attachment.fileUrl} alt={attachment.fileName} />
              ) : (
                <video src={attachment.fileUrl} controls preload="metadata" playsInline />
              )}
            </div>
          ))}
        </div>
      ) : null}

      <div className="news-post-actions">
        <button
          type="button"
          className={post.likedByMe ? "news-action-button active" : "news-action-button"}
          onClick={() => onToggleLike(post)}
          disabled={togglingLike}
        >
          <Heart size={16} />
          {post.likesCount}
        </button>
        <button
          type="button"
          className={commentsOpen ? "news-action-button active" : "news-action-button"}
          onClick={() => setCommentsOpen((current) => !current)}
        >
          <MessageCircle size={16} />
          {post.commentsCount}
        </button>
      </div>

      {commentsOpen ? (
        <NewsComments
          postId={post.id}
          token={token}
          tenantSlug={tenantSlug}
          currentUserId={currentUserId}
          onCountChange={(count) => onCommentsCountChange(post.id, count)}
        />
      ) : null}
    </article>
  );
}
