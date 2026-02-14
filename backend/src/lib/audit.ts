import { prisma } from "../db";

interface AuditParams {
  tenantId: number;
  actorId?: number;
  action: string;
  entityType: string;
  entityId?: string;
  requestId?: string;
  metadata?: unknown;
}

export const logAudit = async ({
  tenantId,
  actorId,
  action,
  entityType,
  entityId,
  requestId,
  metadata,
}: AuditParams) => {
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId,
      action,
      entityType,
      entityId,
      requestId,
      metadata: metadata as any,
    },
  });
};
