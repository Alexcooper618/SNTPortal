import { Router } from "express";
import { prisma } from "../db";
import { asyncHandler } from "../middlewares/async-handler";
import { requireAuth } from "../middlewares/auth";
import { customError } from "../lib/errors";

const router = Router();

router.use(requireAuth);

type CachedWeather = {
  fetchedAt: string;
  expiresAtMs: number;
  payload: {
    tenant: {
      id: number;
      slug: string;
      name: string;
      address?: string | null;
      location?: string | null;
      timeZone?: string | null;
    };
    weather: {
      temperatureC: number;
      weatherCode: number | null;
      fetchedAt: string;
    };
  };
};

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<number, CachedWeather>();

const buildOpenMeteoUrl = (latitude: number, longitude: number, timeZone: string) => {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,weather_code",
    timezone: timeZone,
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
};

router.get(
  "/current",
  asyncHandler(async (req, res) => {
    const tenantId = req.user!.tenantId;

    const cached = cache.get(tenantId);
    const now = Date.now();
    if (cached && cached.expiresAtMs > now) {
      res.json(cached.payload);
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        slug: true,
        name: true,
        address: true,
        location: true,
        latitude: true,
        longitude: true,
        timeZone: true,
      },
    });

    if (!tenant) {
      throw customError(404, "TENANT_NOT_FOUND", "Tenant not found");
    }

    if (typeof tenant.latitude !== "number" || typeof tenant.longitude !== "number") {
      throw customError(404, "TENANT_LOCATION_NOT_CONFIGURED", "Tenant coordinates are not configured");
    }

    const timeZone = tenant.timeZone ?? "auto";

    try {
      const response = await fetch(buildOpenMeteoUrl(tenant.latitude, tenant.longitude, timeZone), {
        headers: {
          "User-Agent": "snt-portal/1.0",
        },
      });

      if (!response.ok) {
        throw new Error(`Open-Meteo HTTP ${response.status}`);
      }

      const data = (await response.json()) as any;
      const temperatureC = Number(data?.current?.temperature_2m);
      const weatherCodeRaw = data?.current?.weather_code;
      const weatherCode = typeof weatherCodeRaw === "number" ? weatherCodeRaw : null;

      if (!Number.isFinite(temperatureC)) {
        throw new Error("Open-Meteo payload missing current.temperature_2m");
      }

      const resolvedTimeZone =
        typeof data?.timezone === "string" && data.timezone.trim().length > 0 ? data.timezone.trim() : tenant.timeZone;

      const payload = {
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          address: tenant.address,
          location: tenant.location,
          timeZone: resolvedTimeZone ?? null,
        },
        weather: {
          temperatureC,
          weatherCode,
          fetchedAt: new Date().toISOString(),
        },
      };

      cache.set(tenantId, {
        fetchedAt: payload.weather.fetchedAt,
        expiresAtMs: now + TTL_MS,
        payload,
      });

      res.json(payload);
    } catch (_error) {
      // Fallback to last cached value if any (even if close to expiry), otherwise fail.
      const fallback = cache.get(tenantId);
      if (fallback && fallback.expiresAtMs > now) {
        res.json(fallback.payload);
        return;
      }

      throw customError(502, "WEATHER_PROVIDER_ERROR", "Weather provider is unavailable");
    }
  })
);

export default router;

