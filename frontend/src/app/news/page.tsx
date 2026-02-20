"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Plus, X } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { NewsComposer } from "@/components/news/news-composer";
import { NewsPostCard } from "@/components/news/news-post-card";
import { NewsStoryRail } from "@/components/news/news-story-rail";
import { NewsStoryViewer } from "@/components/news/news-story-viewer";
import { NewsFeedPost, NewsStoryGroup } from "@/components/news/types";
import { apiRequest, ApiRequestError, getApiBaseUrl } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

interface FeedResponse {
  items: NewsFeedPost[];
  nextCursor: number | null;
}

interface StoriesResponse {
  items: NewsStoryGroup[];
}

interface LikeResponse {
  liked: boolean;
  likesCount: number;
}

const imageMaxBytes = 10 * 1024 * 1024;
const videoMaxBytes = 50 * 1024 * 1024;

const getApiOrigin = () => {
  const baseUrl = getApiBaseUrl();
  try {
    return new URL(baseUrl).origin;
  } catch (_error) {
    return "";
  }
};

const toAbsoluteMediaUrl = (value: string) => {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  const apiOrigin = getApiOrigin();
  if (!apiOrigin) return value;
  return `${apiOrigin}${value.startsWith("/") ? value : `/${value}`}`;
};

const normalizePost = (post: NewsFeedPost): NewsFeedPost => ({
  ...post,
  attachments: post.attachments.map((attachment) => ({
    ...attachment,
    fileUrl: toAbsoluteMediaUrl(attachment.fileUrl),
  })),
});

const normalizeStories = (groups: NewsStoryGroup[]): NewsStoryGroup[] =>
  groups.map((group) => ({
    ...group,
    stories: group.stories.map((story) => ({
      ...story,
      fileUrl: toAbsoluteMediaUrl(story.fileUrl),
    })),
  }));

export default function NewsPage() {
  const { ready, session } = useAuth(true);
  const [feed, setFeed] = useState<NewsFeedPost[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [stories, setStories] = useState<NewsStoryGroup[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingStories, setLoadingStories] = useState(true);
  const [publishingPost, setPublishingPost] = useState(false);
  const [storyDialogOpen, setStoryDialogOpen] = useState(false);
  const [storyCaption, setStoryCaption] = useState("");
  const [storyFile, setStoryFile] = useState<File | null>(null);
  const [storyPreviewUrl, setStoryPreviewUrl] = useState<string | null>(null);
  const [publishingStory, setPublishingStory] = useState(false);
  const [deletingStoryId, setDeletingStoryId] = useState<string | null>(null);
  const [activeStoryGroupIndex, setActiveStoryGroupIndex] = useState<number | null>(null);
  const [togglingLikePostId, setTogglingLikePostId] = useState<number | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  const token = session?.accessToken ?? "";
  const tenantSlug = session?.tenantSlug ?? "";

  const canLoadMore = useMemo(() => nextCursor !== null, [nextCursor]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    return () => {
      if (storyPreviewUrl) {
        URL.revokeObjectURL(storyPreviewUrl);
      }
    };
  }, [storyPreviewUrl]);

  const loadFeed = async (cursor?: number) => {
    if (!session) return;
    if (cursor) {
      setLoadingMore(true);
    } else {
      setLoadingFeed(true);
    }

    try {
      const response = await apiRequest<FeedResponse>(
        `/news/feed${cursor ? `?cursor=${cursor}` : ""}`,
        {
          token: session.accessToken,
          tenantSlug: session.tenantSlug,
        }
      );

      const normalized = response.items.map(normalizePost);
      setFeed((current) => (cursor ? [...current, ...normalized] : normalized));
      setNextCursor(response.nextCursor);
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError
          ? requestError.message
          : "Не удалось загрузить ленту новостей"
      );
    } finally {
      if (cursor) {
        setLoadingMore(false);
      } else {
        setLoadingFeed(false);
      }
    }
  };

  const loadStories = async () => {
    if (!session) return;
    setLoadingStories(true);

    try {
      const response = await apiRequest<StoriesResponse>("/news/stories", {
        token: session.accessToken,
        tenantSlug: session.tenantSlug,
      });

      setStories(normalizeStories(response.items));
    } catch (_requestError) {
      setError("Не удалось загрузить истории");
    } finally {
      setLoadingStories(false);
    }
  };

  useEffect(() => {
    if (!ready || !session) return;
    loadFeed();
    loadStories();
  }, [ready, session]);

  useEffect(() => {
    if (!isClient) return;
    const hasOverlay = storyDialogOpen || activeStoryGroupIndex !== null;
    document.body.classList.toggle("news-overlay-open", hasOverlay);
    return () => {
      document.body.classList.remove("news-overlay-open");
    };
  }, [activeStoryGroupIndex, isClient, storyDialogOpen]);

  const createPost = async (payload: { body: string; files: File[] }) => {
    if (!session) return;

    setPublishingPost(true);
    setError(null);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.append("body", payload.body);
      payload.files.forEach((file) => formData.append("media", file));

      const response = await apiRequest<{ post: NewsFeedPost }>("/news/posts", {
        method: "POST",
        token: session.accessToken,
        tenantSlug: session.tenantSlug,
        body: formData,
      });

      setFeed((current) => [normalizePost(response.post), ...current]);
      setNotice("Пост опубликован");
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError ? requestError.message : "Не удалось опубликовать пост"
      );
      throw requestError;
    } finally {
      setPublishingPost(false);
    }
  };

  const toggleLike = async (post: NewsFeedPost) => {
    if (!session) return;
    setTogglingLikePostId(post.id);
    setError(null);

    try {
      const response = await apiRequest<LikeResponse>(`/news/posts/${post.id}/likes`, {
        method: post.likedByMe ? "DELETE" : "POST",
        token: session.accessToken,
        tenantSlug: session.tenantSlug,
      });

      setFeed((current) =>
        current.map((item) =>
          item.id === post.id
            ? {
                ...item,
                likedByMe: response.liked,
                likesCount: response.likesCount,
              }
            : item
        )
      );
    } catch (requestError) {
      setError(requestError instanceof ApiRequestError ? requestError.message : "Не удалось поставить лайк");
    } finally {
      setTogglingLikePostId(null);
    }
  };

  const deletePost = async (postId: number) => {
    if (!session) return;
    setDeletingPostId(postId);
    setError(null);

    try {
      await apiRequest<{ ok: true }>(`/news/posts/${postId}`, {
        method: "DELETE",
        token: session.accessToken,
        tenantSlug: session.tenantSlug,
      });

      setFeed((current) => current.filter((post) => post.id !== postId));
      setNotice("Пост удален");
    } catch (requestError) {
      setError(requestError instanceof ApiRequestError ? requestError.message : "Не удалось удалить пост");
    } finally {
      setDeletingPostId(null);
    }
  };

  const onCommentsCountChange = (postId: number, count: number) => {
    setFeed((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              commentsCount: count,
            }
          : post
      )
    );
  };

  const pickStoryFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setError("Для истории доступно только фото или видео");
      return;
    }

    if (file.type.startsWith("image/") && file.size > imageMaxBytes) {
      setError("Фото для истории не должно превышать 10 МБ");
      return;
    }

    if (file.type.startsWith("video/") && file.size > videoMaxBytes) {
      setError("Видео для истории не должно превышать 50 МБ");
      return;
    }

    if (storyPreviewUrl) {
      URL.revokeObjectURL(storyPreviewUrl);
    }

    setStoryFile(file);
    setStoryPreviewUrl(URL.createObjectURL(file));
    setError(null);
  };

  const resetStoryDraft = () => {
    setStoryCaption("");
    setStoryFile(null);
    if (storyPreviewUrl) {
      URL.revokeObjectURL(storyPreviewUrl);
      setStoryPreviewUrl(null);
    }
  };

  const createStory = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !storyFile) {
      setError("Добавьте фото или видео для истории");
      return;
    }

    setPublishingStory(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("media", storyFile);
      if (storyCaption.trim().length > 0) {
        formData.append("caption", storyCaption.trim());
      }

      await apiRequest("/news/stories", {
        method: "POST",
        token: session.accessToken,
        tenantSlug: session.tenantSlug,
        body: formData,
      });

      resetStoryDraft();
      setStoryDialogOpen(false);
      setNotice("История опубликована");
      await loadStories();
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError ? requestError.message : "Не удалось опубликовать историю"
      );
    } finally {
      setPublishingStory(false);
    }
  };

  const markStoryViewed = async (storyId: string) => {
    if (!session) return;

    setStories((current) =>
      current.map((group) => {
        const nextStories = group.stories.map((story) =>
          story.id === storyId ? { ...story, viewedByMe: true } : story
        );
        return {
          ...group,
          stories: nextStories,
          hasUnseen: nextStories.some((story) => !story.viewedByMe),
        };
      })
    );

    try {
      await apiRequest(`/news/stories/${storyId}/view`, {
        method: "POST",
        token: session.accessToken,
        tenantSlug: session.tenantSlug,
      });
    } catch (_error) {
      // non-critical
    }
  };

  const deleteStory = async (storyId: string) => {
    if (!session) return;
    setDeletingStoryId(storyId);
    setError(null);

    try {
      await apiRequest(`/news/stories/${storyId}`, {
        method: "DELETE",
        token: session.accessToken,
        tenantSlug: session.tenantSlug,
      });

      setStories((current) =>
        current
          .map((group) => ({
            ...group,
            stories: group.stories.filter((story) => story.id !== storyId),
          }))
          .filter((group) => group.stories.length > 0)
          .map((group) => ({
            ...group,
            hasUnseen: group.stories.some((story) => !story.viewedByMe),
          }))
      );
      setNotice("История удалена");
      setActiveStoryGroupIndex(null);
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError ? requestError.message : "Не удалось удалить историю"
      );
    } finally {
      setDeletingStoryId(null);
    }
  };

  if (!ready || !session) {
    return <div className="center-screen">Загрузка...</div>;
  }

  return (
    <PortalShell title="Новости" subtitle="Социальная лента вашего СНТ">
      {error ? <div className="error">{error}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}

      <section className="news-social-layout">
        <NewsStoryRail
          groups={stories}
          loading={loadingStories}
          currentUserId={session.user.id}
          onCreateStory={() => setStoryDialogOpen(true)}
          onOpenGroup={(groupIndex) => setActiveStoryGroupIndex(groupIndex)}
        />

        <NewsComposer submitting={publishingPost} onSubmit={createPost} />

        <section className="news-feed">
          {loadingFeed ? (
            <p className="muted">Загрузка ленты...</p>
          ) : feed.length === 0 ? (
            <p className="muted">Постов пока нет. Опубликуйте первый пост.</p>
          ) : (
            feed.map((post) => (
              <NewsPostCard
                key={post.id}
                post={post}
                token={token}
                tenantSlug={tenantSlug}
                currentUserId={session.user.id}
                togglingLike={togglingLikePostId === post.id}
                deletingPost={deletingPostId === post.id}
                onToggleLike={toggleLike}
                onDeletePost={deletePost}
                onCommentsCountChange={onCommentsCountChange}
              />
            ))
          )}

          {canLoadMore ? (
            <button
              type="button"
              className="secondary-button news-load-more"
              onClick={() => loadFeed(nextCursor ?? undefined)}
              disabled={loadingMore}
            >
              {loadingMore ? "Загрузка..." : "Показать еще"}
            </button>
          ) : null}
        </section>
      </section>

      {isClient && storyDialogOpen
        ? createPortal(
            <div className="news-dialog-overlay" role="dialog" aria-modal="true">
              <div className="news-story-create-dialog">
                <header>
                  <h3>Новая история</h3>
                  <button
                    type="button"
                    className="secondary-button small icon-button"
                    onClick={() => {
                      resetStoryDraft();
                      setStoryDialogOpen(false);
                    }}
                  >
                    <X size={16} />
                  </button>
                </header>

                <form className="news-story-create-form" onSubmit={createStory}>
                  <label className="secondary-button">
                    <input type="file" accept="image/*,video/*" onChange={pickStoryFile} />
                    <Plus size={16} />
                    Выбрать фото/видео
                  </label>

                  {storyPreviewUrl ? (
                    <div className="news-story-preview">
                      {storyFile?.type.startsWith("image/") ? (
                        <img src={storyPreviewUrl} alt="Предпросмотр истории" />
                      ) : (
                        <video src={storyPreviewUrl} controls playsInline />
                      )}
                    </div>
                  ) : null}

                  <textarea
                    value={storyCaption}
                    onChange={(event) => setStoryCaption(event.target.value)}
                    placeholder="Подпись к истории"
                    maxLength={240}
                  />

                  <button className="primary-button" type="submit" disabled={publishingStory || !storyFile}>
                    {publishingStory ? <Loader2 size={16} className="spin" /> : null}
                    Опубликовать историю
                  </button>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}

      {isClient
        ? createPortal(
            <NewsStoryViewer
              groups={stories}
              activeGroupIndex={activeStoryGroupIndex}
              currentUserId={session.user.id}
              deletingStoryId={deletingStoryId}
              onClose={() => setActiveStoryGroupIndex(null)}
              onDeleteStory={deleteStory}
              onMarkViewed={markStoryViewed}
            />,
            document.body
          )
        : null}
    </PortalShell>
  );
}
