import { getTimeZoneHour, resolveWeatherVisual } from "@/lib/weather-ui";

export interface WeatherWidgetData {
  tenant: {
    slug: string;
    name?: string | null;
    address?: string | null;
    location?: string | null;
    timeZone?: string | null;
  };
  weather: {
    temperatureC: number;
    weatherCode: number | null;
    fetchedAt: string;
  };
}

interface WeatherWidgetProps {
  loading: boolean;
  weather: WeatherWidgetData | null;
  weatherError: string | null;
  locationConfigured: boolean;
  tenantFallbackSlug: string;
}

export const WeatherWidget = ({
  loading,
  weather,
  weatherError,
  locationConfigured,
  tenantFallbackSlug,
}: WeatherWidgetProps) => {
  if (loading) {
    return (
      <section className="weather-widget" aria-busy="true" aria-live="polite">
        <p className="weather-widget-title">Погода</p>
        <p className="weather-widget-temp">...</p>
        <p className="weather-widget-meta">Загрузка...</p>
      </section>
    );
  }

  if (!locationConfigured) {
    return (
      <section className="weather-widget" aria-live="polite">
        <p className="weather-widget-title">Погода</p>
        <p className="weather-widget-temp">Не настроено</p>
        <p className="weather-widget-meta">Координаты СНТ не указаны</p>
      </section>
    );
  }

  if (weatherError || !weather) {
    return (
      <section className="weather-widget" aria-live="polite">
        <p className="weather-widget-title">Погода</p>
        <p className="weather-widget-temp">Недоступно</p>
        <p className="weather-widget-meta">{weatherError ?? "Погода временно недоступна"}</p>
      </section>
    );
  }

  const localHour = getTimeZoneHour(weather.tenant.timeZone);
  const { icon: WeatherIcon, label } = resolveWeatherVisual(weather.weather.weatherCode, localHour);
  const temp = Math.round(weather.weather.temperatureC);
  const fallbackSlug = tenantFallbackSlug.trim();
  const tenantNameRaw = (
    weather.tenant.name?.trim() ||
    weather.tenant.slug?.trim() ||
    fallbackSlug
  ).trim();
  const tenantName = tenantNameRaw
    ? /^(снт|snt)\b/i.test(tenantNameRaw)
      ? tenantNameRaw
      : `СНТ ${tenantNameRaw}`
    : "";
  const geo = weather.tenant.location?.trim() || weather.tenant.address?.trim() || "";
  const place = tenantName && geo ? `${tenantName}, ${geo}` : tenantName || geo || fallbackSlug;

  return (
    <section className="weather-widget" aria-live="polite">
      <div className="weather-widget-top">
        <p className="weather-widget-title">Погода</p>
        <span className="weather-widget-badge">
          <WeatherIcon size={14} />
          {label}
        </span>
      </div>
      <p className="weather-widget-temp">{`${temp > 0 ? "+" : ""}${temp}°`}</p>
      <p className="weather-widget-meta">{place}</p>
    </section>
  );
};
