import { Request } from "express";

export const getPagination = (req: Request) => {
  const limitRaw = req.query.limit;
  const offsetRaw = req.query.offset;

  const limit = typeof limitRaw === "string" ? Number(limitRaw) : 20;
  const offset = typeof offsetRaw === "string" ? Number(offsetRaw) : 0;

  return {
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20,
    offset: Number.isFinite(offset) && offset >= 0 ? offset : 0,
  };
};
