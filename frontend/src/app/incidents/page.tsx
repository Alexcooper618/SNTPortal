"use client";

import { FormEvent, useEffect, useState } from "react";
import { PortalShell } from "@/components/portal-shell";
import { Panel } from "@/components/ui-kit";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

interface Incident {
  id: string;
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";
  openedAt: string;
}

interface IncidentsResponse {
  items: Incident[];
}

export default function IncidentsPage() {
  const { ready, session } = useAuth(true);
  const [items, setItems] = useState<Incident[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Incident["priority"]>("MEDIUM");

  const load = async () => {
    if (!session) return;

    const response = await apiRequest<IncidentsResponse>("/incidents", {
      token: session.accessToken,
      tenantSlug: session.tenantSlug,
    });
    setItems(response.items);
  };

  useEffect(() => {
    if (!ready || !session) return;
    load().catch(() => setItems([]));
  }, [ready, session]);

  const createIncident = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) return;

    await apiRequest("/incidents", {
      method: "POST",
      token: session.accessToken,
      tenantSlug: session.tenantSlug,
      body: {
        title,
        description,
        priority,
      },
    });

    setTitle("");
    setDescription("");
    setPriority("MEDIUM");
    await load();
  };

  const updateStatus = async (incidentId: string, status: Incident["status"]) => {
    if (!session || session.user.role !== "CHAIRMAN") return;

    await apiRequest(`/incidents/${incidentId}/status`, {
      method: "PATCH",
      token: session.accessToken,
      tenantSlug: session.tenantSlug,
      body: {
        status,
      },
    });

    await load();
  };

  if (!ready || !session) {
    return <div className="center-screen">Загрузка...</div>;
  }

  return (
    <PortalShell title="Обращения" subtitle="Заявки жителей и SLA-обработка">
      <div className="grid-2">
        <Panel title="Новое обращение">
          <form className="inline-form" onSubmit={createIncident}>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Тема" />
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Описание"
            />
            <select value={priority} onChange={(event) => setPriority(event.target.value as Incident["priority"])}>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
            <button className="primary-button" type="submit">
              Создать
            </button>
          </form>
        </Panel>

        <Panel title="Список обращений">
          <ul>
            {items.map((incident) => (
              <li key={incident.id}>
                <strong>{incident.title}</strong> · {incident.status} · {incident.priority}
                <br />
                {incident.description}
                {session.user.role === "CHAIRMAN" ? (
                  <>
                    <br />
                    <button className="secondary-button" onClick={() => updateStatus(incident.id, "IN_PROGRESS")}>В работу</button>
                    {" "}
                    <button className="secondary-button" onClick={() => updateStatus(incident.id, "RESOLVED")}>Закрыть</button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </PortalShell>
  );
}
