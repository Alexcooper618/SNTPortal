"use client";

import { FormEvent, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { NewsComment } from "./types";

interface CommentsResponse {
  items: NewsComment[];
  nextCursor: string | null;
}

interface NewsCommentsProps {
  postId: number;
  token: string;
  tenantSlug: string;
  currentUserId: number;
  onCountChange?: (count: number) => void;
}

export function NewsComments({
  postId,
  token,
  tenantSlug,
  currentUserId,
  onCountChange,
}: NewsCommentsProps) {
  const [items, setItems] = useState<NewsComment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async (cursor?: string) => {
    const isInitial = !cursor;
    if (isInitial) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const response = await apiRequest<CommentsResponse>(
        `/news/posts/${postId}/comments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        {
          token,
          tenantSlug,
        }
      );

      setItems((current) => (isInitial ? response.items : [...current, ...response.items]));
      setNextCursor(response.nextCursor);
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError
          ? requestError.message
          : "Не удалось загрузить комментарии"
      );
    } finally {
      if (isInitial) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    load();
  }, [postId]);

  useEffect(() => {
    onCountChange?.(items.length);
  }, [items.length, onCountChange]);

  const addComment = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;

    setSending(true);
    try {
      const response = await apiRequest<{ comment: NewsComment }>(`/news/posts/${postId}/comments`, {
        method: "POST",
        token,
        tenantSlug,
        body: {
          body,
        },
      });

      const nextItems = [response.comment, ...items];
      setItems(nextItems);
      setDraft("");
      setError(null);
      onCountChange?.(nextItems.length);
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError
          ? requestError.message
          : "Не удалось отправить комментарий"
      );
    } finally {
      setSending(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    setDeletingCommentId(commentId);
    try {
      await apiRequest<{ ok: true }>(`/news/comments/${commentId}`, {
        method: "DELETE",
        token,
        tenantSlug,
      });

      const nextItems = items.filter((comment) => comment.id !== commentId);
      setItems(nextItems);
      setError(null);
      onCountChange?.(nextItems.length);
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError ? requestError.message : "Не удалось удалить комментарий"
      );
    } finally {
      setDeletingCommentId(null);
    }
  };

  return (
    <div className="news-comments">
      <form className="news-comment-form" onSubmit={addComment}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Написать комментарий..."
          maxLength={1200}
          disabled={sending}
        />
        <button className="secondary-button" type="submit" disabled={sending || draft.trim().length === 0}>
          Отправить
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <p className="muted">Загрузка комментариев...</p>
      ) : items.length === 0 ? (
        <p className="muted">Комментариев пока нет.</p>
      ) : (
        <ul className="news-comment-list">
          {items.map((comment) => (
            <li key={comment.id} className="news-comment-item">
              <div className="news-comment-head">
                <strong>{comment.author.name}</strong>
                <span>{new Date(comment.createdAt).toLocaleString("ru-RU")}</span>
              </div>
              <p>{comment.body}</p>
              {comment.authorId === currentUserId ? (
                <button
                  type="button"
                  className="news-comment-delete"
                  onClick={() => deleteComment(comment.id)}
                  disabled={deletingCommentId === comment.id}
                >
                  <Trash2 size={14} />
                  Удалить
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {nextCursor ? (
        <button
          type="button"
          className="secondary-button"
          onClick={() => load(nextCursor)}
          disabled={loadingMore}
        >
          {loadingMore ? "Загрузка..." : "Показать еще"}
        </button>
      ) : null}
    </div>
  );
}
