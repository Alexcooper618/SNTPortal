import { Router } from "express";
import authRoutes from "./auth";
import usersRoutes from "./users";
import plotsRoutes from "./plots";
import billingRoutes from "./billing";
import paymentsRoutes from "./payments";
import newsRoutes from "./news";
import documentsRoutes from "./documents";
import forumRoutes from "./forum";
import chatRoutes from "./chat";
import mapRoutes from "./map";
import incidentsRoutes from "./incidents";
import meetingsRoutes from "./meetings";
import votesRoutes from "./votes";
import notificationsRoutes from "./notifications";
import auditRoutes from "./audit";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/plots", plotsRoutes);
router.use("/billing", billingRoutes);
router.use("/payments", paymentsRoutes);
router.use("/news", newsRoutes);
router.use("/documents", documentsRoutes);
router.use("/forum", forumRoutes);
router.use("/chat", chatRoutes);
router.use("/map", mapRoutes);
router.use("/incidents", incidentsRoutes);
router.use("/meetings", meetingsRoutes);
router.use("/votes", votesRoutes);
router.use("/notifications", notificationsRoutes);
router.use("/audit", auditRoutes);

export default router;
