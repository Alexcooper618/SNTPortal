"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { NewsAttachment } from "./types";

interface NewsMediaLightboxProps {
  items: NewsAttachment[];
  initialIndex: number;
  onClose: () => void;
}

const clampIndex = (value: number, length: number) => {
  if (length <= 0) return 0;
  if (value < 0) return 0;
  if (value >= length) return length - 1;
  return value;
};

export function NewsMediaLightbox({ items, initialIndex, onClose }: NewsMediaLightboxProps) {
  const itemsCount = items.length;
  const [isMounted, setIsMounted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => clampIndex(initialIndex, itemsCount));

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setActiveIndex(clampIndex(initialIndex, itemsCount));
  }, [initialIndex, itemsCount]);

  const hasMultiple = itemsCount > 1;

  const goPrev = useCallback(() => {
    if (!hasMultiple) return;
    setActiveIndex((current) => (current - 1 + itemsCount) % itemsCount);
  }, [hasMultiple, itemsCount]);

  const goNext = useCallback(() => {
    if (!hasMultiple) return;
    setActiveIndex((current) => (current + 1) % itemsCount);
  }, [hasMultiple, itemsCount]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (!hasMultiple) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [goNext, goPrev, hasMultiple, onClose]);

  const activeItem = items[activeIndex] ?? null;

  if (!isMounted || !activeItem) {
    return null;
  }

  return createPortal(
    <div className="news-media-lightbox-overlay" onClick={onClose}>
      <div
        className="news-media-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label="Просмотр медиа"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="news-media-lightbox-close"
          onClick={onClose}
          aria-label="Закрыть просмотр"
          title="Закрыть"
        >
          <X size={18} />
        </button>

        <div className="news-media-lightbox-stage">
          {hasMultiple ? (
            <button
              type="button"
              className="news-media-lightbox-nav prev"
              onClick={goPrev}
              aria-label="Предыдущее медиа"
            >
              <ChevronLeft size={22} />
            </button>
          ) : null}

          {activeItem.mediaType === "IMAGE" ? (
            <img
              className="news-media-lightbox-media"
              src={activeItem.fileUrl}
              alt={activeItem.fileName || `Медиа ${activeIndex + 1}`}
            />
          ) : (
            <video
              className="news-media-lightbox-media"
              src={activeItem.fileUrl}
              controls
              playsInline
              autoPlay
              preload="metadata"
            />
          )}

          {hasMultiple ? (
            <button
              type="button"
              className="news-media-lightbox-nav next"
              onClick={goNext}
              aria-label="Следующее медиа"
            >
              <ChevronRight size={22} />
            </button>
          ) : null}
        </div>

        {hasMultiple ? (
          <p className="news-media-lightbox-counter">
            {activeIndex + 1} / {itemsCount}
          </p>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
