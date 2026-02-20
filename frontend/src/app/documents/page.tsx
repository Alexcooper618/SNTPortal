"use client";

import { FormEvent, useEffect, useState } from "react";
import { PortalShell } from "@/components/portal-shell";
import { Panel } from "@/components/ui-kit";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

interface DocumentItem {
  id: number;
  title: string;
  category: string;
  fileType: string;
  fileUrl: string;
  visibility: "RESIDENTS" | "CHAIRMAN_ONLY";
}

interface DocumentsResponse {
  items: DocumentItem[];
}

export default function DocumentsPage() {
  const { ready, session } = useAuth(true);
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Отчеты");
  const [fileUrl, setFileUrl] = useState("https://example.com/file.pdf");
  const [fileType, setFileType] = useState("PDF");

  const load = async () => {
    if (!session) return;

    const response = await apiRequest<DocumentsResponse>("/documents", {
      token: session.accessToken,
      tenantSlug: session.tenantSlug,
    });
    setItems(response.items);
  };

  useEffect(() => {
    if (!ready || !session) return;
    load().catch(() => setItems([]));
  }, [ready, session]);

  const addDocument = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || session.user.role !== "CHAIRMAN") return;

    await apiRequest("/documents", {
      method: "POST",
      token: session.accessToken,
      tenantSlug: session.tenantSlug,
      body: {
        title,
        category,
        fileUrl,
        fileType,
        visibility: "RESIDENTS",
      },
    });

    setTitle("");
    await load();
  };

  if (!ready || !session) {
    return <div className="center-screen">Загрузка...</div>;
  }

  return (
    <PortalShell title="Документы" subtitle="Уставы, протоколы, отчеты и регламенты">
      <div className="grid-2">
        {session.user.role === "CHAIRMAN" ? (
          <Panel title="Добавить документ">
            <form className="inline-form" onSubmit={addDocument}>
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Название" />
              <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Категория" />
              <input value={fileUrl} onChange={(event) => setFileUrl(event.target.value)} placeholder="URL файла" />
              <input value={fileType} onChange={(event) => setFileType(event.target.value)} placeholder="Тип" />
              <button className="primary-button" type="submit">
                Сохранить
              </button>
            </form>
          </Panel>
        ) : null}

        <Panel title="Реестр документов">
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong> · {item.category} · {item.fileType} · {item.visibility}
                <br />
                <a href={item.fileUrl} rel="noreferrer">
                  {item.fileUrl}
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </PortalShell>
  );
}
