import express, { Request, Response } from "express";
import cors from "cors";
import apiRoutes from "./routes";
import authRoutes from "./routes/auth";
import { env } from "./config/env";
import { requestContext } from "./middlewares/request-context";
import { createRateLimit } from "./middlewares/rate-limit";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler";

export const app = express();

const parseCorsOrigins = (raw: string | undefined) => {
  const value = (raw ?? "").trim();
  if (!value || value === "*") return true;
  const list = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length > 0 ? list : true;
};

app.use(
  cors({
    origin: parseCorsOrigins(env.corsOrigin),
    credentials: true,
  })
);
app.use(express.json());
app.use(requestContext);
app.use(createRateLimit(120, 60_000));

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "v1",
  });
});

// Backward-compatible auth mount.
app.use("/auth", authRoutes);
app.use("/api/v1", apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
