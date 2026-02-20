import { UserRole } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../config/env";
import { normalizePhone } from "./validators";
import { hashPassword } from "./password";
import { getTenantBySlug } from "./tenant";

export const ensurePlatformAdmin = async () => {
  const rawPhone = env.platformAdminPhone;
  const rawPassword = env.platformAdminPassword;
  if (!rawPhone || !rawPassword) {
    return null;
  }

  const tenant = await getTenantBySlug(env.defaultTenantSlug);
  const phone = normalizePhone(rawPhone);
  const passwordHash = await hashPassword(rawPassword);
  const name = (env.platformAdminName ?? "Администратор").trim() || "Администратор";

  const admin = await prisma.user.upsert({
    where: {
      tenantId_phone: {
        tenantId: tenant.id,
        phone,
      },
    },
    create: {
      tenantId: tenant.id,
      phone,
      name,
      role: UserRole.ADMIN,
      isActive: true,
      passwordHash,
      mustChangePassword: false,
      passwordUpdatedAt: new Date(),
    },
    update: {
      name,
      role: UserRole.ADMIN,
      isActive: true,
      passwordHash,
      mustChangePassword: false,
      passwordUpdatedAt: new Date(),
    },
  });

  return admin;
};

