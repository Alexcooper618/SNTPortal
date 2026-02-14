import { Router } from "express";
import { MapObjectType } from "@prisma/client";
import { prisma } from "../db";
import { badRequest } from "../lib/errors";
import { assertNumber, assertString } from "../lib/validators";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/async-handler";

const router = Router();
router.use(requireAuth);

router.get(
  "/layers",
  asyncHandler(async (req, res) => {
    const items = await prisma.mapLayer.findMany({
      where: {
        tenantId: req.user!.tenantId,
      },
      include: {
        objects: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    res.json({ items });
  })
);

router.post(
  "/layers",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const name = assertString(req.body.name, "name");
    const layer = await prisma.mapLayer.create({
      data: {
        tenantId: req.user!.tenantId,
        name,
        isVisible: req.body.isVisible !== false,
      },
    });

    res.status(201).json({ layer });
  })
);

router.get(
  "/objects",
  asyncHandler(async (req, res) => {
    const typeRaw = typeof req.query.type === "string" ? req.query.type.toUpperCase() : undefined;

    const items = await prisma.mapObject.findMany({
      where: {
        tenantId: req.user!.tenantId,
        ...(typeRaw ? { type: typeRaw as MapObjectType } : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({ items });
  })
);

router.post(
  "/objects",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const layerId = Math.round(assertNumber(req.body.layerId, "layerId"));
    const title = assertString(req.body.title, "title");

    const typeRaw = typeof req.body.type === "string" ? req.body.type.toUpperCase() : "OTHER";
    const supported = ["PLOT", "ROAD", "GATE", "WELL", "LIGHT", "FACILITY", "OTHER"];
    if (!supported.includes(typeRaw)) {
      throw badRequest("Invalid map object type");
    }

    const object = await prisma.mapObject.create({
      data: {
        tenantId: req.user!.tenantId,
        layerId,
        type: typeRaw as MapObjectType,
        title,
        description: typeof req.body.description === "string" ? req.body.description : undefined,
        lat: req.body.lat === undefined ? undefined : Number(req.body.lat),
        lng: req.body.lng === undefined ? undefined : Number(req.body.lng),
        plotId: req.body.plotId === undefined ? undefined : Number(req.body.plotId),
        geoJson: req.body.geoJson ?? undefined,
      },
    });

    res.status(201).json({ object });
  })
);

export default router;
