"use client";

import { Play, Plus } from "lucide-react";
import { NewsStoryGroup } from "./types";

interface NewsStoryRailProps {
  groups: NewsStoryGroup[];
  loading: boolean;
  currentUserId: number;
  onCreateStory: () => void;
  onOpenGroup: (groupIndex: number) => void;
}

export function NewsStoryRail({
  groups,
  loading,
  currentUserId,
  onCreateStory,
  onOpenGroup,
}: NewsStoryRailProps) {
  return (
    <section className="news-stories-rail">
      <button type="button" className="news-story-chip news-story-create" onClick={onCreateStory}>
        <span className="news-story-avatar news-story-avatar-create">
          <Plus size={18} />
        </span>
        <span className="news-story-name">Ваша история</span>
      </button>

      {loading ? (
        <p className="muted">Загрузка историй...</p>
      ) : groups.length === 0 ? (
        <p className="muted">Историй пока нет.</p>
      ) : (
        groups.map((group, index) => {
          const firstStory = group.stories[0];
          const isMine = group.author.id === currentUserId;
          return (
            <button
              type="button"
              key={group.author.id}
              className={group.hasUnseen ? "news-story-chip unseen" : "news-story-chip seen"}
              onClick={() => onOpenGroup(index)}
            >
              <span className="news-story-avatar">
                {firstStory.mediaType === "IMAGE" ? (
                  <img src={firstStory.fileUrl} alt={group.author.name} />
                ) : (
                  <span className="news-story-video-badge">
                    <Play size={14} />
                  </span>
                )}
              </span>
              <span className="news-story-name">{isMine ? "Вы" : group.author.name}</span>
            </button>
          );
        })
      )}
    </section>
  );
}
