import { OtpPurpose, User, UserRole } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../config/env";
import { badRequest, customError, notFound, unauthorized } from "../lib/errors";
import { signAccessToken } from "../lib/jwt";
import {
  generateOtpCode,
  hashValue,
  nowPlusDays,
  nowPlusMinutes,
  randomToken,
} from "../lib/security";
import { hashPassword, verifyPassword } from "../lib/password";

interface AuthSessionResult {
  user: User;
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
}

const createSessionForUser = async (user: User): Promise<AuthSessionResult> => {
  const authenticatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
    },
  });

  const refreshToken = randomToken();
  const refreshTokenHash = hashValue(refreshToken);

  const session = await prisma.userSession.create({
    data: {
      tenantId: authenticatedUser.tenantId,
      userId: authenticatedUser.id,
      refreshTokenHash,
      expiresAt: nowPlusDays(env.refreshTokenTtlDays),
    },
  });

  const accessToken = signAccessToken({
    userId: authenticatedUser.id,
    tenantId: authenticatedUser.tenantId,
    role: authenticatedUser.role,
    sessionId: session.id,
  });

  return {
    user: authenticatedUser,
    accessToken,
    refreshToken,
    mustChangePassword: authenticatedUser.mustChangePassword,
  };
};

interface RequestOtpInput {
  tenantId: number;
  phone: string;
  purpose: OtpPurpose;
}

export const requestOtpCode = async ({ tenantId, phone, purpose }: RequestOtpInput) => {
  const user = await prisma.user.findUnique({
    where: {
      tenantId_phone: {
        tenantId,
        phone,
      },
    },
  });

  if (!user || !user.isActive) {
    throw customError(404, "USER_NOT_REGISTERED", "User is not registered in this SNT");
  }

  const code = generateOtpCode();
  const codeHash = hashValue(code);

  await prisma.otpCode.create({
    data: {
      tenantId,
      userId: user.id,
      phone,
      purpose,
      codeHash,
      expiresAt: nowPlusMinutes(env.otpTtlMinutes),
    },
  });

  return {
    expiresInSeconds: env.otpTtlMinutes * 60,
    debugCode: env.nodeEnv === "production" ? undefined : code,
  };
};

interface VerifyOtpInput {
  tenantId: number;
  phone: string;
  code: string;
}

export const verifyOtpAndCreateSession = async ({ tenantId, phone, code }: VerifyOtpInput) => {
  const otp = await prisma.otpCode.findFirst({
    where: {
      tenantId,
      phone,
      consumedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!otp) {
    throw notFound("OTP code not requested");
  }

  if (otp.expiresAt < new Date()) {
    throw unauthorized("OTP code expired");
  }

  if (otp.attempts >= env.otpMaxAttempts) {
    throw unauthorized("OTP attempts exceeded");
  }

  const codeHash = hashValue(code);
  if (codeHash !== otp.codeHash) {
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: {
        attempts: {
          increment: 1,
        },
      },
    });
    throw unauthorized("OTP code is invalid");
  }

  await prisma.otpCode.update({
    where: { id: otp.id },
    data: {
      consumedAt: new Date(),
    },
  });

  const user = await prisma.user.findUnique({
    where: {
      tenantId_phone: {
        tenantId,
        phone,
      },
    },
  });

  if (!user || !user.isActive) {
    throw customError(404, "USER_NOT_REGISTERED", "User is not registered in this SNT");
  }

  return createSessionForUser(user);
};

interface LoginWithPasswordInput {
  tenantId: number;
  phone: string;
  password: string;
}

export const loginWithPassword = async ({ tenantId, phone, password }: LoginWithPasswordInput) => {
  const user = await prisma.user.findUnique({
    where: {
      tenantId_phone: {
        tenantId,
        phone,
      },
    },
  });

  if (!user || !user.isActive || !user.passwordHash) {
    throw customError(401, "INVALID_CREDENTIALS", "Invalid phone or password");
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    throw customError(401, "INVALID_CREDENTIALS", "Invalid phone or password");
  }

  return createSessionForUser(user);
};

interface ChangePasswordInput {
  tenantId: number;
  userId: number;
  currentPassword: string;
  newPassword: string;
}

export const changePassword = async ({
  tenantId,
  userId,
  currentPassword,
  newPassword,
}: ChangePasswordInput) => {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      tenantId,
    },
  });

  if (!user) {
    throw notFound("User not found");
  }

  if (!user.passwordHash) {
    throw badRequest("Password login is unavailable for this user");
  }

  const isCurrentValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!isCurrentValid) {
    throw customError(401, "INVALID_CREDENTIALS", "Current password is invalid");
  }

  const nextPasswordHash = await hashPassword(newPassword);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: nextPasswordHash,
      mustChangePassword: false,
      passwordUpdatedAt: new Date(),
    },
  });

  return updated;
};

export const rotateRefreshSession = async (refreshToken: string) => {
  const refreshHash = hashValue(refreshToken);

  const session = await prisma.userSession.findFirst({
    where: {
      refreshTokenHash: refreshHash,
      revokedAt: null,
    },
    include: {
      user: true,
    },
  });

  if (!session || session.expiresAt < new Date()) {
    throw unauthorized("Refresh token is invalid or expired");
  }

  if (!session.user.isActive) {
    throw unauthorized("User is inactive");
  }

  const nextRefreshToken = randomToken();
  const nextRefreshHash = hashValue(nextRefreshToken);

  await prisma.userSession.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: nextRefreshHash,
      expiresAt: nowPlusDays(env.refreshTokenTtlDays),
    },
  });

  const accessToken = signAccessToken({
    userId: session.user.id,
    tenantId: session.tenantId,
    role: session.user.role,
    sessionId: session.id,
  });

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    user: session.user,
    mustChangePassword: session.user.mustChangePassword,
  };
};

export const revokeSessionByRefreshToken = async (refreshToken: string) => {
  const refreshHash = hashValue(refreshToken);
  const session = await prisma.userSession.findFirst({
    where: {
      refreshTokenHash: refreshHash,
      revokedAt: null,
    },
  });

  if (!session) {
    return;
  }

  await prisma.userSession.update({
    where: { id: session.id },
    data: {
      revokedAt: new Date(),
    },
  });
};

export const revokeSessionById = async (sessionId: string) => {
  await prisma.userSession.updateMany({
    where: {
      id: sessionId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
};

export const revokeAllUserSessions = async (tenantId: number, userId: number) => {
  await prisma.userSession.updateMany({
    where: {
      tenantId,
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
};

interface RegisterTenantInput {
  tenantName: string;
  tenantSlug: string;
  location?: string;
  chairmanName: string;
  chairmanPhone: string;
  chairmanPassword: string;
}

export const registerTenantWithChairman = async ({
  tenantName,
  tenantSlug,
  location,
  chairmanName,
  chairmanPhone,
  chairmanPassword,
}: RegisterTenantInput) => {
  const existingTenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
  });

  if (existingTenant) {
    throw badRequest("tenantSlug already exists");
  }

  const passwordHash = await hashPassword(chairmanPassword);

  const tenant = await prisma.tenant.create({
    data: {
      name: tenantName,
      slug: tenantSlug,
      location,
      chatRooms: {
        create: [
          {
            name: "Общий чат",
            isPrivate: false,
          },
          {
            name: "Вопрос председателю",
            isPrivate: false,
          },
        ],
      },
      users: {
        create: {
          name: chairmanName,
          phone: chairmanPhone,
          role: UserRole.CHAIRMAN,
          passwordHash,
          mustChangePassword: false,
          passwordUpdatedAt: new Date(),
        },
      },
    },
    include: {
      users: true,
    },
  });

  const chairman = tenant.users[0];
  if (!chairman) {
    throw new Error("Chairman creation failed");
  }

  const sessionResult = await createSessionForUser(chairman);

  return {
    tenant,
    chairman,
    accessToken: sessionResult.accessToken,
    refreshToken: sessionResult.refreshToken,
    mustChangePassword: sessionResult.mustChangePassword,
  };
};
