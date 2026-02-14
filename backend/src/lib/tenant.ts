import { Request } from "express";
import { prisma } from "../db";
import { env } from "../config/env";
import { notFound } from "./errors";

const CORE_CHAT_ROOMS = [
  { name: "Общий чат", isPrivate: false },
  { name: "Вопрос председателю", isPrivate: false },
] as const;

export const resolveTenantSlug = (req: Request): string => {
  const fromHeader = req.headers["x-tenant-slug"];
  if (typeof fromHeader === "string" && fromHeader.trim().length > 0) {
    return fromHeader.trim().toLowerCase();
  }

  const fromBody = req.body && typeof req.body.tenantSlug === "string" ? req.body.tenantSlug : null;
  if (fromBody && fromBody.trim().length > 0) {
    return fromBody.trim().toLowerCase();
  }

  return env.defaultTenantSlug;
};

export const getTenantBySlug = async (slug: string) => {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    throw notFound(`Tenant '${slug}' not found`);
  }
  return tenant;
};

export const ensureDefaultTenant = async () => {
  const tenant = await prisma.tenant.upsert({
    where: { slug: env.defaultTenantSlug },
    create: {
      name: "СНТ Рассвет",
      slug: env.defaultTenantSlug,
      location: "Россия",
    },
    update: {},
  });

  await prisma.chatRoom.createMany({
    data: CORE_CHAT_ROOMS.map((room) => ({
      tenantId: tenant.id,
      ...room,
    })),
    skipDuplicates: true,
  });

  return tenant;
};

export const ensureCoreChatRooms = async () => {
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      status: true,
    },
  });

  const data = tenants
    .filter((tenant) => tenant.status === "ACTIVE")
    .flatMap((tenant) =>
      CORE_CHAT_ROOMS.map((room) => ({
        tenantId: tenant.id,
        ...room,
      }))
    );

  if (data.length === 0) return;

  await prisma.chatRoom.createMany({
    data,
    skipDuplicates: true,
  });
};
