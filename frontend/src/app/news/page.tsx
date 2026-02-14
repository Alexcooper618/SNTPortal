"use client";

import { FormEvent, useEffect, useState } from "react";
import { PortalShell } from "@/components/portal-shell";
import { Panel } from "@/components/ui-kit";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

interface NewsPost {
  id: number;
  title: string;
  body: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  createdAt: string;
  publishedAt: string | null;
}

interface NewsResponse {
  items: NewsPost[];
}

export default function NewsPage() {
  const { ready, session } = useAuth(true);
  const [items, setItems] = useState<NewsPost[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    if (!session) return;

    try {
      const response = await apiRequest<NewsResponse>(
        `/news${session.user.role === "CHAIRMAN" ? "?includeDraft=true" : ""}`,
        {
          token: session.accessToken,
          tenantSlug: session.tenantSlug,
        }
      );
      setItems(response.items);
    } catch (_error) {
      setError("Не удалось загрузить новости");
    }
  };

  useEffect(() => {
    if (!ready || !session) return;
    load();
  }, [ready, session]);

  const createNews = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) return;

    setError(null);
    setNotice(null);

    try {
      await apiRequest<{ post: NewsPost }>("/news", {
        method: "POST",
        token: session.accessToken,
        tenantSlug: session.tenantSlug,
        body: {
          title,
          body,
        },
      });

      setTitle("");
      setBody("");
      setNotice("Черновик новости создан");
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError
          ? requestError.message
          : "Не удалось создать новость"
      );
    }
  };

  const publish = async (postId: number) => {
    if (!session) return;

    setError(null);
    setNotice(null);

    try {
      await apiRequest(`/news/${postId}/publish`, {
        method: "PATCH",
        token: session.accessToken,
        tenantSlug: session.tenantSlug,
      });
      setNotice("Новость опубликована");
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError ? requestError.message : "Не удалось опубликовать"
      );
    }
  };

  if (!ready || !session) {
    return <div className="center-screen">Загрузка...</div>;
  }

  return (
    <PortalShell title="Новости" subtitle="Публикации СНТ и объявления правления">
      {error ? <div className="error">{error}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}

      {session.user.role === "CHAIRMAN" ? (
        <Panel title="Новая публикация">
          <form className="inline-form" onSubmit={createNews}>
            <input
              placeholder="Заголовок"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <textarea
              placeholder="Текст новости"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            <button className="primary-button" type="submit">
              Сохранить черновик
            </button>
          </form>
        </Panel>
      ) : null}

      <Panel title="Лента новостей">
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong>
              {" · "}
              {item.status}
              {" · "}
              {new Date(item.createdAt).toLocaleDateString("ru-RU")}
              <br />
              {item.body}
              {session.user.role === "CHAIRMAN" && item.status === "DRAFT" ? (
                <>
                  <br />
                  <button className="secondary-button" onClick={() => publish(item.id)}>
                    Опубликовать
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>
    </PortalShell>
  );
}
