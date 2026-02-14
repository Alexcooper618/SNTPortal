"use client";

import { FormEvent, useEffect, useState } from "react";
import { PortalShell } from "@/components/portal-shell";
import { Panel } from "@/components/ui-kit";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

interface MapLayer {
  id: number;
  name: string;
  isVisible: boolean;
  objects: Array<{ id: number; title: string; type: string; lat: number | null; lng: number | null }>;
}

interface LayersResponse {
  items: MapLayer[];
}

export default function MapPage() {
  const { ready, session } = useAuth(true);
  const [layers, setLayers] = useState<MapLayer[]>([]);
  const [layerName, setLayerName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!session) return;
    const response = await apiRequest<LayersResponse>("/map/layers", {
      token: session.accessToken,
      tenantSlug: session.tenantSlug,
    });
    setLayers(response.items);
  };

  useEffect(() => {
    if (!ready || !session) return;
    load().catch(() => setError("Не удалось загрузить карту"));
  }, [ready, session]);

  const createLayer = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || session.user.role !== "CHAIRMAN") return;

    await apiRequest("/map/layers", {
      method: "POST",
      token: session.accessToken,
      tenantSlug: session.tenantSlug,
      body: {
        name: layerName,
      },
    });

    setLayerName("");
    await load();
  };

  if (!ready || !session) {
    return <div className="center-screen">Загрузка...</div>;
  }

  return (
    <PortalShell title="Карта поселка" subtitle="Слои, участки и инфраструктурные объекты">
      {error ? <div className="error">{error}</div> : null}

      <div className="grid-2">
        <Panel title="Слои карты">
          {session.user.role === "CHAIRMAN" ? (
            <form className="inline-form" onSubmit={createLayer}>
              <input
                placeholder="Название нового слоя"
                value={layerName}
                onChange={(event) => setLayerName(event.target.value)}
              />
              <button className="secondary-button" type="submit">
                Добавить слой
              </button>
            </form>
          ) : null}

          <ul>
            {layers.map((layer) => (
              <li key={layer.id}>
                {layer.name} ({layer.objects.length} объектов)
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Интерактивная область (MVP)">
          <p>
            На текущем этапе карта подключена как GIS-API-контур. В production сюда
            подключается real map renderer (Leaflet/MapLibre) со слоями из `/api/v1/map/*`.
          </p>

          <ul>
            {layers.flatMap((layer) =>
              layer.objects.map((object) => (
                <li key={object.id}>
                  [{layer.name}] {object.type} · {object.title}
                  {object.lat !== null && object.lng !== null
                    ? ` · ${object.lat}, ${object.lng}`
                    : ""}
                </li>
              ))
            )}
          </ul>
        </Panel>
      </div>
    </PortalShell>
  );
}
