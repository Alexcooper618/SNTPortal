import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  MoonStar,
  Sun,
  Sunrise,
  type LucideIcon,
} from "lucide-react";

export interface WeatherVisual {
  icon: LucideIcon;
  label: string;
}

export const getTimeZoneHour = (timeZone?: string | null): number => {
  if (timeZone && timeZone.trim().length > 0) {
    try {
      const formatter = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        hour12: false,
        timeZone: timeZone.trim(),
      });
      const hourPart = formatter.formatToParts(new Date()).find((part) => part.type === "hour")?.value;
      const parsed = Number(hourPart);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    } catch (_error) {
      // fall through to browser local timezone
    }
  }

  return new Date().getHours();
};

export const isNightHour = (hour: number): boolean => hour >= 23 || hour < 5;

const isMorningHour = (hour: number): boolean => hour >= 5 && hour < 12;

export const resolveGreetingText = (hour: number): string => {
  if (isMorningHour(hour)) return "Доброе утро";
  if (isNightHour(hour)) return "Доброй ночи";
  return "Добрый день";
};

export const resolveWeatherVisual = (weatherCode: number | null, hour: number): WeatherVisual => {
  if (weatherCode === 0) return { icon: isNightHour(hour) ? MoonStar : Sun, label: "Ясно" };

  if (weatherCode !== null && weatherCode >= 1 && weatherCode <= 3) {
    return { icon: CloudSun, label: "Переменная облачность" };
  }

  if (weatherCode === 45 || weatherCode === 48) {
    return { icon: CloudFog, label: "Туман" };
  }

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

export const resolveGreetingIcon = (weatherCode: number | null, hour: number): LucideIcon => {
  if (weatherCode !== null) {
    return resolveWeatherVisual(weatherCode, hour).icon;
  }
  if (isMorningHour(hour)) return Sunrise;
  if (isNightHour(hour)) return MoonStar;
  return Sun;
};
