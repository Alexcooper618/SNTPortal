import { NextFunction, Request, Response } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export const createRateLimit = (maxRequests: number, windowMs: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip ?? "unknown";
    const tenant = typeof req.headers["x-tenant-slug"] === "string" ? req.headers["x-tenant-slug"] : "default";
    const route = `${req.method}:${req.path}`;
    const key = `${ip}:${tenant}:${route}`;
    const now = Date.now();

    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      res.status(429).json({
        code: "RATE_LIMITED",
        message: "Too many requests",
        details: {
          retryAfterMs: bucket.resetAt - now,
        },
        requestId: req.requestId,
      });
      return;
    }

    next();
  };
};
