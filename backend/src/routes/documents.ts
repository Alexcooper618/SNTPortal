import { Router } from "express";
import { DocumentVisibility } from "@prisma/client";
import { prisma } from "../db";
import { logAudit } from "../lib/audit";
import { badRequest, notFound } from "../lib/errors";
import { assertString } from "../lib/validators";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/async-handler";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const isChairman = req.user!.role === "CHAIRMAN";

    const items = await prisma.document.findMany({
      where: {
        tenantId: req.user!.tenantId,
        ...(isChairman
          ? {}
          : {
              visibility: DocumentVisibility.RESIDENTS,
            }),
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({ items });
  })
);

router.post(
  "/",
  requireRole("CHAIRMAN"),
  asyncHandler(async (req, res) => {
    const title = assertString(req.body.title, "title");
    const category = assertString(req.body.category, "category");
    const fileUrl = assertString(req.body.fileUrl, "fileUrl");
    const fileType = assertString(req.body.fileType ?? "PDF", "fileType");

    const visibilityRaw =
      typeof req.body.visibility === "string" ? req.body.visibility.toUpperCase() : "RESIDENTS";
    const visibility =
      visibilityRaw === "CHAIRMAN_ONLY"
        ? DocumentVisibility.CHAIRMAN_ONLY
        : DocumentVisibility.RESIDENTS;

    const document = await prisma.document.create({
      data: {
        tenantId: req.user!.tenantId,
        uploadedById: req.user!.userId,
        title,
        category,
        fileUrl,
        fileType,
        visibility,
      },
    });

    await logAudit({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      action: "DOCUMENT_CREATED",
      entityType: "Document",
      entityId: String(document.id),
      requestId: req.requestId,
    });

    res.status(201).json({ document });
  })
);

router.post(
  "/:documentId/view",
  asyncHandler(async (req, res) => {
    const documentId = Number(req.params.documentId);
    if (!Number.isFinite(documentId)) {
      throw badRequest("documentId must be a number");
    }

    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        tenantId: req.user!.tenantId,
      },
    });

    if (!document) {
      throw notFound("Document not found");
    }

    if (
      document.visibility === DocumentVisibility.CHAIRMAN_ONLY &&
      req.user!.role !== "CHAIRMAN"
    ) {
      throw badRequest("Document unavailable for current role");
    }

    await prisma.documentAccess.upsert({
      where: {
        documentId_userId: {
          documentId,
          userId: req.user!.userId,
        },
      },
      update: {
        viewedAt: new Date(),
      },
      create: {
        tenantId: req.user!.tenantId,
        documentId,
        userId: req.user!.userId,
      },
    });

    res.json({ ok: true });
  })
);

export default router;
