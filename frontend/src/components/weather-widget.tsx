import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  type LucideIcon,
} from "lucide-react";

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

const resolveWeatherVisual = (weatherCode: number | null): { icon: LucideIcon; label: string } => {
  if (weatherCode === 0) return { icon: Sun, label: "Ясно" };
  if (weatherCode !== null && weatherCode >= 1 && weatherCode <= 3) {
    return { icon: CloudSun, label: "Переменная облачность" };
  }
  if (weatherCode === 45 || weatherCode === 48) return { icon: CloudFog, label: "Туман" };
  if (
    weatherCode !== null &&
    ((weatherCode >= 51 && weatherCode <= 57) ||
      (weatherCode >= 61 && weatherCode <= 67) ||
      (weatherCode >= 80 && weatherCode <= 82))
  ) {
    return { icon: CloudRain, label: "Дождь" };
  }
  if (
    weatherCode !== null &&
    ((weatherCode >= 71 && weatherCode <= 77) || weatherCode === 85 || weatherCode === 86)
  ) {
    return { icon: CloudSnow, label: "Снег" };
  }
  if (weatherCode !== null && weatherCode >= 95 && weatherCode <= 99) {
    return { icon: CloudLightning, label: "Гроза" };
  }
  return { icon: Cloud, label: "Погода" };
};

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

  const { icon: WeatherIcon, label } = resolveWeatherVisual(weather.weather.weatherCode);
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
