"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { NewsStoryGroup } from "./types";

interface NewsStoryViewerProps {
  groups: NewsStoryGroup[];
  activeGroupIndex: number | null;
  currentUserId: number;
  deletingStoryId?: string | null;
  onClose: () => void;
  onDeleteStory?: (storyId: string) => void;
  onMarkViewed: (storyId: string) => void;
}

export function NewsStoryViewer({
  groups,
  activeGroupIndex,
  currentUserId,
  deletingStoryId,
  onClose,
  onDeleteStory,
  onMarkViewed,
}: NewsStoryViewerProps) {
  const [groupIndex, setGroupIndex] = useState<number>(0);
  const [storyIndex, setStoryIndex] = useState<number>(0);

  useEffect(() => {
    if (activeGroupIndex === null) return;
    setGroupIndex(activeGroupIndex);
    setStoryIndex(0);
  }, [activeGroupIndex]);

  const activeGroup = useMemo(() => {
    if (activeGroupIndex === null) return null;
    return groups[groupIndex] ?? null;
  }, [activeGroupIndex, groupIndex, groups]);

  const activeStory = activeGroup?.stories[storyIndex] ?? null;

  useEffect(() => {
    if (!activeStory) return;
    onMarkViewed(activeStory.id);
  }, [activeStory, onMarkViewed]);

  if (activeGroupIndex === null || !activeGroup || !activeStory) {
    return null;
  }

  const hasPrevStory = storyIndex > 0;
  const hasNextStory = storyIndex < activeGroup.stories.length - 1;
  const hasPrevGroup = groupIndex > 0;
  const hasNextGroup = groupIndex < groups.length - 1;
  const isMine = activeGroup.author.id === currentUserId;

  const goPrev = () => {
    if (hasPrevStory) {
      setStoryIndex((current) => current - 1);
      return;
    }

    if (hasPrevGroup) {
      const prevGroupIndex = groupIndex - 1;
      const prevGroup = groups[prevGroupIndex];
      setGroupIndex(prevGroupIndex);
      setStoryIndex(Math.max(0, prevGroup.stories.length - 1));
    }
  };

  const goNext = () => {
    if (hasNextStory) {
      setStoryIndex((current) => current + 1);
      return;
    }

    if (hasNextGroup) {
      setGroupIndex((current) => current + 1);
      setStoryIndex(0);
      return;
    }

    onClose();
  };

  return (
    <div className="news-story-viewer-overlay" role="dialog" aria-modal="true">
      <div className="news-story-viewer">
        <div className="news-story-progress">
          {activeGroup.stories.map((story, index) => (
            <span
              key={story.id}
              className={
                index < storyIndex
                  ? "news-story-progress-item done"
                  : index === storyIndex
                  ? "news-story-progress-item active"
                  : "news-story-progress-item"
              }
            />
          ))}
        </div>

        <header className="news-story-viewer-head">
          <div>
            <p className="news-story-viewer-author">{activeGroup.author.name}</p>
            <p className="news-story-viewer-meta">
              {new Date(activeStory.createdAt).toLocaleString("ru-RU")}
            </p>
          </div>
          <div className="news-story-viewer-head-actions">
            {isMine && onDeleteStory ? (
              <button
                type="button"
                className="secondary-button small icon-button"
                onClick={() => onDeleteStory(activeStory.id)}
                disabled={deletingStoryId === activeStory.id}
                aria-label="Удалить историю"
                title="Удалить историю"
              >
                <Trash2 size={16} />
              </button>
            ) : null}
            <button
              type="button"
              className="secondary-button small icon-button"
              onClick={onClose}
              aria-label="Закрыть истории"
              title="Закрыть"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="news-story-viewer-media">
          {activeStory.mediaType === "IMAGE" ? (
            <img src={activeStory.fileUrl} alt={activeGroup.author.name} />
          ) : (
            <video src={activeStory.fileUrl} controls autoPlay playsInline />
          )}
        </div>

        {activeStory.caption ? (
          <p className="news-story-viewer-caption">{activeStory.caption}</p>
        ) : null}

        <button
          type="button"
          className="news-story-nav prev"
          onClick={goPrev}
          disabled={!hasPrevStory && !hasPrevGroup}
          aria-label="Предыдущая история"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          className="news-story-nav next"
          onClick={goNext}
          aria-label="Следующая история"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
