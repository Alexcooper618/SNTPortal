import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/async-handler";

const router = Router();
router.use(requireAuth);
router.use(requireRole("CHAIRMAN"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const takeRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
    const take = Number.isFinite(takeRaw) ? Math.max(1, Math.min(200, takeRaw)) : 50;

    const items = await prisma.auditLog.findMany({
      where: {
        tenantId: req.user!.tenantId,
      },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take,
    });

    res.json({ items });
  })
);

export default router;
