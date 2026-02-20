"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { ImagePlus, Loader2, Video, X } from "lucide-react";

const MAX_FILES = 10;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

interface NewsComposerProps {
  submitting: boolean;
  onSubmit: (payload: { body: string; files: File[] }) => Promise<void>;
}

const isImage = (file: File) => file.type.startsWith("image/");
const isVideo = (file: File) => file.type.startsWith("video/");

export function NewsComposer({ submitting, onSubmit }: NewsComposerProps) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files]
  );

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

  const onFilesPicked = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (selected.length === 0) return;

    const next: File[] = [...files];
    for (const file of selected) {
      if (!isImage(file) && !isVideo(file)) {
        setError("Можно добавлять только фото или видео");
        return;
      }
      if (isImage(file) && file.size > IMAGE_MAX_BYTES) {
        setError(`Файл "${file.name}" больше 10 МБ`);
        return;
      }
      if (isVideo(file) && file.size > VIDEO_MAX_BYTES) {
        setError(`Файл "${file.name}" больше 50 МБ`);
        return;
      }
      next.push(file);
    }

    if (next.length > MAX_FILES) {
      setError("Максимум 10 медиа в одном посте");
      return;
    }

    setError(null);
    setFiles(next);
  };

  const removeFile = (index: number) => {
    setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    const cleanBody = body.trim();
    if (!cleanBody && files.length === 0) {
      setError("Добавьте текст или медиа");
      return;
    }

    setError(null);
    await onSubmit({ body: cleanBody, files });
    setBody("");
    setFiles([]);
  };

  return (
    <section className="news-composer">
      <form className="news-composer-form" onSubmit={submit}>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Поделитесь новостью с соседями..."
          maxLength={4000}
          disabled={submitting}
        />

        {files.length > 0 ? (
          <div className="news-composer-media-grid">
            {previews.map((preview, index) => (
              <div key={`${preview.file.name}-${index}`} className="news-composer-media-item">
                {isImage(preview.file) ? (
                  <img src={preview.url} alt={preview.file.name} />
                ) : (
                  <video src={preview.url} muted playsInline />
                )}
                <button
                  type="button"
                  className="news-media-remove"
                  onClick={() => removeFile(index)}
                  aria-label="Удалить медиа"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="news-composer-actions">
          <label className="secondary-button news-media-picker">
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={onFilesPicked}
              disabled={submitting}
            />
            <ImagePlus size={16} />
            Медиа
            <Video size={16} />
          </label>
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? <Loader2 size={16} className="spin" /> : null}
            Опубликовать
          </button>
        </div>
      </form>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
